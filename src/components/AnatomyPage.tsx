import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Activity,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Eye,
  Flame,
  Gauge,
  HelpCircle,
  Info,
  Layers,
  Maximize2,
  Play,
  RotateCw,
  Search,
  Sliders,
  Sparkles,
  Zap,
} from "lucide-react";

interface AnatomyCallout {
  id: string;
  name: string;
  subsystem: "Optics & Laser" | "Kinematics" | "Powder & Chamber";
  position3D: [number, number, number];
  color: string;
  principle: string;
  governingFormula: string;
  physicalSpecs: Record<string, string>;
  explanation: string;
}

const ANATOMY_CALLOUTS: AnatomyCallout[] = [
  {
    id: "fiber-in",
    name: "01. Armored QBH Fiber & Collimator",
    subsystem: "Optics & Laser",
    position3D: [-35, 0, 93],
    color: "#eab308",
    principle: "Single-Mode / Multi-Mode Fiber Delivery & Dynamic Collimation",
    governingFormula: "w(z) = w_0 \\sqrt{1 + (z / z_R)^2}",
    physicalSpecs: {
      "Fiber Core Diameter": "50 µm – 100 µm",
      "Wavelength": "1064 nm (Yb:Fiber) / 450 nm (Blue)",
      "Beam Parameter Product": "< 2.0 mm·mrad",
      "Collimating Doublet": "f = 75 mm Fused Silica (AR Coated)",
    },
    explanation:
      "Laser energy enters via an armored QBH fiber connector. A high-damage-threshold fused silica doublet collimates the divergent beam into an 8–12 mm diameter parallel pencil beam before reaching the scanning mirrors.",
  },
  {
    id: "linear-focus",
    name: "02. Pre-Objective Dynamic Focus Stage",
    subsystem: "Kinematics",
    position3D: [-20, 0, 93],
    color: "#f59e0b",
    principle: "Lensless Flat-Field Focal Compensation",
    governingFormula: "\\Delta z = \\sqrt{L_0^2 + r^2} - L_0 = L_0 (\\sec(2\\theta) - 1)",
    physicalSpecs: {
      "Actuator": "Miniature Voice Coil (VCM) / Zero-Backlash Ball Screw",
      "Travel Range": "±15 mm linear motion",
      "Bandwidth": "> 200 Hz frequency response",
      "Position Resolution": "0.5 µm optical linear encoder",
    },
    explanation:
      "Because this system operates WITHOUT an F-Theta lens, the distance from mirrors to the build corners is greater than to the center. This motorized linear stage moves the collimating lens dynamically in micro-seconds to expand/contract the beam waist, ensuring a planar focal spot across the entire 500 mm bed.",
  },
  {
    id: "mirror-x",
    name: "03. X-Axis Galvanometer & Mirror",
    subsystem: "Optics & Laser",
    position3D: [0, 8, 93],
    color: "#0ea5e9",
    principle: "Moving-Magnet High-Speed Optical Steering",
    governingFormula: "\\theta_{\\text{optical}} = 2 \\theta_{\\text{mechanical}}, \\quad x = L \\tan(2\\theta_x)",
    physicalSpecs: {
      "Mirror Substrate": "Ultra-low inertia Beryllium / Fused Silica",
      "Aperture Size": "10 mm × 14 mm facet",
      "Coating": "Dielectric Enhanced Gold / Silver (R > 99.8%)",
      "Tracking Error": "< 5 µrad repeatability",
    },
    explanation:
      "A moving-magnet galvanometer rotor deflects the beam along the horizontal X-axis. Designed for ultra-low rotor inertia (0.45 g·cm²), it accelerates up to 5,000 mm/s in sub-millisecond response times.",
  },
  {
    id: "mirror-y",
    name: "04. Y-Axis Galvanometer & Mirror",
    subsystem: "Optics & Laser",
    position3D: [12, 0, 81],
    color: "#38bdf8",
    principle: "Orthogonal Deflection Across Sintering Plane",
    governingFormula: "y = L \\tan(2\\theta_y) \\cdot \\sec(2\\theta_x)",
    physicalSpecs: {
      "Mirror Substrate": "Elongated paddle to capture deflected X-beam",
      "Aperture Size": "14 mm × 22 mm facet",
      "Galvo Model": "High-torque analog/digital optical servo",
      "Max Step Velocity": "120 rad/s",
    },
    explanation:
      "The secondary Y-mirror accepts the pre-deflected beam from the X-mirror and directs it downwards into the chamber. It is sized slightly larger to prevent optical clipping at maximum deflection angles.",
  },
  {
    id: "gas-nozzle",
    name: "05. Laminar Gas-Purge Collar (Lens-Free Exit)",
    subsystem: "Powder & Chamber",
    position3D: [0, 0, 72],
    color: "#06b6d4",
    principle: "Aerodynamic Optical Shielding & Fume Extraction",
    governingFormula: "\\text{Re} = \\frac{\\rho v D}{\\mu} < 2000 \\quad (\\text{Laminar Flow})",
    physicalSpecs: {
      "Purge Gas": "High-purity Argon (99.999%) / Nitrogen",
      "Gas Knife Velocity": "2.5 m/s uniform across optical throat",
      "Positive Pressure": "+15 mbar over ambient chamber pressure",
    },
    explanation:
      "Without a physical glass F-Theta lens closing the top of the chamber, an aerodynamic argon gas knife and positive-pressure collar prevent laser-generated metal spatter, soot, and condensate from contaminating the galvo mirrors.",
  },
  {
    id: "melt-pool",
    name: "06. Laser Melt Pool & Keyhole Micro-Welding",
    subsystem: "Optics & Laser",
    position3D: [0, 0, -38],
    color: "#f43f5e",
    principle: "Localized Powder Consolidation (SLM / LPBF)",
    governingFormula: "E_v = \\frac{P}{v \\cdot h \\cdot t} \\quad [\\text{J/mm}^3], \\quad I_0 = \\frac{2P}{\\pi w_0^2}",
    physicalSpecs: {
      "Laser Power": "Up to 10,000 W (10 kW)",
      "Spot Diameter (2w₀)": "50 µm – 100 µm",
      "Peak Intensity": "> 10⁶ W/cm²",
      "Peak Temperature": "> 2,800 °C (local phase transition)",
    },
    explanation:
      "The focused laser beam deposits extreme energy into the pre-laid metal powder bed. Powder grains liquefy in microseconds, forming a molten pool that rapidly solidifies into dense, pore-free bulk metal (titanium, Inconel, stainless steel).",
  },
  {
    id: "recoater-unit",
    name: "07. Precision Powder Recoater Carriage",
    subsystem: "Powder & Chamber",
    position3D: [0, -30, -38],
    color: "#ec4899",
    principle: "Controlled Layer Deposition & Powder Packing",
    governingFormula: "h_{\\text{layer}} = 20\\,\\mu\\text{m} - 50\\,\\mu\\text{m} \\pm 2\\,\\mu\\text{m}",
    physicalSpecs: {
      "Spreader Mechanism": "Tungsten carbide ground blade / ceramic roller",
      "Drive": "NEMA 17 Stepper + GT2 belt on MGN12 linear rail",
      "Sweep Speed": "40 – 120 mm/s",
      "Bed Smoothness": "Ra < 4 µm surface finish",
    },
    explanation:
      "After laser exposure of a layer completes, the recoater sweeps across the build platform, depositing and evening out a uniform 30 µm layer of fresh spherical metal powder sourced from the adjacent dosing well.",
  },
  {
    id: "build-piston",
    name: "08. Sub-Micron Z-Axis Elevator Piston",
    subsystem: "Kinematics",
    position3D: [0, 0, -65],
    color: "#10b981",
    principle: "Incremental Layer Lowering",
    governingFormula: "\\Delta z_{\\text{step}} = \\text{Pitch} \\times \\frac{\\text{Angle}}{360^\\circ \\times \\text{Microsteps}}",
    physicalSpecs: {
      "Motor": "NEMA 23 Closed-Loop Stepper (1.9 Nm)",
      "Transmission": "SFU1204 Zero-Backlash C7 Ball Screw (4mm pitch)",
      "Guide": "Dual MGN12H linear guide rails",
      "Z Repeatability": "± 2.0 µm",
    },
    explanation:
      "The build cylinder holds the printed solid part and surrounding loose powder. Following each layer fusion, the ball screw indexes downwards by exactly one layer thickness (e.g. 30 µm), preparing the substrate for the next powder pass.",
  },
];

const PROCESS_STEPS = [
  {
    step: 1,
    title: "1. Collimation & Dynamic Z-Shift",
    description: "The 10 kW fiber laser beam is collimated and pre-compensated by the linear voice-coil stage.",
    highlightId: "linear-focus",
  },
  {
    step: 2,
    title: "2. High-Speed Galvo Deflection",
    description: "X & Y galvanometer mirrors pivot to target coordinate (x, y) with microsecond response.",
    highlightId: "mirror-x",
  },
  {
    step: 3,
    title: "3. Lensless Tangent Focusing",
    description: "Beam passes through the aerodynamic gas-purge nozzle directly onto the wide-format build plate.",
    highlightId: "gas-nozzle",
  },
  {
    step: 4,
    title: "4. Selective Laser Melting (SLM)",
    description: "Laser energy melts fine metal powder into dense crystalline solid track with 67° rotating hatch.",
    highlightId: "melt-pool",
  },
  {
    step: 5,
    title: "5. Piston Drop & Recoater Sweep",
    description: "Build platform lowers by 30 µm; recoater spreads the next layer of fresh powder.",
    highlightId: "recoater-unit",
  },
];

export default function AnatomyPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [selectedCalloutId, setSelectedCalloutId] = useState<string>("linear-focus");
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [isPlayingSequence, setIsPlayingSequence] = useState<boolean>(false);
  const [cutawayOpacity, setCutawayOpacity] = useState<number>(0.35);
  const [beamIntensity, setBeamIntensity] = useState<number>(100); // 100%
  const [autoRotate, setAutoRotate] = useState<boolean>(true);

  // Physics simulation values
  const [laserPowerW, setLaserPowerW] = useState<number>(10000);
  const [scanSpeedMms, setScanSpeedMms] = useState<number>(5000);
  const [spotSizeUm, setSpotSizeUm] = useState<number>(80);
  const [scanRadiusMm, setScanRadiusMm] = useState<number>(180);

  const selectedCallout =
    ANATOMY_CALLOUTS.find((c) => c.id === selectedCalloutId) ?? ANATOMY_CALLOUTS[1];

  // Dynamic physics calculations
  const L0 = 400; // optical throw distance mm
  const deltaZFocusMm = Math.sqrt(L0 * L0 + scanRadiusMm * scanRadiusMm) - L0;
  const volumetricEnergyDensity = (laserPowerW / (scanSpeedMms * 0.1 * 0.03)).toFixed(1); // J/mm3
  const linearEnergyDensity = (laserPowerW / scanSpeedMms).toFixed(2); // J/mm
  const rayleighRangeMm = ((Math.PI * Math.pow((spotSizeUm / 2) * 1e-3, 2)) / (1064 * 1e-6)).toFixed(2);
  const peakIntensityWcm2 = ((2 * laserPowerW) / (Math.PI * Math.pow((spotSizeUm / 2) * 1e-4, 2))).toExponential(2);

  // Three.js References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const partsGroupRef = useRef<THREE.Group | null>(null);
  const rayLineRef = useRef<THREE.Line | null>(null);
  const meltPoolRef = useRef<THREE.Mesh | null>(null);
  const housingMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const focusStageRef = useRef<THREE.Group | null>(null);
  const recoaterMeshRef = useRef<THREE.Group | null>(null);
  const pistonPlateRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 720;
    const height = 540;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060910);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 2000);
    camera.position.set(160, -220, 140);
    camera.up.set(0, 0, 1);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 15);
    controlsRef.current = controls;

    // Atmospheric lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    const cyanKey = new THREE.DirectionalLight(0x38bdf8, 1.8);
    cyanKey.position.set(120, -100, 180);
    scene.add(cyanKey);

    const amberFill = new THREE.DirectionalLight(0xf59e0b, 1.1);
    amberFill.position.set(-100, 100, 80);
    scene.add(amberFill);

    const rootGroup = new THREE.Group();
    partsGroupRef.current = rootGroup;
    scene.add(rootGroup);

    // 1. Grid & Platform Datum
    const grid = new THREE.GridHelper(400, 40, 0x0284c7, 0x1e293b);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -40;
    rootGroup.add(grid);

    // 2. Chassis Frame / Structural Legs
    const legGeom = new THREE.BoxGeometry(6, 6, 175);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.3 });
    for (const [x, y] of [[-65, -65], [65, -65], [65, 65], [-65, 65]]) {
      const leg = new THREE.Mesh(legGeom, legMat);
      leg.position.set(x, y, 15);
      rootGroup.add(leg);
    }

    // 3. Cutaway Optical Head Housing
    const housingGeom = new THREE.BoxGeometry(48, 48, 38);
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      metalness: 0.85,
      roughness: 0.15,
      transparent: true,
      opacity: cutawayOpacity,
    });
    housingMatRef.current = housingMat;
    const housing = new THREE.Mesh(housingGeom, housingMat);
    housing.position.set(0, 0, 86);
    rootGroup.add(housing);

    // Optical throat nozzle (Open Lensless Exit)
    const throatGeom = new THREE.CylinderGeometry(15, 17, 14, 32, 1, true);
    const throatMat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, metalness: 0.95, side: THREE.DoubleSide });
    const throat = new THREE.Mesh(throatGeom, throatMat);
    throat.rotation.x = Math.PI / 2;
    throat.position.set(0, 0, 68);
    rootGroup.add(throat);

    // 4. Fiber Input & Collimation Tube
    const fiberCollimator = new THREE.Group();
    const fiberCableGeom = new THREE.CylinderGeometry(2, 2, 24, 16);
    const fiberCableMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.4 });
    const fiberCable = new THREE.Mesh(fiberCableGeom, fiberCableMat);
    fiberCable.rotation.z = Math.PI / 2;
    fiberCable.position.set(-36, 0, 93);
    fiberCollimator.add(fiberCable);

    const barrelGeom = new THREE.CylinderGeometry(4.2, 4.2, 16, 24);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.95 });
    const barrel = new THREE.Mesh(barrelGeom, barrelMat);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(-20, 0, 93);
    fiberCollimator.add(barrel);
    rootGroup.add(fiberCollimator);
    focusStageRef.current = fiberCollimator;

    // Linear guide rails for dynamic focus stage
    const guideRailGeom = new THREE.CylinderGeometry(0.8, 0.8, 28, 12);
    const guideRailMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.95 });
    const g1 = new THREE.Mesh(guideRailGeom, guideRailMat);
    g1.rotation.z = Math.PI / 2;
    g1.position.set(-20, 6, 93);
    const g2 = new THREE.Mesh(guideRailGeom, guideRailMat);
    g2.rotation.z = Math.PI / 2;
    g2.position.set(-20, -6, 93);
    rootGroup.add(g1, g2);

    // 5. Galvanometer X & Mirror
    const galvoXMotorGeom = new THREE.CylinderGeometry(6, 6, 16, 24);
    const motorMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, metalness: 0.9 });
    const galvoX = new THREE.Mesh(galvoXMotorGeom, motorMat);
    galvoX.position.set(0, 12, 95);
    rootGroup.add(galvoX);

    const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.99, roughness: 0.05 });
    const mirrorXGeom = new THREE.BoxGeometry(1.4, 11, 14);
    const mirrorX = new THREE.Mesh(mirrorXGeom, mirrorMat);
    mirrorX.position.set(0, 0, 93);
    mirrorX.rotation.z = Math.PI / 4;
    rootGroup.add(mirrorX);

    // 6. Galvanometer Y & Mirror
    const galvoYMotorGeom = new THREE.CylinderGeometry(6.5, 6.5, 18, 24);
    const galvoY = new THREE.Mesh(galvoYMotorGeom, motorMat);
    galvoY.rotation.z = Math.PI / 2;
    galvoY.position.set(14, 0, 81);
    rootGroup.add(galvoY);

    const mirrorYGeom = new THREE.BoxGeometry(15, 1.4, 17);
    const mirrorY = new THREE.Mesh(mirrorYGeom, mirrorMat);
    mirrorY.position.set(0, 0, 81);
    mirrorY.rotation.x = Math.PI / 4;
    rootGroup.add(mirrorY);

    // 7. Build Plate & Elevator Piston
    const pistonGroup = new THREE.Group();
    pistonGroup.position.set(0, 0, -40);
    const plateGeom = new THREE.CylinderGeometry(42, 42, 6, 48);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0x10b981, metalness: 0.85, roughness: 0.3 });
    const plate = new THREE.Mesh(plateGeom, plateMat);
    plate.rotation.x = Math.PI / 2;
    pistonGroup.add(plate);

    // Ball screw shaft
    const screwGeom = new THREE.CylinderGeometry(3.5, 3.5, 55, 24);
    const screwMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95 });
    const screw = new THREE.Mesh(screwGeom, screwMat);
    screw.rotation.x = Math.PI / 2;
    screw.position.z = -30;
    pistonGroup.add(screw);
    rootGroup.add(pistonGroup);
    pistonPlateRef.current = pistonGroup;

    // 8. Recoater Carriage & Spreader Blade
    const recGroup = new THREE.Group();
    recGroup.position.set(0, -32, -38);
    const recBladeGeom = new THREE.BoxGeometry(86, 3, 8);
    const recBladeMat = new THREE.MeshStandardMaterial({ color: 0xec4899, metalness: 0.9 });
    const recBlade = new THREE.Mesh(recBladeGeom, recBladeMat);
    recGroup.add(recBlade);

    const recMotorGeom = new THREE.BoxGeometry(12, 12, 12);
    const recMotor = new THREE.Mesh(recMotorGeom, motorMat);
    recMotor.position.set(48, 0, 4);
    recGroup.add(recMotor);
    rootGroup.add(recGroup);
    recoaterMeshRef.current = recGroup;

    // 9. Multi-Segment Optical Laser Ray
    const rayCoords = new Float32Array([
      -36, 0, 93, // Collimator input
      0, 0, 93,   // X mirror
      0, 0, 81,   // Y mirror
      12, -8, -40,// Bed melt pool target
    ]);
    const rayGeom = new THREE.BufferGeometry();
    rayGeom.setAttribute("position", new THREE.BufferAttribute(rayCoords, 3));
    const rayLine = new THREE.Line(
      rayGeom,
      new THREE.LineBasicMaterial({ color: 0xf43f5e, linewidth: 3, transparent: true, opacity: 0.9 })
    );
    rootGroup.add(rayLine);
    rayLineRef.current = rayLine;

    // 10. Melt Pool Glow
    const meltPoolGeom = new THREE.CircleGeometry(3.5, 32);
    const meltPoolMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });
    const meltPool = new THREE.Mesh(meltPoolGeom, meltPoolMat);
    meltPool.position.set(12, -8, -39.9);
    rootGroup.add(meltPool);
    meltPoolRef.current = meltPool;

    // Animation loop
    let animId: number;
    let clock = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      clock += 0.02;

      if (autoRotate) {
        rootGroup.rotation.z += 0.0025;
      }

      // Animate laser beam flicker & melt pool oscillation
      if (meltPoolRef.current) {
        const s = 1 + Math.sin(clock * 12) * 0.15;
        meltPoolRef.current.scale.set(s, s, s);
      }

      // If playing automated process sequence:
      if (isPlayingSequence) {
        const phase = (clock * 0.8) % 5;
        setActiveStepIndex(Math.floor(phase));

        // Move recoater across bed
        if (recoaterMeshRef.current) {
          const recY = Math.sin(clock * 1.5) * 35;
          recoaterMeshRef.current.position.y = recY;
        }

        // Oscillate dynamic focus stage linearly
        if (focusStageRef.current) {
          const fx = -20 + Math.sin(clock * 2) * 4;
          focusStageRef.current.position.x = fx;
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [autoRotate, isPlayingSequence]);

  // Update cutaway opacity
  useEffect(() => {
    if (housingMatRef.current) {
      housingMatRef.current.opacity = cutawayOpacity;
    }
  }, [cutawayOpacity]);

  // Focus 3D Camera on selected callout
  const focusOnCallout = (callout: AnatomyCallout) => {
    setSelectedCalloutId(callout.id);
    if (controlsRef.current && cameraRef.current) {
      const [tx, ty, tz] = callout.position3D;
      controlsRef.current.target.set(tx, ty, tz);
      cameraRef.current.position.set(tx + 80, ty - 120, tz + 70);
      controlsRef.current.update();
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-gradient-to-r from-blue-950/40 via-cyan-950/30 to-slate-900/60 p-5 shadow-2xl backdrop-blur">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-cyan-400/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-cyan-400">
              wheresryan22/anatomy Architecture
            </span>
            <span className="text-xs text-slate-400">Physical Machine Mechanics &amp; Physics Explainer</span>
          </div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">
            Anatomy of the 3D Galvanometer Metal Laser Printer
          </h2>
          <p className="text-xs text-slate-300">
            Cutaway mechanical inspection, pre-objective dynamic beam expansion, flat-field tangent compensation, and SLM process dynamics.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsPlayingSequence(!isPlayingSequence)}
            className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold shadow-lg transition ${
              isPlayingSequence
                ? "border-rose-500/50 bg-rose-500/20 text-rose-300"
                : "border-cyan-400/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
            }`}
          >
            <Play className={`h-3.5 w-3.5 ${isPlayingSequence ? "animate-spin" : ""}`} />
            {isPlayingSequence ? "Pause SLM Process Cycle" : "Play SLM Process Cycle"}
          </button>

          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${
              autoRotate
                ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                : "border-white/10 bg-white/5 text-slate-400 hover:text-white"
            }`}
          >
            <RotateCw className="h-3.5 w-3.5" /> {autoRotate ? "Auto-Rotate" : "Paused"}
          </button>
        </div>
      </div>

      {/* Main Grid: 3D Isometric Viewport on Left, Anatomy Callout & Physics on Right */}
      <div className="grid gap-6 lg:grid-cols-[1fr_440px]">
        {/* Left Column: Interactive 3D Anatomy Model */}
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/50 shadow-2xl">
            {/* Three.js Canvas Container */}
            <div ref={mountRef} className="h-[540px] w-full" />

            {/* In-Canvas Floating Callout Hotspots */}
            <div className="absolute left-4 top-4 flex flex-wrap gap-1.5">
              {ANATOMY_CALLOUTS.slice(0, 5).map((callout) => (
                <button
                  key={callout.id}
                  onClick={() => focusOnCallout(callout)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-mono transition backdrop-blur ${
                    selectedCalloutId === callout.id
                      ? "border-cyan-400 bg-cyan-400/20 text-white shadow-md shadow-cyan-900/50"
                      : "border-white/15 bg-black/60 text-slate-300 hover:border-white/30 hover:text-white"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: callout.color }} />
                  {callout.name.split(" ")[1]}
                </button>
              ))}
            </div>

            {/* Bottom Floating Control Bar */}
            <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/85 p-3 backdrop-blur">
              {/* Cutaway Opacity Slider */}
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                  <Eye className="h-4 w-4 text-cyan-400" /> Cutaway X-Ray:
                </span>
                <input
                  type="range"
                  min="0.05"
                  max="0.9"
                  step="0.05"
                  value={cutawayOpacity}
                  onChange={(e) => setCutawayOpacity(Number(e.target.value))}
                  className="w-28 accent-cyan-400 sm:w-36"
                />
                <span className="font-mono text-xs text-cyan-400">{Math.round(cutawayOpacity * 100)}%</span>
              </div>

              {/* Laser Beam Visibility Slider */}
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Flame className="h-3.5 w-3.5 text-rose-400" /> 10 kW Laser Core
                </span>
                <span className="rounded-md bg-rose-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-rose-300">
                  1064 nm Yb:Fiber
                </span>
              </div>
            </div>

            <div className="absolute right-4 top-4 rounded-lg bg-black/70 px-2.5 py-1 text-[10px] font-mono text-slate-400 backdrop-blur">
              Click Hotspot or Orbit 360° to Inspect
            </div>
          </div>

          {/* Process Timeline Stepper (wheresryan22/anatomy pattern) */}
          <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4 shadow-lg">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <Activity className="h-3.5 w-3.5 text-cyan-400" /> SLM Mechanical Cycle Steps
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
              {PROCESS_STEPS.map((step, idx) => (
                <div
                  key={step.step}
                  onClick={() => {
                    setActiveStepIndex(idx);
                    const targetCallout = ANATOMY_CALLOUTS.find((c) => c.id === step.highlightId);
                    if (targetCallout) focusOnCallout(targetCallout);
                  }}
                  className={`cursor-pointer rounded-xl border p-2.5 transition ${
                    activeStepIndex === idx
                      ? "border-cyan-400 bg-cyan-400/15 text-white shadow-md shadow-cyan-900/30"
                      : "border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-slate-200"
                  }`}
                >
                  <div className="text-[10px] font-bold text-cyan-400">STEP {step.step}</div>
                  <div className="text-xs font-semibold text-white">{step.title.split(". ")[1]}</div>
                  <div className="mt-1 line-clamp-2 text-[10px] text-slate-400">{step.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Detailed Part Anatomy & Physics Lab */}
        <div className="space-y-4">
          {/* Active Callout Details */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <span className="rounded-full bg-cyan-400/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
                  {selectedCallout.subsystem}
                </span>
                <h3 className="mt-1 text-lg font-bold text-white">{selectedCallout.name}</h3>
              </div>
              <span
                className="h-4 w-4 rounded-full border border-white/20 shadow-md"
                style={{ backgroundColor: selectedCallout.color }}
              />
            </div>

            <p className="mt-2 text-xs leading-relaxed text-slate-300">{selectedCallout.explanation}</p>

            {/* Governing Physics Formula */}
            <div className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-950/20 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
                Governing Physical Law &amp; Kinematics:
              </div>
              <div className="mt-1 font-mono text-xs font-bold text-amber-300">
                {selectedCallout.governingFormula}
              </div>
              <div className="mt-1 text-[10px] text-slate-400">{selectedCallout.principle}</div>
            </div>

            {/* Physical Specifications */}
            <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <Info className="h-3.5 w-3.5 text-cyan-400" /> Physical Tolerances &amp; Materials
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(selectedCallout.physicalSpecs).map(([key, val]) => (
                  <div key={key} className="rounded-lg bg-black/40 p-2 border border-white/5">
                    <div className="text-[10px] text-slate-400">{key}</div>
                    <div className="font-mono font-medium text-slate-200">{val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Interactive Physics Lab & Tangent Kinematics */}
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-950/20 p-5 shadow-xl space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
              <Sliders className="h-4 w-4" /> Live SLM Physics &amp; Lensless Geometry Lab
            </h3>

            {/* Laser Power Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Laser Power (P):</span>
                <span className="font-mono text-cyan-300">{laserPowerW.toLocaleString()} W (10 kW)</span>
              </div>
              <input
                type="range"
                min="500"
                max="12000"
                step="500"
                value={laserPowerW}
                onChange={(e) => setLaserPowerW(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>

            {/* Scan Speed Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Scan Velocity (v):</span>
                <span className="font-mono text-cyan-300">{scanSpeedMms} mm/s (5.0 m/s)</span>
              </div>
              <input
                type="range"
                min="1000"
                max="10000"
                step="500"
                value={scanSpeedMms}
                onChange={(e) => setScanSpeedMms(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>

            {/* Radial Position Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Scan Target Radius (r):</span>
                <span className="font-mono text-amber-300">{scanRadiusMm} mm from center</span>
              </div>
              <input
                type="range"
                min="0"
                max="250"
                step="5"
                value={scanRadiusMm}
                onChange={(e) => setScanRadiusMm(Number(e.target.value))}
                className="w-full accent-amber-400"
              />
            </div>

            {/* Physics Calculated Readouts */}
            <div className="grid grid-cols-2 gap-2 text-xs border-t border-white/10 pt-3">
              <div className="rounded-lg bg-black/40 p-2 border border-white/5">
                <div className="text-[10px] text-slate-400">Required Focus Shift Δz</div>
                <div className="text-base font-bold text-amber-300 font-mono">
                  +{deltaZFocusMm.toFixed(2)} <span className="text-[10px] font-normal">mm</span>
                </div>
                <div className="text-[9px] text-slate-500">√(L₀² + r²) - L₀</div>
              </div>

              <div className="rounded-lg bg-black/40 p-2 border border-white/5">
                <div className="text-[10px] text-slate-400">Linear Energy Density</div>
                <div className="text-base font-bold text-emerald-300 font-mono">
                  {linearEnergyDensity} <span className="text-[10px] font-normal">J/mm</span>
                </div>
                <div className="text-[9px] text-slate-500">P / v = 10 kW / 5 m/s</div>
              </div>

              <div className="rounded-lg bg-black/40 p-2 border border-white/5">
                <div className="text-[10px] text-slate-400">Volumetric Energy</div>
                <div className="text-base font-bold text-cyan-300 font-mono">
                  {volumetricEnergyDensity} <span className="text-[10px] font-normal">J/mm³</span>
                </div>
                <div className="text-[9px] text-slate-500">P / (v · h · t)</div>
              </div>

              <div className="rounded-lg bg-black/40 p-2 border border-white/5">
                <div className="text-[10px] text-slate-400">Rayleigh Range z_R</div>
                <div className="text-base font-bold text-rose-300 font-mono">
                  {rayleighRangeMm} <span className="text-[10px] font-normal">mm</span>
                </div>
                <div className="text-[9px] text-slate-500">π w₀² / λ</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
