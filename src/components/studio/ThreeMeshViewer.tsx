import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { MeshGeometry, Toolpath } from "../../lib/types";
import { defaultGalvoKinematics } from "../../lib/galvoKinematics";

interface Props {
  mesh: MeshGeometry;
  activeZ: number;
  toolpath?: Toolpath;
  progress: number | null;
  totalLayers?: number;
  currentLayerIndex?: number;
}

export default function ThreeMeshViewer({
  mesh,
  activeZ,
  toolpath,
  progress,
  totalLayers = 1,
  currentLayerIndex = 0,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({
    activeZ,
    toolpath,
    progress,
  });

  // Keep stateRef updated so render loop gets latest values without re-mounting Three.js
  useEffect(() => {
    stateRef.current = { activeZ, toolpath, progress };
  }, [activeZ, toolpath, progress]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 580;
    const height = 480;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070b12);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    const maxDim = Math.max(mesh.bounds.sizeX, mesh.bounds.sizeY, mesh.bounds.sizeZ, 30);
    const headHeight = Math.max(mesh.bounds.sizeZ + 55, 95);

    camera.position.set(maxDim * 1.5, -maxDim * 1.8, headHeight * 1.2);
    camera.up.set(0, 0, 1); // Z is vertical in SLM / metal printing

    // 2. Renderer with Local Clipping enabled
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.localClippingEnabled = true;
    container.appendChild(renderer.domElement);

    // 3. Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, Math.min(activeZ, mesh.bounds.sizeZ / 2));

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 1.4);
    dirLight1.position.set(60, -60, 120);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xf43f5e, 0.9);
    dirLight2.position.set(-60, 60, 60);
    scene.add(dirLight2);

    // Dynamic melt pool point light
    const meltLight = new THREE.PointLight(0xf59e0b, 2.8, 35);
    meltLight.position.set(0, 0, activeZ);
    scene.add(meltLight);

    // 5. Large-Format Lensless Build Plate (500mm Chamber Base)
    const gridHelper = new THREE.GridHelper(500, 25, 0x0284c7, 0x1e293b);
    gridHelper.rotation.x = Math.PI / 2;
    scene.add(gridHelper);

    // Build plate cylinder platform (500mm diameter)
    const plateGeom = new THREE.CylinderGeometry(250, 250, 4, 64);
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.8,
      roughness: 0.4,
    });
    const plateMesh = new THREE.Mesh(plateGeom, plateMat);
    plateMesh.rotation.x = Math.PI / 2;
    plateMesh.position.z = -2;
    scene.add(plateMesh);

    // 6. Geometry & Layer-by-Layer Sintered Solid Part
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    geom.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    geom.computeVertexNormals();

    // Clipping plane: Discards any geometry where z > activeZ
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), activeZ);

    // Solid fused metal material for printed layers (titanium / stainless steel finish)
    const solidMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.92,
      roughness: 0.22,
      clippingPlanes: [clipPlane],
      clipShadows: true,
      side: THREE.DoubleSide,
    });
    const solidMesh = new THREE.Mesh(geom, solidMat);
    scene.add(solidMesh);

    // 7. Ghost Silhouette for unprinted future layers
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      wireframe: true,
      transparent: true,
      opacity: 0.12,
    });
    const ghostMesh = new THREE.Mesh(geom, ghostMat);
    scene.add(ghostMesh);

    // 8. Active Sintering Powder Slice Plane
    const planeGeom = new THREE.PlaneGeometry(
      Math.max(mesh.bounds.sizeX * 1.5, 30),
      Math.max(mesh.bounds.sizeY * 1.5, 30)
    );
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
    });
    const slicePlane = new THREE.Mesh(planeGeom, planeMat);
    slicePlane.position.set(0, 0, activeZ);
    scene.add(slicePlane);

    // 9. Galvanometer Scan Head / Optical Laser Source (Fixed at top)
    const galvoHeadGroup = new THREE.Group();
    galvoHeadGroup.position.set(0, 0, headHeight);

    // Cutaway optical housing (semi-transparent smoked acrylic/aluminum)
    const housingGeom = new THREE.BoxGeometry(34, 34, 30);
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.2,
      transparent: true,
      opacity: 0.65,
      wireframe: false,
    });
    const housingMesh = new THREE.Mesh(housingGeom, housingMat);
    housingMesh.position.z = 15;
    galvoHeadGroup.add(housingMesh);

    // --- 3rd Axis: Fiber-In Linear Dynamic Focus Stage ---
    const fiberStageGroup = new THREE.Group();
    fiberStageGroup.position.set(-20, 0, 18);

    // Linear guide rails (two parallel precision ground steel rods)
    const railGeom = new THREE.CylinderGeometry(0.7, 0.7, 24, 12);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.95, roughness: 0.1 });

    const railTop = new THREE.Mesh(railGeom, railMat);
    railTop.rotation.z = Math.PI / 2;
    railTop.position.set(-20, 4, 18);
    galvoHeadGroup.add(railTop);

    const railBottom = new THREE.Mesh(railGeom, railMat);
    railBottom.rotation.z = Math.PI / 2;
    railBottom.position.set(-20, -4, 18);
    galvoHeadGroup.add(railBottom);

    // Voice Coil Motor (VCM) Stator Enclosure
    const vcmStatorGeom = new THREE.BoxGeometry(7, 12, 10);
    const vcmStatorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85 });
    const vcmStator = new THREE.Mesh(vcmStatorGeom, vcmStatorMat);
    vcmStator.position.set(-27, 0, 18);
    galvoHeadGroup.add(vcmStator);

    // Movable Carriage Block (blue anodized CNC aluminum)
    const carriageGeom = new THREE.BoxGeometry(8, 9, 8);
    const carriageMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.85, roughness: 0.3 });
    const carriageMesh = new THREE.Mesh(carriageGeom, carriageMat);
    fiberStageGroup.add(carriageMesh);

    // Collimation Lens Barrel
    const collimatorGeom = new THREE.CylinderGeometry(3.2, 3.2, 10, 16);
    const collimatorMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.95, roughness: 0.1 });
    const collimator = new THREE.Mesh(collimatorGeom, collimatorMat);
    collimator.rotation.z = Math.PI / 2;
    collimator.position.set(4, 0, 0);
    fiberStageGroup.add(collimator);

    // Armored Yellow Fiber Cable entering into the carriage
    const fiberCableGeom = new THREE.CylinderGeometry(1.8, 1.8, 14, 16);
    const fiberCableMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 });
    const fiberCable = new THREE.Mesh(fiberCableGeom, fiberCableMat);
    fiberCable.rotation.z = Math.PI / 2;
    fiberCable.position.set(-7, 0, 0);
    fiberStageGroup.add(fiberCable);

    galvoHeadGroup.add(fiberStageGroup);

    // --- Galvo Motor X & Mirror X Paddle ---
    const motorXGeom = new THREE.CylinderGeometry(5.5, 5.5, 12, 24);
    const motorMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9 });
    const motorX = new THREE.Mesh(motorXGeom, motorMat);
    motorX.position.set(0, 10, 22);
    galvoHeadGroup.add(motorX);

    // Mirror X pivot group
    const mirrorXGroup = new THREE.Group();
    mirrorXGroup.position.set(0, 0, 18);
    // Mirror paddle (dielectric coated silver facet)
    const mirrorXGeom = new THREE.BoxGeometry(1.2, 10, 12);
    const mirrorMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.98,
      roughness: 0.05,
    });
    const mirrorXMesh = new THREE.Mesh(mirrorXGeom, mirrorMat);
    mirrorXMesh.rotation.z = Math.PI / 4; // 45 deg base angle
    mirrorXGroup.add(mirrorXMesh);
    galvoHeadGroup.add(mirrorXGroup);

    // --- Galvo Motor Y & Mirror Y Paddle ---
    const motorYGeom = new THREE.CylinderGeometry(6, 6, 14, 24);
    const motorY = new THREE.Mesh(motorYGeom, motorMat);
    motorY.rotation.z = Math.PI / 2;
    motorY.position.set(12, 0, 7);
    galvoHeadGroup.add(motorY);

    // Mirror Y pivot group
    const mirrorYGroup = new THREE.Group();
    mirrorYGroup.position.set(0, 0, 7);
    // Mirror Y paddle (slightly larger to accept deflected beam)
    const mirrorYGeom = new THREE.BoxGeometry(12, 1.2, 14);
    const mirrorYMesh = new THREE.Mesh(mirrorYGeom, mirrorMat);
    mirrorYMesh.rotation.x = Math.PI / 4; // 45 deg base angle
    mirrorYGroup.add(mirrorYMesh);
    galvoHeadGroup.add(mirrorYGroup);

    // Lensless Open Exit Collar / Gas-Purge Nozzle (No F-Theta Lens)
    const nozzleGeom = new THREE.CylinderGeometry(14, 15, 8, 32, 1, true); // Open hollow cylinder
    const nozzleMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.9,
      roughness: 0.2,
      side: THREE.DoubleSide,
    });
    const nozzleMesh = new THREE.Mesh(nozzleGeom, nozzleMat);
    nozzleMesh.rotation.x = Math.PI / 2;
    nozzleMesh.position.z = 2;
    galvoHeadGroup.add(nozzleMesh);

    // Protective Gas Purge Knife Flange Ring (Lens-Free Optical Exit)
    const flangeGeom = new THREE.RingGeometry(11, 15, 32);
    const flangeMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      metalness: 0.8,
      side: THREE.DoubleSide,
    });
    const flangeMesh = new THREE.Mesh(flangeGeom, flangeMat);
    flangeMesh.position.z = -1;
    galvoHeadGroup.add(flangeMesh);

    scene.add(galvoHeadGroup);

    // 10. Complete Multi-Segment Optical Ray Tracing
    // Segments: Collimator -> Mirror X -> Mirror Y -> Lens -> Powder Bed Target
    const rayPositions = new Float32Array([
      -20, 0, headHeight + 18, // Collimator exit
      0, 0, headHeight + 18,   // Mirror X
      0, 0, headHeight + 7,    // Mirror Y
      0, 0, headHeight,        // Lens entrance
      0, 0, activeZ,           // Bed focus spot
    ]);
    const rayGeom = new THREE.BufferGeometry();
    rayGeom.setAttribute("position", new THREE.BufferAttribute(rayPositions, 3));

    const rayCoreMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 3,
      transparent: true,
      opacity: 0.95,
    });
    const rayCore = new THREE.Line(rayGeom, rayCoreMat);
    scene.add(rayCore);

    const raySheathMat = new THREE.LineBasicMaterial({
      color: 0xf43f5e,
      linewidth: 6,
      transparent: true,
      opacity: 0.75,
    });
    const raySheath = new THREE.Line(rayGeom, raySheathMat);
    scene.add(raySheath);

    // 11. Molten Melt Pool & Thermal Glow at laser spot
    const meltPoolGeom = new THREE.CircleGeometry(2.5, 24);
    const meltPoolMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });
    const meltPool = new THREE.Mesh(meltPoolGeom, meltPoolMat);
    meltPool.position.set(0, 0, activeZ + 0.05);
    scene.add(meltPool);

    // Spark / plasma corona ring
    const coronaGeom = new THREE.RingGeometry(2.2, 5.5, 24);
    const coronaMat = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
    });
    const corona = new THREE.Mesh(coronaGeom, coronaMat);
    corona.position.set(0, 0, activeZ + 0.06);
    scene.add(corona);

    // Animation & render loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();

      const { activeZ: curZ, toolpath: curTp, progress: curProg } = stateRef.current;

      // Update clipping plane to show only printed layers up to curZ
      clipPlane.constant = curZ;
      slicePlane.position.z = curZ;

      // Compute current 3D laser spot position along the toolpath
      const laserPos = getLaserSpot(curTp, curProg);
      const targetX = laserPos.x;
      const targetY = laserPos.y;
      const isJump = laserPos.isJump;
      const isFiring = curProg !== null && !isJump;

      // Calculate 3-Axis state: theta_x, theta_y, and zLinearMm
      const axisState = defaultGalvoKinematics.xyToMirrorAngles(targetX, targetY, curZ);

      // Rotate Physical 3D Mirrors inside the Galvo Scan Head (Axis 1 & 2)
      mirrorXGroup.rotation.y = axisState.thetaXRad;
      mirrorYGroup.rotation.x = axisState.thetaYRad;

      // Translate Physical Fiber-In Dynamic Focus Stage (Axis 3)
      const fiberX = -20 + axisState.zLinearMm * 0.8;
      fiberStageGroup.position.x = fiberX;

      // Update Optical Ray Trace endpoints:
      // P0: Moving Fiber-In Collimator Exit (fiberX + 7, 0, headHeight + 18)
      // P1: Mirror X (0, 0, headHeight + 18)
      // P2: Mirror Y (0, 0, headHeight + 7)
      // P3: Lens (targetX * 0.06, targetY * 0.06, headHeight)
      // P4: Powder Bed (targetX, targetY, curZ)
      const posAttr = rayGeom.getAttribute("position") as THREE.BufferAttribute;
      posAttr.setXYZ(0, fiberX + 7, 0, headHeight + 18);
      posAttr.setXYZ(1, 0, 0, headHeight + 18);
      posAttr.setXYZ(2, 0, 0, headHeight + 7);
      posAttr.setXYZ(3, targetX * 0.06, targetY * 0.06, headHeight);
      posAttr.setXYZ(4, targetX, targetY, curZ);
      posAttr.needsUpdate = true;

      if (isFiring) {
        // High power 10 kW laser firing
        rayCore.visible = true;
        raySheath.visible = true;
        meltPool.visible = true;
        corona.visible = true;
        meltLight.visible = true;

        meltPool.position.set(targetX, targetY, curZ + 0.05);
        corona.position.set(targetX, targetY, curZ + 0.06);
        meltLight.position.set(targetX, targetY, curZ + 4);

        // Pulse corona slightly
        const scale = 1 + Math.sin(Date.now() * 0.02) * 0.15;
        corona.scale.set(scale, scale, 1);
      } else if (curProg !== null && isJump) {
        // Galvo repositioning jump: laser OFF
        rayCore.visible = false;
        raySheath.visible = false;
        meltPool.visible = false;
        corona.visible = false;
        meltLight.visible = false;
      } else {
        // Idling or full path view: park laser beam softly at center
        rayCore.visible = false;
        raySheath.visible = false;
        meltPool.visible = false;
        corona.visible = false;
        meltLight.visible = false;
      }

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animId);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [mesh]);

  const pct = totalLayers > 0 ? Math.round(((currentLayerIndex + 1) / totalLayers) * 100) : 0;
  const activeSpot = getLaserSpot(toolpath, progress);
  const liveAngles = defaultGalvoKinematics.xyToMirrorAngles(activeSpot.x, activeSpot.y, activeZ);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-[#070b12] shadow-2xl">
      {/* Top Overlay Badge */}
      <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2 rounded-lg bg-black/75 px-3 py-1.5 text-xs text-slate-200 backdrop-blur border border-white/10">
        <span className="flex h-2.5 w-2.5 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
        </span>
        <span className="font-semibold text-white">3D Chamber (Lensless 500mm)</span>
        <span className="text-slate-500">|</span>
        <span className="font-mono text-cyan-300">
          Layer {currentLayerIndex + 1}/{totalLayers} ({pct}%)
        </span>
        <span className="text-slate-500">|</span>
        <span className="font-mono text-amber-300">Z: {activeZ.toFixed(3)}mm</span>
      </div>

      {/* Live 3-Axis Telemetry Badge (Top Right) */}
      <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-1 rounded-lg bg-black/80 px-3 py-1.5 text-xs backdrop-blur border border-white/10 font-mono">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              progress !== null && !activeSpot.isJump ? "bg-rose-500 animate-pulse" : "bg-emerald-400"
            }`}
          />
          <span className="text-[11px] font-sans text-slate-300">
            {progress !== null && !activeSpot.isJump ? "Laser Sintering (10 kW)" : "Lens-Free 3D Scan Head"}
          </span>
        </div>
        <div className="text-[10px] text-cyan-300">
          θx: {liveAngles.thetaXDeg > 0 ? `+${liveAngles.thetaXDeg}°` : `${liveAngles.thetaXDeg}°`} | θy:{" "}
          {liveAngles.thetaYDeg > 0 ? `+${liveAngles.thetaYDeg}°` : `${liveAngles.thetaYDeg}°`}
        </div>
        <div className="text-[10px] text-amber-300">
          Fiber Z_lin: {liveAngles.zLinearMm > 0 ? `+${liveAngles.zLinearMm}` : `${liveAngles.zLinearMm}`}mm (Spot: {liveAngles.spotDiameterUm}µm)
        </div>
      </div>

      {/* Bottom Progress Bar */}
      <div className="absolute bottom-3 left-3 right-3 z-10 rounded-lg bg-black/70 p-2.5 backdrop-blur border border-white/10">
        <div className="flex justify-between text-[11px] text-slate-300 mb-1">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-cyan-400" /> Solid Fused Part Growth
          </span>
          <span className="font-mono text-cyan-300">{pct}% Complete</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 via-blue-500 to-rose-500 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div ref={mountRef} className="h-[480px] w-full" />
    </div>
  );
}

function getLaserSpot(
  toolpath: Toolpath | undefined,
  progress: number | null
): { x: number; y: number; isJump: boolean } {
  if (!toolpath || !toolpath.segments.length || progress === null) {
    return { x: 0, y: 0, isJump: true };
  }

  let totalLen = 0;
  for (const seg of toolpath.segments) {
    for (let i = 0; i + 1 < seg.points.length; i++) {
      totalLen += Math.hypot(
        seg.points[i + 1].x - seg.points[i].x,
        seg.points[i + 1].y - seg.points[i].y
      );
    }
  }

  const targetDist = Math.max(0, Math.min(1, progress)) * totalLen;
  let acc = 0;

  for (const seg of toolpath.segments) {
    for (let i = 0; i + 1 < seg.points.length; i++) {
      const a = seg.points[i];
      const b = seg.points[i + 1];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (acc + segLen >= targetDist) {
        const t = segLen > 0 ? (targetDist - acc) / segLen : 0;
        return {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          isJump: seg.isJump,
        };
      }
      acc += segLen;
    }
  }

  const lastSeg = toolpath.segments[toolpath.segments.length - 1];
  const lastPt = lastSeg.points[lastSeg.points.length - 1];
  return { x: lastPt.x, y: lastPt.y, isJump: lastSeg.isJump };
}
