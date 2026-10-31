import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  PROTOTYPE_CAD_PARTS,
  type CadPartSpec,
  type SubsystemCategory,
} from '../data/prototypeCadData';
import {
  computeStepperGalvoKinematics,
  type CalibrationParams,
  type OptimizedPathResult,
} from '../utils/galvoMath';
import {
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Download,
  MoveHorizontal,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';

interface CadViewport3DProps {
  calibration: CalibrationParams;
  optimizedPath: OptimizedPathResult;
  selectedPartId: string;
  onSelectPart: (id: string) => void;
  onDownloadScad: () => void;
  onDownloadStl: (partId: string) => void;
}

type CameraPreset = 'isometric' | 'optics' | 'electronics' | 'bed';

const CAMERA_PRESETS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number]; label: string }
> = {
  isometric: {
    pos: [10.5, 8.2, 11.5],
    target: [0, 2.6, 0],
    label: 'Isometric Rig',
  },
  optics: {
    pos: [3.8, 7.2, 4.8],
    target: [0, 5.5, 1.1],
    label: 'Linear Laser & Galvo',
  },
  electronics: {
    pos: [-7.2, 3.8, 6.2],
    target: [-2.8, 1.4, 0.5],
    label: 'Arduino + CNC Shield',
  },
  bed: {
    pos: [3.2, 3.8, 6.4],
    target: [0, 2.0, -0.3],
    label: 'Descending Z-Bed',
  },
};

function createBedGridTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 1024, 1024);

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 8;
  ctx.strokeRect(32, 32, 960, 960);

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
  ctx.lineWidth = 1.5;
  const step = 960 / 20;
  for (let i = 0; i <= 20; i++) {
    const p = 32 + i * step;
    ctx.beginPath();
    ctx.moveTo(p, 32);
    ctx.lineTo(p, 992);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(32, p);
    ctx.lineTo(992, p);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(6, 182, 212, 0.45)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(512, 32);
  ctx.lineTo(512, 992);
  ctx.moveTo(32, 512);
  ctx.lineTo(992, 512);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(244, 63, 94, 0.35)';
  ctx.lineWidth = 2.5;
  [160, 320, 440].forEach((r) => {
    ctx.beginPath();
    ctx.arc(512, 512, r, 0, Math.PI * 2);
    ctx.stroke();
  });

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 22px "JetBrains Mono", monospace';
  ctx.fillText('DESCENDING Z-BED PLATFORM (100x100mm)', 52, 72);
  ctx.fillText('+Y', 524, 68);
  ctx.fillText('+X', 940, 502);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export const CadViewport3D: React.FC<CadViewport3DProps> = ({
  calibration,
  optimizedPath,
  selectedPartId,
  onSelectPart,
  onDownloadScad,
  onDownloadStl,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  const [explodedPct, setExplodedPct] = useState<number>(0);
  const [subsystemFilter, setSubsystemFilter] = useState<SubsystemCategory>('all');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('isometric');
  const [isTracing, setIsTracing] = useState<boolean>(true);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [showInspector, setShowInspector] = useState<boolean>(true);

  // New controls for Linear Laser Focus Stroke and Descending Z-Bed Platform
  const [autoDynamicFocus, setAutoDynamicFocus] = useState<boolean>(true);
  const [manualFocusMm, setManualFocusMm] = useState<number>(0);
  const [bedDropMm, setBedDropMm] = useState<number>(0);
  const [currentLayerNum, setCurrentLayerNum] = useState<number>(1);

  const [liveKinematics, setLiveKinematics] = useState(() =>
    computeStepperGalvoKinematics(
      18,
      -12,
      calibration.workingDistanceMm,
      calibration.stepperMode,
      0
    )
  );

  // Mutable refs for animation loop without tearing down WebGL context
  const stateRef = useRef({
    explodedTarget: 0,
    explodedCurrent: 0,
    subsystemFilter: 'all' as SubsystemCategory,
    selectedPartId,
    isTracing: true,
    autoDynamicFocus: true,
    manualFocusMm: 0,
    bedDropTargetMm: 0,
    bedDropCurrentMm: 0,
    currentLayerNum: 1,
    calibration,
    optimizedPath,
    cameraPreset: null as CameraPreset | null,
    onSelectPart,
  });

  useEffect(() => {
    stateRef.current.explodedTarget = explodedPct / 100;
    stateRef.current.subsystemFilter = subsystemFilter;
    stateRef.current.selectedPartId = selectedPartId;
    stateRef.current.isTracing = isTracing;
    stateRef.current.autoDynamicFocus = autoDynamicFocus;
    stateRef.current.manualFocusMm = manualFocusMm;
    stateRef.current.bedDropTargetMm = bedDropMm;
    stateRef.current.currentLayerNum = currentLayerNum;
    stateRef.current.calibration = calibration;
    stateRef.current.optimizedPath = optimizedPath;
    stateRef.current.onSelectPart = onSelectPart;
  }, [
    explodedPct,
    subsystemFilter,
    selectedPartId,
    isTracing,
    autoDynamicFocus,
    manualFocusMm,
    bedDropMm,
    currentLayerNum,
    calibration,
    optimizedPath,
    onSelectPart,
  ]);

  // Keyboard shortcut 'H' to toggle HUD dock
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    // 1. Software WebGL detection
    const isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || 1200;
    const height = container.clientHeight || 720;

    const scene = new THREE.Scene();
    const bgHex = 0x090d16;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, 0.022);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 120);
    camera.position.set(...CAMERA_PRESETS.isometric.pos);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Studio Environment Map (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 3-Point Warm/Cool Studio Lighting
    const hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x1e293b, 0.85);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.2);
    keyLight.position.set(8, 14, 9);
    keyLight.castShadow = !isSoftwareGl;
    if (!isSoftwareGl) {
      keyLight.shadow.mapSize.width = 1024;
      keyLight.shadow.mapSize.height = 1024;
      const d = 7;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 30;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.15);
    rimLight.position.set(-9, 8, -8);
    scene.add(rimLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.target.set(...CAMERA_PRESETS.isometric.target);
    controls.minDistance = 4;
    controls.maxDistance = 26;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.update();

    const handleControlsStart = () => {
      stateRef.current.cameraPreset = null;
    };
    controls.addEventListener('start', handleControlsStart);

    // Ground & Contact Shadow Disc
    const floorGroup = new THREE.Group();
    const floorGeo = new THREE.PlaneGeometry(40, 40);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0b1120,
      roughness: 0.88,
      metalness: 0.15,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0;
    floorMesh.receiveShadow = true;
    floorGroup.add(floorMesh);

    const gridHelper = new THREE.GridHelper(28, 28, 0x1e3a8a, 0x172554);
    gridHelper.position.y = 0.015;
    floorGroup.add(gridHelper);

    const contactGeo = new THREE.CircleGeometry(5.5, 48);
    const contactMat = new THREE.MeshBasicMaterial({
      color: 0x020617,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const contactDisc = new THREE.Mesh(contactGeo, contactMat);
    contactDisc.rotation.x = -Math.PI / 2;
    contactDisc.position.y = 0.02;
    floorGroup.add(contactDisc);
    scene.add(floorGroup);

    // Shared PBR Materials Library
    const mats = {
      aluminumExtrusion: new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        metalness: 0.82,
        roughness: 0.28,
      }),
      anodizedBlack: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.45,
        roughness: 0.62,
      }),
      petgTealPrinted: new THREE.MeshStandardMaterial({
        color: 0x0891b2,
        metalness: 0.12,
        roughness: 0.52,
      }),
      plaOrangeBracket: new THREE.MeshStandardMaterial({
        color: 0xea580c,
        metalness: 0.1,
        roughness: 0.58,
      }),
      brassLaser: new THREE.MeshStandardMaterial({
        color: 0xeab308,
        metalness: 0.9,
        roughness: 0.2,
      }),
      chromeRod: new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        metalness: 0.96,
        roughness: 0.1,
      }),
      firstSurfaceMirror: new THREE.MeshPhysicalMaterial({
        color: 0xe2e8f0,
        metalness: 0.98,
        roughness: 0.04,
        clearcoat: 1.0,
      }),
      arduinoBluePcb: new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        metalness: 0.2,
        roughness: 0.45,
      }),
      cncShieldRedPcb: new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        metalness: 0.22,
        roughness: 0.48,
      }),
      darkChip: new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        metalness: 0.2,
        roughness: 0.75,
      }),
      curedResinLayer: new THREE.MeshStandardMaterial({
        color: 0xf43f5e,
        emissive: 0x881337,
        emissiveIntensity: 0.35,
        roughness: 0.3,
        metalness: 0.1,
      }),
    };

    const partGroups = new Map<
      string,
      {
        group: THREE.Group;
        basePos: THREE.Vector3;
        explodeVec: THREE.Vector3;
        subsystem: Exclude<SubsystemCategory, 'all'>;
      }
    >();
    const interactableMeshes: THREE.Object3D[] = [];

    const registerPartGroup = (part: CadPartSpec, group: THREE.Group) => {
      group.userData.partId = part.id;
      group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.userData.partId = part.id;
          child.castShadow = !isSoftwareGl;
          child.receiveShadow = !isSoftwareGl;
          interactableMeshes.push(child);
        }
      });
      partGroups.set(part.id, {
        group,
        basePos: group.position.clone(),
        explodeVec: new THREE.Vector3(...part.explodeVector),
        subsystem: part.subsystem,
      });
      scene.add(group);
    };

    const createStepperMotorMesh = (scale = 1.0) => {
      const motor = new THREE.Group();
      const endCapGeo = new THREE.BoxGeometry(1.1 * scale, 0.22 * scale, 1.1 * scale);
      const frontCap = new THREE.Mesh(endCapGeo, mats.aluminumExtrusion);
      frontCap.position.y = 0.42 * scale;
      const rearCap = new THREE.Mesh(endCapGeo, mats.aluminumExtrusion);
      rearCap.position.y = -0.42 * scale;
      const statorGeo = new THREE.BoxGeometry(1.06 * scale, 0.64 * scale, 1.06 * scale);
      const stator = new THREE.Mesh(statorGeo, mats.anodizedBlack);
      const bossGeo = new THREE.CylinderGeometry(0.28 * scale, 0.28 * scale, 0.08 * scale, 24);
      const boss = new THREE.Mesh(bossGeo, mats.aluminumExtrusion);
      boss.position.y = 0.56 * scale;
      const boltGeo = new THREE.CylinderGeometry(0.04 * scale, 0.04 * scale, 0.08 * scale, 12);
      [-0.4 * scale, 0.4 * scale].forEach((bx) => {
        [-0.4 * scale, 0.4 * scale].forEach((bz) => {
          const bolt = new THREE.Mesh(boltGeo, mats.chromeRod);
          bolt.position.set(bx, 0.56 * scale, bz);
          motor.add(bolt);
        });
      });
      const conn = new THREE.Mesh(
        new THREE.BoxGeometry(0.36 * scale, 0.18 * scale, 0.16 * scale),
        mats.chromeRod
      );
      conn.position.set(0, -0.35 * scale, 0.58 * scale);

      motor.add(frontCap, rearCap, stator, boss, conn);
      return motor;
    };

    // PART 1: 2020 Aluminum Extrusion Portal Frame & 3D-Printed Upper Bridge ('frame-gantry')
    const framePart = PROTOTYPE_CAD_PARTS.find((p) => p.id === 'frame-gantry')!;
    const frameGroup = new THREE.Group();
    const colPositions: [number, number][] = [
      [-2.3, -2.1],
      [2.3, -2.1],
      [-2.3, 2.1],
      [2.3, 2.1],
    ];
    const colGeo = new THREE.BoxGeometry(0.26, 6.4, 0.26);
    colPositions.forEach(([cx, cz]) => {
      const col = new THREE.Mesh(colGeo, mats.aluminumExtrusion);
      col.position.set(cx, 3.2, cz);
      frameGroup.add(col);
      const foot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.26, 0.14, 16),
        mats.anodizedBlack
      );
      foot.position.set(cx, 0.07, cz);
      frameGroup.add(foot);
      const gusset = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), mats.petgTealPrinted);
      gusset.position.set(cx, 6.25, cz);
      frameGroup.add(gusset);
    });
    const beamXGeo = new THREE.BoxGeometry(4.86, 0.26, 0.26);
    const beamZGeo = new THREE.BoxGeometry(0.26, 0.26, 4.2);
    [-2.1, 2.1].forEach((cz) => {
      const topX = new THREE.Mesh(beamXGeo, mats.aluminumExtrusion);
      topX.position.set(0, 6.3, cz);
      const botX = new THREE.Mesh(beamXGeo, mats.aluminumExtrusion);
      botX.position.set(0, 0.22, cz);
      frameGroup.add(topX, botX);
    });
    [-2.3, 2.3].forEach((cx) => {
      const topZ = new THREE.Mesh(beamZGeo, mats.aluminumExtrusion);
      topZ.position.set(cx, 6.3, 0);
      const botZ = new THREE.Mesh(beamZGeo, mats.aluminumExtrusion);
      botZ.position.set(cx, 0.22, 0);
      frameGroup.add(topZ, botZ);
    });
    const bridgePlate = new THREE.Mesh(
      new THREE.BoxGeometry(4.7, 0.22, 3.4),
      mats.petgTealPrinted
    );
    bridgePlate.position.set(0, 6.45, 0.35);
    frameGroup.add(bridgePlate);
    registerPartGroup(framePart, frameGroup);

    // Optical Geometry Pivot Coordinates:
    const xMirrorPivotPos = new THREE.Vector3(0, 5.55, 0.35);
    const yMirrorPivotPos = new THREE.Vector3(0, 5.15, -0.35);
    // Bed starts at top position y = 2.65 and moves DOWN toward y = 0.85 as layers print!
    const initialBedTopY = 2.65;

    // PART 2: 5mW 650nm Kids Laser + Motorized Linear Focus Stage ('laser-module')
    const laserPart = PROTOTYPE_CAD_PARTS.find((p) => p.id === 'laser-module')!;
    const laserGroup = new THREE.Group();

    // 2A. Stationary Linear Focus Stage Frame (mounted under the top optical bridge)
    const focusRearBlock = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.55, 0.22),
      mats.plaOrangeBracket
    );
    focusRearBlock.position.set(0, 6.1, 2.35);

    const focusFrontBlock = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.55, 0.2),
      mats.plaOrangeBracket
    );
    focusFrontBlock.position.set(0, 6.1, 0.92);

    // Mini Stepper Motor driving the Linear Focus Stage (A-Axis on CNC Shield)
    const focusStepper = createStepperMotorMesh(0.58);
    focusStepper.rotation.x = -Math.PI / 2;
    focusStepper.position.set(0, 6.08, 2.75);

    // Dual Ø4mm Chrome Linear Guide Rails + Rotating Brass M4 Leadscrew along Z-axis
    const railGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.45, 14);
    railGeo.rotateX(Math.PI / 2);
    [-0.38, 0.38].forEach((rx) => {
      const rail = new THREE.Mesh(railGeo, mats.chromeRod);
      rail.position.set(rx, 6.05, 1.63);
      laserGroup.add(rail);
    });

    const focusLeadscrewGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.45, 16);
    focusLeadscrewGeo.rotateX(Math.PI / 2);
    const focusLeadscrew = new THREE.Mesh(focusLeadscrewGeo, mats.brassLaser);
    focusLeadscrew.position.set(0, 6.08, 1.63);

    // 2B. Moving Linear Laser Focus Carriage (slides linearly along Z axis for dynamic focus Δz!)
    const laserSlidingCarriage = new THREE.Group();
    laserSlidingCarriage.position.set(0, 0, 0);

    const clampBody = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.85, 0.65), mats.petgTealPrinted);
    clampBody.position.set(0, 5.78, 1.65);

    // Brass leadscrew nut on top of sliding carriage
    const focusNut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.25, 16).rotateX(Math.PI / 2),
      mats.brassLaser
    );
    focusNut.position.set(0, 6.08, 1.65);

    // Brass 12mm laser diode barrel
    const barrelGeo = new THREE.CylinderGeometry(0.22, 0.22, 1.05, 28);
    barrelGeo.rotateX(Math.PI / 2);
    const laserBarrel = new THREE.Mesh(barrelGeo, mats.brassLaser);
    laserBarrel.position.set(0, 5.55, 1.65);

    // Focusing Collimator Lens Ring at front of sliding carriage
    const ringGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.22, 24);
    ringGeo.rotateX(Math.PI / 2);
    const focusRing = new THREE.Mesh(ringGeo, mats.anodizedBlack);
    focusRing.position.set(0, 5.55, 1.08);

    // Glowing 650nm aperture lens
    const emitterMat = new THREE.MeshBasicMaterial({ color: 0xff2244 });
    const emitterLens = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), emitterMat);
    emitterLens.position.set(0, 5.55, 0.95);

    laserSlidingCarriage.add(clampBody, focusNut, laserBarrel, focusRing, emitterLens);
    laserGroup.add(
      focusRearBlock,
      focusFrontBlock,
      focusStepper,
      focusLeadscrew,
      laserSlidingCarriage
    );
    registerPartGroup(laserPart, laserGroup);

    // PART 3: X-Axis Stepper Galvo Actuator & Mirror X ('stepper-x')
    const stepperXPart = PROTOTYPE_CAD_PARTS.find((p) => p.id === 'stepper-x')!;
    const stepperXGroup = new THREE.Group();
    const xBracket = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.15, 1.3), mats.plaOrangeBracket);
    xBracket.position.set(-0.62, 5.85, 0.35);
    const xMotor = createStepperMotorMesh();
    xMotor.rotation.z = -Math.PI / 2;
    xMotor.position.set(-1.25, 5.55, 0.35);
    const xRotorPivot = new THREE.Group();
    xRotorPivot.position.copy(xMirrorPivotPos);
    const xShaftGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.72, 16);
    xShaftGeo.rotateZ(Math.PI / 2);
    const xShaft = new THREE.Mesh(xShaftGeo, mats.chromeRod);
    xShaft.position.set(-0.34, 0, 0);
    const xHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.24, 20),
      mats.petgTealPrinted
    );
    xHub.rotation.z = Math.PI / 2;
    const xMirrorPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.52, 0.05),
      mats.firstSurfaceMirror
    );
    xMirrorPlate.rotation.x = Math.PI / 4;
    xRotorPivot.add(xShaft, xHub, xMirrorPlate);
    stepperXGroup.add(xBracket, xMotor, xRotorPivot);
    registerPartGroup(stepperXPart, stepperXGroup);

    // PART 4: Y-Axis Orthogonal Stepper Galvo & Mirror Y ('stepper-y')
    const stepperYPart = PROTOTYPE_CAD_PARTS.find((p) => p.id === 'stepper-y')!;
    const stepperYGroup = new THREE.Group();
    const yBracket = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.35, 0.25), mats.plaOrangeBracket);
    yBracket.position.set(0, 5.65, -0.95);
    const yMotor = createStepperMotorMesh();
    yMotor.rotation.x = Math.PI / 2;
    yMotor.position.set(0, 5.15, -1.55);
    const yRotorPivot = new THREE.Group();
    yRotorPivot.position.copy(yMirrorPivotPos);
    const yShaftGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.72, 16);
    yShaftGeo.rotateX(Math.PI / 2);
    const yShaft = new THREE.Mesh(yShaftGeo, mats.chromeRod);
    yShaft.position.set(0, 0, -0.34);
    const yHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.24, 20),
      mats.petgTealPrinted
    );
    yHub.rotation.x = Math.PI / 2;
    const yMirrorPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.52, 0.05),
      mats.firstSurfaceMirror
    );
    yMirrorPlate.rotation.x = -Math.PI / 4;
    yRotorPivot.add(yShaft, yHub, yMirrorPlate);
    stepperYGroup.add(yBracket, yMotor, yRotorPivot);
    registerPartGroup(stepperYPart, stepperYGroup);

    // PART 5: Z-Axis T8 Leadscrew Elevator & Descending Build Platform ('z-stage-bed')
    const zBedPart = PROTOTYPE_CAD_PARTS.find((p) => p.id === 'z-stage-bed')!;
    const zBedGroup = new THREE.Group();

    // 5A. Stationary Z-Motor, Vertical T8 Leadscrew, and Dual Ø8mm Linear Guide Rods
    const zMotor = createStepperMotorMesh();
    zMotor.position.set(0, 0.65, -1.55);
    const leadscrew = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 3.6, 20),
      mats.brassLaser
    );
    leadscrew.position.set(0, 2.45, -1.55);
    [-0.75, 0.75].forEach((rx) => {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.8, 16), mats.chromeRod);
      rod.position.set(rx, 2.35, -1.55);
      zBedGroup.add(rod);
    });

    // 5B. Descending Z-Bed Elevator Carriage (moves DOWN along -Y as layers print!)
    const zBedDescendingCarriage = new THREE.Group();
    [-0.75, 0.75].forEach((rx) => {
      const bearing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.45, 16),
        mats.aluminumExtrusion
      );
      bearing.position.set(rx, initialBedTopY - 0.1, -1.55);
      zBedDescendingCarriage.add(bearing);
    });
    const t8BrassNut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.28, 16),
      mats.brassLaser
    );
    t8BrassNut.position.set(0, initialBedTopY - 0.1, -1.55);

    const bedSupportArm = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.22, 1.8),
      mats.petgTealPrinted
    );
    bedSupportArm.position.set(0, initialBedTopY - 0.17, -0.8);

    const bedTex = createBedGridTexture(renderer.capabilities.getMaxAnisotropy());
    const bedPlateMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: bedTex,
      roughness: 0.42,
      metalness: 0.18,
    });
    const bedPlate = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 3.2), bedPlateMat);
    bedPlate.position.set(0, initialBedTopY - 0.06, 0);

    // 3D Printed Part Stack growing on the descending bed
    const printedStackMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.65, 1.0, 24),
      mats.curedResinLayer
    );
    printedStackMesh.position.set(0, initialBedTopY + 0.02, 0);
    printedStackMesh.scale.y = 0.01;
    printedStackMesh.visible = false;

    zBedDescendingCarriage.add(t8BrassNut, bedSupportArm, bedPlate, printedStackMesh);
    zBedGroup.add(zMotor, leadscrew, zBedDescendingCarriage);
    registerPartGroup(zBedPart, zBedGroup);

    // PART 6: Arduino Uno R3 + CNC Shield V3 Electronics Bay ('arduino-controller')
    const arduinoPart = PROTOTYPE_CAD_PARTS.find((p) => p.id === 'arduino-controller')!;
    const arduinoGroup = new THREE.Group();
    const pcbTray = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.14, 2.55), mats.petgTealPrinted);
    pcbTray.position.set(-3.35, 0.95, 0.2);
    const unoPcb = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.08, 2.25), mats.arduinoBluePcb);
    unoPcb.position.set(-3.35, 1.08, 0.2);
    const usbPort = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.32, 0.48), mats.chromeRod);
    usbPort.position.set(-3.65, 1.26, 1.18);
    const dcJack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.3, 0.44), mats.darkChip);
    dcJack.position.set(-2.95, 1.25, 1.18);
    const cncPcb = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 1.95), mats.cncShieldRedPcb);
    cncPcb.position.set(-3.35, 1.38, 0.1);
    // 4x A4988 Stepper Driver Carriers (X, Y, Z-Bed, A-Focus)
    [-0.65, -0.22, 0.22, 0.65].forEach((dz) => {
      const driverBoard = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.08, 0.34),
        mats.petgTealPrinted
      );
      driverBoard.position.set(-3.55, 1.48, dz);
      const heatsink = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.24, 0.28),
        mats.aluminumExtrusion
      );
      heatsink.position.set(-3.55, 1.62, dz);
      arduinoGroup.add(driverBoard, heatsink);
    });
    arduinoGroup.add(pcbTray, unoPcb, usbPort, dcJack, cncPcb);
    registerPartGroup(arduinoPart, arduinoGroup);

    // Dynamic 650nm Red Laser Ray-Tracing Beam & Bed Toolpath Trace
    const laserBeamMat = new THREE.LineBasicMaterial({
      color: 0xff1e42,
      linewidth: 2,
    });
    const laserBeamPositions = new Float32Array(4 * 3);
    const laserBeamGeo = new THREE.BufferGeometry();
    laserBeamGeo.setAttribute('position', new THREE.BufferAttribute(laserBeamPositions, 3));
    const laserBeamLine = new THREE.Line(laserBeamGeo, laserBeamMat);
    scene.add(laserBeamLine);

    // Glowing Laser Spot on Target Bed
    const laserSpotGroup = new THREE.Group();
    const spotCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    const spotHalo = new THREE.Mesh(
      new THREE.CircleGeometry(0.22, 24),
      new THREE.MeshBasicMaterial({
        color: 0xff1e42,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      })
    );
    spotHalo.rotation.x = -Math.PI / 2;
    spotHalo.position.y = 0.01;
    laserSpotGroup.add(spotCore, spotHalo);
    scene.add(laserSpotGroup);

    // Traced Vector Path on 3D Bed
    const traceLineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
    });
    const traceGeo = new THREE.BufferGeometry();
    const maxTracePts = 600;
    const tracePositions = new Float32Array(maxTracePts * 3);
    traceGeo.setAttribute('position', new THREE.BufferAttribute(tracePositions, 3));
    const traceSegmentsMesh = new THREE.LineSegments(traceGeo, traceLineMat);
    scene.add(traceSegmentsMesh);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Raycasting on click for interactive CAD part selection
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(interactableMeshes, false);
      if (hits.length > 0) {
        const hitPartId = hits[0].object.userData.partId;
        if (hitPartId) {
          stateRef.current.onSelectPart(hitPartId);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 1200;
      const h = container.clientHeight || 720;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Pre-allocated scratch vectors
    const _targetVec = new THREE.Vector3();
    const _camPosTarget = new THREE.Vector3();
    const _camLookTarget = new THREE.Vector3();
    const _laserOrigin = new THREE.Vector3();
    const _xMirrorWorld = new THREE.Vector3();
    const _yMirrorWorld = new THREE.Vector3();

    let frameId = 0;
    let lastTime = performance.now();
    let lastHudUpdate = 0;
    let traceCursor = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      const st = stateRef.current;

      // 1. Smoothly damp exploded view separation
      st.explodedCurrent = THREE.MathUtils.damp(st.explodedCurrent, st.explodedTarget, 6.5, dt);

      partGroups.forEach((entry) => {
        _targetVec
          .copy(entry.basePos)
          .addScaledVector(entry.explodeVec, st.explodedCurrent);
        entry.group.position.copy(_targetVec);

        const isVisible =
          st.subsystemFilter === 'all' || entry.subsystem === st.subsystemFilter;
        entry.group.visible = isVisible;
      });

      // 2. Smooth camera preset transitions
      if (st.cameraPreset) {
        const preset = CAMERA_PRESETS[st.cameraPreset];
        _camPosTarget.set(...preset.pos);
        _camLookTarget.set(...preset.target);
        const alpha = 1 - Math.exp(-6.0 * dt);
        camera.position.lerp(_camPosTarget, alpha);
        controls.target.lerp(_camLookTarget, alpha);
        if (camera.position.distanceTo(_camPosTarget) < 0.05) {
          st.cameraPreset = null;
        }
      }
      controls.update();

      // 3. Advance 3D Toolpath Scan & Automatic Layer-by-Layer Bed Descent
      const segs = st.optimizedPath.segments;
      const scaleMmToWorld = 3.0 / Math.max(40, st.calibration.fieldSizeMm);

      const count = Math.min(segs.length, maxTracePts / 2);
      for (let i = 0; i < count; i++) {
        const s = segs[i];
        tracePositions[i * 6 + 0] = s.start.x * scaleMmToWorld;
        tracePositions[i * 6 + 1] = 0;
        tracePositions[i * 6 + 2] = -s.start.y * scaleMmToWorld;

        tracePositions[i * 6 + 3] = s.end.x * scaleMmToWorld;
        tracePositions[i * 6 + 4] = 0;
        tracePositions[i * 6 + 5] = -s.end.y * scaleMmToWorld;
      }
      traceGeo.setDrawRange(0, count * 2);
      traceGeo.attributes.position.needsUpdate = true;

      let activeMmX = 0;
      let activeMmY = 0;
      if (segs.length > 0) {
        if (st.isTracing) {
          const prevFloor = Math.floor(traceCursor / segs.length);
          traceCursor += dt * 9.5;
          const nextFloor = Math.floor(traceCursor / segs.length);
          // Every time a layer scan completes, step the Build Bed DOWN!
          if (nextFloor > prevFloor) {
            const nextDrop = st.bedDropTargetMm >= 25 ? 0 : Number((st.bedDropTargetMm + 2.5).toFixed(1));
            st.bedDropTargetMm = nextDrop;
            st.currentLayerNum = Math.round(nextDrop / 2.5) + 1;
            setBedDropMm(nextDrop);
            setCurrentLayerNum(st.currentLayerNum);
          }
        }
        const segIdx = Math.floor(traceCursor) % segs.length;
        const frac = traceCursor - Math.floor(traceCursor);
        const seg = segs[segIdx];
        activeMmX = THREE.MathUtils.lerp(seg.start.x, seg.end.x, frac);
        activeMmY = THREE.MathUtils.lerp(seg.start.y, seg.end.y, frac);
      }

      // Smoothly damp Z-Bed downward movement (0 to 25 mm maps to 0 to -1.65 world units)
      const prevBedDrop = st.bedDropCurrentMm;
      st.bedDropCurrentMm = THREE.MathUtils.damp(
        st.bedDropCurrentMm,
        st.bedDropTargetMm,
        5.5,
        dt
      );
      const bedWorldOffsetY = -(st.bedDropCurrentMm / 25) * 1.65;
      zBedDescendingCarriage.position.y = bedWorldOffsetY;
      // Rotate Z leadscrew whenever the bed is descending
      if (Math.abs(st.bedDropCurrentMm - prevBedDrop) > 0.001) {
        leadscrew.rotation.y += (st.bedDropCurrentMm - prevBedDrop) * 12;
      }

      // Show accumulated 3D printed part stack growing on top of the descending bed
      if (st.bedDropCurrentMm > 0.2) {
        printedStackMesh.visible = true;
        const stackWorldH = Math.max(0.04, -bedWorldOffsetY);
        printedStackMesh.scale.y = stackWorldH;
        printedStackMesh.position.y = initialBedTopY + stackWorldH * 0.5;
      } else {
        printedStackMesh.visible = false;
      }

      const kin = computeStepperGalvoKinematics(
        activeMmX,
        activeMmY,
        st.calibration.workingDistanceMm,
        st.calibration.stepperMode,
        st.bedDropCurrentMm
      );

      // 4. Linear Laser Focus Stage Motion!
      // Move the laser sliding carriage linearly along its rails (Z axis) for dynamic focus Δz
      const effectiveFocusMm = st.autoDynamicFocus
        ? kin.focusDeltaZMm + Math.sin(now * 0.006) * 1.8
        : st.manualFocusMm;
      const focusWorldZOffset = THREE.MathUtils.clamp(
        (effectiveFocusMm / 12) * 0.42,
        -0.38,
        0.38
      );
      laserSlidingCarriage.position.z = focusWorldZOffset;
      focusLeadscrew.rotation.z = effectiveFocusMm * 4.5;

      // 5. Rotate X & Y Stepper Galvo Mirrors
      xRotorPivot.rotation.x = THREE.MathUtils.degToRad(kin.thetaYDeg * 1.4);
      yRotorPivot.rotation.z = THREE.MathUtils.degToRad(-kin.thetaXDeg * 1.4);

      const spotWorldX = kin.actualX * scaleMmToWorld;
      const spotWorldZ = -kin.actualY * scaleMmToWorld;
      const currentTopSurfaceY =
        initialBedTopY + zBedGroup.position.y + (st.bedDropCurrentMm > 0.2 ? 0 : bedWorldOffsetY);

      laserSpotGroup.position.set(spotWorldX, currentTopSurfaceY + 0.015, spotWorldZ);
      traceSegmentsMesh.position.y = currentTopSurfaceY + 0.015;

      // Update 3-segment Laser Ray (Moving Linear Laser Emitter -> X-Mirror -> Y-Mirror -> Target Bed)
      emitterLens.getWorldPosition(_laserOrigin);
      xRotorPivot.getWorldPosition(_xMirrorWorld);
      yRotorPivot.getWorldPosition(_yMirrorWorld);

      laserBeamPositions[0] = _laserOrigin.x;
      laserBeamPositions[1] = _laserOrigin.y;
      laserBeamPositions[2] = _laserOrigin.z;

      laserBeamPositions[3] = _xMirrorWorld.x;
      laserBeamPositions[4] = _xMirrorWorld.y;
      laserBeamPositions[5] = _xMirrorWorld.z;

      laserBeamPositions[6] = _yMirrorWorld.x;
      laserBeamPositions[7] = _yMirrorWorld.y;
      laserBeamPositions[8] = _yMirrorWorld.z;

      laserBeamPositions[9] = spotWorldX;
      laserBeamPositions[10] = currentTopSurfaceY + 0.015;
      laserBeamPositions[11] = spotWorldZ;
      laserBeamGeo.attributes.position.needsUpdate = true;

      if (now - lastHudUpdate > 125) {
        lastHudUpdate = now;
        setLiveKinematics(kin);
      }

      renderer.render(scene, camera);
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('start', handleControlsStart);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  const selectedPart =
    PROTOTYPE_CAD_PARTS.find((p) => p.id === selectedPartId) || PROTOTYPE_CAD_PARTS[0];

  const handleCameraPreset = (preset: CameraPreset) => {
    setCameraPreset(preset);
    stateRef.current.cameraPreset = preset;
  };

  const handleStepBedDown = () => {
    setBedDropMm((prev) => {
      const next = prev >= 25 ? 0 : Number((prev + 2.5).toFixed(1));
      setCurrentLayerNum(Math.round(next / 2.5) + 1);
      return next;
    });
  };

  return (
    <div className="relative w-full h-[calc(100vh-65px)] min-h-[640px] bg-[#090d16] overflow-hidden select-none">
      {/* Dedicated WebGL Mount Container */}
      <div
        ref={canvasMountRef}
        data-testid="cad-webgl-viewport"
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Top-Left Minimal Prototype Spec & 4-Axis Kinematics Telemetry Header */}
      <div className="absolute top-4 left-4 z-10 pointer-events-auto max-w-lg bg-[#0b1120]/90 border border-slate-800 rounded-xl p-4 shadow-xl">
        <div className="flex items-center justify-between gap-4 mb-1.5">
          <span className="text-xs font-medium text-cyan-400 tracking-wide">
            4-Axis DIY Prototype CAD · XY Mirrors + Linear Focus + Descending Z-Bed
          </span>
          <button
            type="button"
            onClick={() => setShowInspector((prev) => !prev)}
            className="px-2.5 py-1 text-xs font-medium text-slate-200 bg-slate-800/90 hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            {showInspector ? 'Hide Part Spec' : 'Inspect Part Spec'}
          </button>
        </div>
        <h2 className="text-base font-semibold text-white leading-snug">
          Linear Focus Laser Carriage & Descending Z-Bed Galvo Rig
        </h2>
        <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 grid grid-cols-4 gap-2 text-xs font-mono tabular-nums">
          <div>
            <div className="text-slate-400">Mirror X/Y</div>
            <div className="text-cyan-300 font-medium">
              {liveKinematics.thetaXDeg.toFixed(1)}° / {liveKinematics.thetaYDeg.toFixed(1)}°
            </div>
          </div>
          <div>
            <div className="text-slate-400">Laser Focus Δz</div>
            <div className="text-amber-300 font-medium">
              +{ (autoDynamicFocus ? liveKinematics.focusDeltaZMm : manualFocusMm).toFixed(2) } mm
            </div>
          </div>
          <div>
            <div className="text-slate-400">Bed Z-Drop (Down)</div>
            <div className="text-rose-300 font-medium">
              -{bedDropMm.toFixed(1)} mm (L{currentLayerNum})
            </div>
          </div>
          <div>
            <div className="text-slate-400">Bed Spot (X,Y)</div>
            <div className="text-emerald-300 font-medium">
              ({liveKinematics.actualX.toFixed(1)}, {liveKinematics.actualY.toFixed(1)})
            </div>
          </div>
        </div>
      </div>

      {/* Collapsible Selected Part Inspector Drawer */}
      {showInspector && (
        <aside
          aria-label="Selected CAD Component Specifications"
          className="absolute top-4 right-4 z-10 pointer-events-auto w-96 max-w-[calc(100vw-2rem)] max-h-[calc(100%-145px)] overflow-y-auto bg-[#0b1120]/95 border border-slate-800 rounded-xl p-3.5 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs text-slate-400">
                <span>Subsystem: {selectedPart.subsystem}</span>
                <span className="mx-1.5" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono tabular-nums text-emerald-400">
                  Est. ${selectedPart.costUsd.toFixed(2)}
                </span>
                <span className="mx-1.5" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono tabular-nums text-slate-500 line-through">
                  Ind. ${selectedPart.industrialEquivalentCostUsd}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-white mt-0.5">{selectedPart.name}</h3>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1">
            {PROTOTYPE_CAD_PARTS.map((part, idx) => (
              <button
                key={part.id}
                type="button"
                onClick={() => onSelectPart(part.id)}
                className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  selectedPartId === part.id
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                0{idx + 1}. {part.id.replace('-', ' ')}
              </button>
            ))}
          </div>

          <p className="mt-2 text-xs text-slate-300 leading-snug">{selectedPart.summary}</p>

          <div className="mt-2.5 pt-2.5 border-t border-slate-800/80">
            <div className="text-xs font-semibold text-slate-200 mb-1.5">
              Mechanical & Optical Specifications
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {selectedPart.specs.map((s) => (
                <div
                  key={s.label}
                  className="p-1.5 rounded-lg bg-slate-900/90 border border-slate-800/80"
                >
                  <div className="text-[10px] text-slate-400">{s.label}</div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-100 mt-0.5">
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2.5 pt-2.5 border-t border-slate-800/80">
            <div className="text-xs font-semibold text-slate-200 mb-1.5">
              Arduino Uno + CNC Shield V3 Wiring
            </div>
            <div className="space-y-1">
              {selectedPart.arduinoPinout.map((pin) => (
                <div
                  key={pin.signal}
                  className="px-2 py-1 rounded-lg bg-slate-900/90 border border-slate-800/80 text-xs"
                >
                  <div className="flex items-center justify-between font-mono tabular-nums">
                    <span className="text-amber-300 font-medium">{pin.signal}</span>
                    <span className="text-cyan-300">{pin.pin}</span>
                  </div>
                  <div className="text-[10px] text-slate-400">{pin.notes}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onDownloadStl(selectedPart.id)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Download 3D Printable STL
            </button>
            <button
              type="button"
              onClick={onDownloadScad}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              OpenSCAD (.scad)
            </button>
          </div>
        </aside>
      )}

      {/* Unified Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-[min(980px,95vw)] pointer-events-auto flex flex-col items-center">
        <button
          type="button"
          onClick={() => setDockCollapsed((prev) => !prev)}
          aria-expanded={!dockCollapsed}
          className="inline-flex items-center gap-1.5 px-3.5 py-1 text-xs font-medium text-slate-300 bg-[#0b1120]/95 border border-b-0 border-slate-800 rounded-t-lg hover:text-white transition-colors whitespace-nowrap shrink-0"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
              Show CAD & Motion Controls (H)
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5 text-cyan-400" />
              Hide Controls (H)
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className="w-full bg-[#0b1120]/95 border border-slate-800 rounded-xl p-3.5 shadow-2xl space-y-2.5">
            {/* Row 1: Linear Laser Focus Stage & Descending Z-Bed Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-2.5 border-b border-slate-800/90">
              {/* Linear Laser Focus Stage Slider */}
              <div className="flex items-center gap-2.5 flex-1 min-w-[260px]">
                <label
                  htmlFor="linear-focus-slider"
                  className="text-xs font-medium text-amber-300 whitespace-nowrap shrink-0"
                >
                  Laser Linear Focus (Δz):
                </label>
                <input
                  id="linear-focus-slider"
                  type="range"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={
                    autoDynamicFocus
                      ? Number(liveKinematics.focusDeltaZMm.toFixed(1))
                      : manualFocusMm
                  }
                  onChange={(e) => {
                    setAutoDynamicFocus(false);
                    setManualFocusMm(Number(e.target.value));
                  }}
                  className="w-full accent-amber-400 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => setAutoDynamicFocus((prev) => !prev)}
                  className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
                    autoDynamicFocus
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {autoDynamicFocus ? 'Auto Δz ON' : 'Manual Δz'}
                </button>
              </div>

              {/* Descending Z-Bed Elevator Controls */}
              <div className="flex items-center gap-2.5 flex-1 min-w-[280px]">
                <label
                  htmlFor="bed-drop-slider"
                  className="text-xs font-medium text-rose-300 whitespace-nowrap shrink-0"
                >
                  Bed Z-Drop (Down):
                </label>
                <input
                  id="bed-drop-slider"
                  type="range"
                  min={0}
                  max={25}
                  step={0.5}
                  value={bedDropMm}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setBedDropMm(val);
                    setCurrentLayerNum(Math.round(val / 2.5) + 1);
                  }}
                  className="w-full accent-rose-400 cursor-pointer"
                />
                <span className="text-xs font-mono tabular-nums text-rose-300 w-14 text-right shrink-0">
                  -{bedDropMm.toFixed(1)}mm
                </span>
                <button
                  type="button"
                  onClick={handleStepBedDown}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-950 bg-rose-400 hover:bg-rose-300 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                  Step Bed Down
                </button>
              </div>
            </div>

            {/* Row 2: Exploded View, Subsystem Filter, Camera Presets & Laser Trace */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-[190px] flex-1">
                <label
                  htmlFor="cad-exploded-slider"
                  className="text-xs font-medium text-slate-300 whitespace-nowrap shrink-0"
                >
                  Exploded View:
                </label>
                <input
                  id="cad-exploded-slider"
                  type="range"
                  min={0}
                  max={100}
                  value={explodedPct}
                  onChange={(e) => setExplodedPct(Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <span className="text-xs font-mono tabular-nums text-cyan-300 w-9 text-right shrink-0">
                  {explodedPct}%
                </span>
              </div>

              <div
                role="group"
                aria-label="Filter CAD Subsystem"
                className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800"
              >
                {(['all', 'optics', 'motion', 'electronics', 'frame'] as SubsystemCategory[]).map(
                  (sub) => (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => setSubsystemFilter(sub)}
                      className={`px-2 py-1 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap shrink-0 ${
                        subsystemFilter === sub
                          ? 'bg-cyan-500 text-slate-950 font-semibold'
                          : 'text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      {sub}
                    </button>
                  )
                )}
              </div>

              <div
                role="group"
                aria-label="Camera View Presets"
                className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800"
              >
                {(Object.keys(CAMERA_PRESETS) as CameraPreset[]).map((presetKey) => (
                  <button
                    key={presetKey}
                    type="button"
                    onClick={() => handleCameraPreset(presetKey)}
                    className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      cameraPreset === presetKey
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {CAMERA_PRESETS[presetKey].label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setIsTracing((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  isTracing
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                    : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                }`}
              >
                {isTracing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {isTracing ? 'Pause 3D Print' : 'Resume 3D Print'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
