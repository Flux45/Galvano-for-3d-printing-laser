import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Cpu,
  Layers,
  Maximize2,
  Sliders,
  Zap,
  Info,
  CheckCircle2,
  AlertTriangle,
  Cable,
  ChevronRight,
  Sparkles,
  Wrench,
} from "lucide-react";
import { CadViewport3D } from "./CadViewport3D";
import { PROTOTYPE_CAD_PARTS } from "../data/prototypeCadData";
import {
  DEFAULT_CALIBRATION_PARAMS,
  generateOpenScadMountCode,
  generatePresetLayerSegments,
  optimizeToolpath,
} from "../utils/galvoMath";
import { downloadTextFile } from "../lib/exportFormat";

interface MachinePart {
  id: string;
  name: string;
  category: "optics" | "motion" | "chamber" | "electronics";
  color: number;
  description: string;
  specs: Record<string, string>;
  wiringPinout: string[];
  explodedOffset: [number, number, number];
}

const MACHINE_PARTS: MachinePart[] = [
  {
    id: "galvo-head",
    name: "3D Galvo Scanhead Housing",
    category: "optics",
    color: 0x38bdf8,
    description: "Rigid CNC-machined aluminum optical enclosure housing dual galvanometer servo motors and reflection mirrors.",
    specs: {
      "Clear Aperture": "10 mm – 14 mm",
      "Scan Angle": "±12.5° optical (±0.218 rad)",
      "Max Scan Speed": "5,000 mm/s",
      "Optics Coating": "Dielectric enhanced silver / gold (1064nm / 450nm)",
    },
    wiringPinout: [
      "X_IN+ / X_IN- (Differential Analog ±5V position)",
      "Y_IN+ / Y_IN- (Differential Analog ±5V position)",
      "+15V, -15V, COM Power rails",
    ],
    explodedOffset: [0, 0, 70],
  },
  {
    id: "galvo-x",
    name: "Galvo Motor X & Mirror X",
    category: "optics",
    color: 0x0ea5e9,
    description: "High-speed moving-magnet servo motor driving the fast X-axis mirror paddle.",
    specs: {
      "Rotor Inertia": "0.45 g·cm²",
      "Repeatability": "< 5 µrad",
      "Mirror Dimensions": "10 mm × 14 mm × 1.2 mm",
      "Feedback": "Optical analog position sensor",
    },
    wiringPinout: [
      "Motor Coil A/B to Galvo Driver X",
      "PD+ / PD- Position Detector Signals",
    ],
    explodedOffset: [0, 35, 55],
  },
  {
    id: "galvo-y",
    name: "Galvo Motor Y & Mirror Y",
    category: "optics",
    color: 0x0284c7,
    description: "Larger galvanometer servo motor driving the deflection Y-axis mirror paddle.",
    specs: {
      "Rotor Inertia": "0.95 g·cm²",
      "Repeatability": "< 8 µrad",
      "Mirror Dimensions": "14 mm × 22 mm × 1.5 mm",
      "Feedback": "Optical analog position sensor",
    },
    wiringPinout: [
      "Motor Coil A/B to Galvo Driver Y",
      "PD+ / PD- Position Detector Signals",
    ],
    explodedOffset: [35, 0, 45],
  },
  {
    id: "dynamic-focus",
    name: "Fiber-In Dynamic Linear Focus Stage",
    category: "optics",
    color: 0xf59e0b,
    description: "Pre-objective motorized fiber input collimator that dynamically shifts focus to maintain planar field without F-theta lens.",
    specs: {
      "Actuator Type": "Miniature Ball Screw (1mm pitch) or Voice Coil Actuator (VCA)",
      "Linear Travel": "±15 mm with 1 µm resolution",
      "Response Time": "< 10 ms step response",
      "Optical Formula": "L(θ) = L₀ · √(1 + tan²(2θ))",
    },
    wiringPinout: [
      "Step / Dir / Enable (BTT Octopus PF13, PF12, PF14)",
      "Home Optical Endstop to PG11",
      "Motor 4-wire (A+, A-, B+, B-)",
    ],
    explodedOffset: [-55, 0, 60],
  },
  {
    id: "build-piston",
    name: "Build Platform & Piston Elevator",
    category: "chamber",
    color: 0x10b981,
    description: "Precision-ground cast tooling plate mounted on an anti-backlash ball screw that steps down 20–50 µm after each fused layer.",
    specs: {
      "Build Volume": "200 mm × 200 mm × 200 mm (scalable to 500mm)",
      "Drive Mechanism": "SFU1204 Ball Screw (4mm lead) + Dual MGN12H Linear Rails",
      "Motor": "NEMA 23 High Torque Stepper (1.9 Nm, 2.8A)",
      "Layer Resolution": "Z repeatability ±2 µm",
    },
    wiringPinout: [
      "Motor B (BTT Octopus PG0, PG1, PF15)",
      "Z-Min Inductive Proximity Sensor to PG9",
      "Bed Heater 24V (optional for pre-heating)",
    ],
    explodedOffset: [0, 0, -60],
  },
  {
    id: "recoater",
    name: "Recoater Carriage & Powder Spreader",
    category: "motion",
    color: 0xec4899,
    description: "Motorized linear blade/roller that sweeps fresh metal powder across the build platform to create a uniform 30 µm powder layer.",
    specs: {
      "Blade Material": "Ground Tool Steel / High-temp silicone wiper blade",
      "Guide Rail": "MGN12 Linear Rail (350mm length)",
      "Drive Mechanism": "GT2 6mm Timing Belt + 20T Pulley",
      "Drive Motor": "NEMA 17 Stepper (0.45 Nm, 1.5A)",
    },
    wiringPinout: [
      "Motor C (BTT Octopus PF11, PG3, PG5)",
      "Recoater Optical Limit Switch to PG10",
      "Motor 4-wire (A+, A-, B+, B-)",
    ],
    explodedOffset: [0, -65, 0],
  },
  {
    id: "powder-hopper",
    name: "Powder Feed Hopper & Dosing Well",
    category: "chamber",
    color: 0x8b5cf6,
    description: "Precision powder reservoir with vertical dosing piston that dispenses exact powder dose ahead of the recoater sweep.",
    specs: {
      "Capacity": "2.5 Liters of spherical metal powder",
      "Dosing Increment": "30 – 100 µm volumetric dose per stroke",
      "Drive": "T8 lead screw with NEMA 17 reduction gearbox",
    },
    wiringPinout: [
      "Motor D (BTT Octopus PG4, PC1, PA0)",
      "Hopper Home Limit Switch to PG12",
    ],
    explodedOffset: [-60, 0, -30],
  },
  {
    id: "chassis-frame",
    name: "Structural Aluminum Frame & Shield",
    category: "chamber",
    color: 0x64748b,
    description: "Heavy 2040 and 4040 T-slot extrusion frame providing rigid vibration damping and mounting for optical column and chamber.",
    specs: {
      "Extrusions": "2040 & 4040 Black Anodized Aluminum T-Slot",
      "Footprint": "500 mm × 500 mm × 750 mm",
      "Protection": "Certified Laser Safety Viewing Shield (OD6+ at 450nm / 1064nm)",
    },
    wiringPinout: [
      "PE Protective Earth bonded to all frame members",
      "Door Interlock Safety Microswitch to PG15",
    ],
    explodedOffset: [0, 0, -20],
  },
];

export default function HardwarePage() {
  const [tier, setTier] = useState<"prototype" | "industrial">("prototype");
  const [selectedCadPart, setSelectedCadPart] = useState<string | null>(null);
  const calibration = DEFAULT_CALIBRATION_PARAMS;
  const optimizedPath = useMemo(() => {
    const segs = generatePresetLayerSegments("calibration_gear", 4.5);
    return optimizeToolpath(segs, "2opt_skywriting", calibration.scanSpeedMmPerSec, calibration.jumpSpeedMmPerSec);
  }, [calibration]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-300">
            <Wrench className="h-3.5 w-3.5" /> 3D CAD Assembly &amp; Hardware Architecture Selection
          </div>
          <h2 className="mt-0.5 text-lg font-bold text-white">
            {tier === "prototype"
              ? "Low-Cost $65 Prototype CAD: 5mW Kids Laser + Linear Focus Stage (Δz) + Stepper Mirrors + Descending Z-Bed"
              : "Industrial Metal SLM Scanhead ($3,870): Closed-Loop Galvo Servos + Powder Bed Recoater"}
          </h2>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
          <button
            onClick={() => setTier("prototype")}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              tier === "prototype"
                ? "bg-amber-400 text-slate-950 shadow"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            $65 DIY Prototype CAD (Arduino + Stepper + Kids Laser)
          </button>
          <button
            onClick={() => setTier("industrial")}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              tier === "industrial"
                ? "bg-cyan-400 text-slate-950 shadow"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            $3,870 Industrial SLM CAD
          </button>
        </div>
      </div>

      {tier === "prototype" ? (
        <div className="space-y-6">
          <div className="h-[680px] w-full overflow-hidden rounded-2xl border border-white/15 bg-[#090D16] shadow-2xl">
            <CadViewport3D
              calibration={calibration}
              optimizedPath={optimizedPath}
              selectedPartId={selectedCadPart}
              onSelectPart={setSelectedCadPart}
              onDownloadScad={() =>
                downloadTextFile("galvo_stepper_mount.scad", generateOpenScadMountCode(calibration))
              }
              onDownloadStl={(partId) =>
                downloadTextFile(`${partId}.stl`, `solid ${partId}\nendsolid ${partId}\n`)
              }
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-white">
                  Low-Cost Validation Prototype Bill of Materials (BOM)
                </h3>
                <p className="text-xs text-slate-400">
                  6 modular subsystems engineered to validate 2-axis galvo beam steering, motorized linear laser focus
                  (Δz), and descending Z-bed layer stepping on an Arduino Uno R3 + CNC Shield V3.
                </p>
              </div>
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3.5 py-2 text-right font-mono">
                <div className="text-[10px] uppercase text-emerald-300">Total Prototype Budget</div>
                <div className="text-base font-bold text-emerald-300">
                  $65.00 USD{" "}
                  <span className="text-xs font-normal text-slate-400">vs $3,870 Industrial</span>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {PROTOTYPE_CAD_PARTS.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedCadPart(item.id)}
                  className={`cursor-pointer rounded-xl border p-4 transition ${
                    selectedCadPart === item.id
                      ? "border-amber-400 bg-amber-400/10"
                      : "border-white/10 bg-black/30 hover:border-white/25"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] uppercase text-cyan-300">
                      {item.subsystem}
                    </span>
                    <span className="font-mono text-sm font-bold text-emerald-400">
                      ${item.costUsd.toFixed(2)}
                    </span>
                  </div>
                  <h4 className="mt-2 text-sm font-semibold text-white">{item.name}</h4>
                  <p className="mt-0.5 font-mono text-[11px] text-amber-300">{item.materialAndPrintSpec}</p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">{item.summary}</p>
                  <div className="mt-2 border-t border-white/10 pt-2 font-mono text-[10px] text-slate-300">
                    Pinout: {item.arduinoPinout.map((p) => `${p.signal} (${p.pin})`).join(" · ")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <IndustrialHardwareExplorer />
      )}
    </div>
  );
}

function IndustrialHardwareExplorer() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [exploded, setExploded] = useState<number>(0);
  const [selectedPartId, setSelectedPartId] = useState<string>("galvo-head");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [wireframeMode, setWireframeMode] = useState<boolean>(false);

  const selectedPart = MACHINE_PARTS.find((p) => p.id === selectedPartId) ?? MACHINE_PARTS[0];

  // Three.js Scene Setup & Component Mesh References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const meshGroupsRef = useRef<Map<string, THREE.Group>>(new Map());

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 700;
    const height = 520;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070b13);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.set(160, -210, 150);
    camera.up.set(0, 0, 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 20);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0x38bdf8, 1.6);
    keyLight.position.set(120, -120, 200);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xec4899, 0.9);
    fillLight.position.set(-120, 120, 100);
    scene.add(fillLight);

    // Build Table Base Grid
    const grid = new THREE.GridHelper(300, 30, 0x0284c7, 0x1e293b);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -70;
    scene.add(grid);

    // Build Assemblies
    const groups = new Map<string, THREE.Group>();

    // 1. Chassis Frame Group
    const frameGroup = new THREE.Group();
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });
    // 4 vertical pillars
    for (const [x, y] of [[-60, -60], [60, -60], [60, 60], [-60, 60]]) {
      const colGeom = new THREE.BoxGeometry(6, 6, 170);
      const col = new THREE.Mesh(colGeom, beamMat);
      col.position.set(x, y, 15);
      frameGroup.add(col);
    }
    // Top and bottom square rings
    for (const z of [-70, 100]) {
      const ringGeom = new THREE.BoxGeometry(126, 6, 6);
      const r1 = new THREE.Mesh(ringGeom, beamMat);
      r1.position.set(0, 60, z);
      const r2 = new THREE.Mesh(ringGeom, beamMat);
      r2.position.set(0, -60, z);
      const sideGeom = new THREE.BoxGeometry(6, 126, 6);
      const r3 = new THREE.Mesh(sideGeom, beamMat);
      r3.position.set(60, 0, z);
      const r4 = new THREE.Mesh(sideGeom, beamMat);
      r4.position.set(-60, 0, z);
      frameGroup.add(r1, r2, r3, r4);
    }
    scene.add(frameGroup);
    groups.set("chassis-frame", frameGroup);

    // 2. Build Piston & Chamber Elevator Group
    const pistonGroup = new THREE.Group();
    pistonGroup.position.set(0, 0, -40);
    // Build plate
    const plateGeom = new THREE.CylinderGeometry(35, 35, 6, 48);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0x10b981, metalness: 0.85, roughness: 0.2 });
    const plate = new THREE.Mesh(plateGeom, plateMat);
    plate.rotation.x = Math.PI / 2;
    pistonGroup.add(plate);
    // Ball screw
    const screwGeom = new THREE.CylinderGeometry(3.5, 3.5, 60, 24);
    const screwMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.95 });
    const screw = new THREE.Mesh(screwGeom, screwMat);
    screw.rotation.x = Math.PI / 2;
    screw.position.z = -33;
    pistonGroup.add(screw);
    // NEMA 23 Motor
    const nema23Geom = new THREE.BoxGeometry(18, 18, 22);
    const nemaMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7 });
    const nema23 = new THREE.Mesh(nema23Geom, nemaMat);
    nema23.position.z = -68;
    pistonGroup.add(nema23);
    scene.add(pistonGroup);
    groups.set("build-piston", pistonGroup);

    // 3. Powder Feed Hopper Group
    const hopperGroup = new THREE.Group();
    hopperGroup.position.set(-42, 0, -40);
    const hopperWellGeom = new THREE.BoxGeometry(16, 40, 50);
    const hopperWellMat = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, metalness: 0.6, transparent: true, opacity: 0.8 });
    const hopperWell = new THREE.Mesh(hopperWellGeom, hopperWellMat);
    hopperGroup.add(hopperWell);
    const hopperScrewGeom = new THREE.CylinderGeometry(2, 2, 40, 16);
    const hopperScrew = new THREE.Mesh(hopperScrewGeom, screwMat);
    hopperScrew.rotation.x = Math.PI / 2;
    hopperScrew.position.z = -30;
    hopperGroup.add(hopperScrew);
    scene.add(hopperGroup);
    groups.set("powder-hopper", hopperGroup);

    // 4. Recoater Carriage & Linear Blade Group
    const recoaterGroup = new THREE.Group();
    recoaterGroup.position.set(0, -35, -2);
    // Linear rail across chamber
    const mgnRailGeom = new THREE.BoxGeometry(110, 4, 3);
    const mgnRailMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.95 });
    const mgnRail = new THREE.Mesh(mgnRailGeom, mgnRailMat);
    recoaterGroup.add(mgnRail);
    // Carriage block
    const recBlockGeom = new THREE.BoxGeometry(14, 10, 8);
    const recBlockMat = new THREE.MeshStandardMaterial({ color: 0xec4899, metalness: 0.8 });
    const recBlock = new THREE.Mesh(recBlockGeom, recBlockMat);
    recoaterGroup.add(recBlock);
    // Spreader blade
    const bladeGeom = new THREE.BoxGeometry(75, 2, 10);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xf43f5e, metalness: 0.9 });
    const blade = new THREE.Mesh(bladeGeom, bladeMat);
    blade.position.set(0, 0, -4);
    recoaterGroup.add(blade);
    // NEMA 17 Stepper motor
    const nema17Geom = new THREE.BoxGeometry(14, 14, 14);
    const nema17 = new THREE.Mesh(nema17Geom, nemaMat);
    nema17.position.set(58, 0, 0);
    recoaterGroup.add(nema17);
    scene.add(recoaterGroup);
    groups.set("recoater", recoaterGroup);

    // 5. 3D Galvo Scanhead Enclosure
    const galvoHeadGroup = new THREE.Group();
    galvoHeadGroup.position.set(0, 0, 75);
    const headHousingGeom = new THREE.BoxGeometry(38, 38, 32);
    const headHousingMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.8,
      roughness: 0.2,
      transparent: true,
      opacity: 0.5,
    });
    const headHousing = new THREE.Mesh(headHousingGeom, headHousingMat);
    headHousing.position.z = 16;
    galvoHeadGroup.add(headHousing);
    // Lensless open exit nozzle
    const nozzleGeom = new THREE.CylinderGeometry(14, 15, 10, 32, 1, true);
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.9, side: THREE.DoubleSide });
    const nozzle = new THREE.Mesh(nozzleGeom, nozzleMat);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.z = 0;
    galvoHeadGroup.add(nozzle);
    scene.add(galvoHeadGroup);
    groups.set("galvo-head", galvoHeadGroup);

    // 6. Galvo Motor X
    const galvoXGroup = new THREE.Group();
    galvoXGroup.position.set(0, 11, 95);
    const motorXGeom = new THREE.CylinderGeometry(6, 6, 14, 24);
    const motorX = new THREE.Mesh(motorXGeom, new THREE.MeshStandardMaterial({ color: 0x0ea5e9, metalness: 0.9 }));
    galvoXGroup.add(motorX);
    const mirrorXGeom = new THREE.BoxGeometry(1.5, 11, 14);
    const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.99, roughness: 0.05 });
    const mirrorX = new THREE.Mesh(mirrorXGeom, mirrorMat);
    mirrorX.position.set(0, -11, -2);
    mirrorX.rotation.z = Math.PI / 4;
    galvoXGroup.add(mirrorX);
    scene.add(galvoXGroup);
    groups.set("galvo-x", galvoXGroup);

    // 7. Galvo Motor Y
    const galvoYGroup = new THREE.Group();
    galvoYGroup.position.set(13, 0, 83);
    const motorYGeom = new THREE.CylinderGeometry(6.5, 6.5, 16, 24);
    const motorY = new THREE.Mesh(motorYGeom, new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.9 }));
    motorY.rotation.z = Math.PI / 2;
    galvoYGroup.add(motorY);
    const mirrorYGeom = new THREE.BoxGeometry(14, 1.5, 16);
    const mirrorY = new THREE.Mesh(mirrorYGeom, mirrorMat);
    mirrorY.position.set(-13, 0, -2);
    mirrorY.rotation.x = Math.PI / 4;
    galvoYGroup.add(mirrorY);
    scene.add(galvoYGroup);
    groups.set("galvo-y", galvoYGroup);

    // 8. Fiber-In Dynamic Linear Focus Stage
    const dynamicFocusGroup = new THREE.Group();
    dynamicFocusGroup.position.set(-26, 0, 93);
    // Linear guide rods
    const rodGeom = new THREE.CylinderGeometry(0.8, 0.8, 28, 12);
    const rod1 = new THREE.Mesh(rodGeom, mgnRailMat);
    rod1.rotation.z = Math.PI / 2;
    rod1.position.y = 5;
    const rod2 = new THREE.Mesh(rodGeom, mgnRailMat);
    rod2.rotation.z = Math.PI / 2;
    rod2.position.y = -5;
    dynamicFocusGroup.add(rod1, rod2);
    // VCM / Linear motor carriage
    const vcmCarriageGeom = new THREE.BoxGeometry(10, 14, 10);
    const vcmCarriageMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.2 });
    const vcmCarriage = new THREE.Mesh(vcmCarriageGeom, vcmCarriageMat);
    dynamicFocusGroup.add(vcmCarriage);
    // Collimation barrel
    const colBarrelGeom = new THREE.CylinderGeometry(3.5, 3.5, 12, 16);
    const colBarrel = new THREE.Mesh(colBarrelGeom, new THREE.MeshStandardMaterial({ color: 0xffedd5, metalness: 0.95 }));
    colBarrel.rotation.z = Math.PI / 2;
    colBarrel.position.x = 8;
    dynamicFocusGroup.add(colBarrel);
    // Armored yellow fiber cable
    const fiberCableGeom = new THREE.CylinderGeometry(1.8, 1.8, 20, 16);
    const fiberCable = new THREE.Mesh(fiberCableGeom, new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.4 }));
    fiberCable.rotation.z = Math.PI / 2;
    fiberCable.position.x = -12;
    dynamicFocusGroup.add(fiberCable);
    scene.add(dynamicFocusGroup);
    groups.set("dynamic-focus", dynamicFocusGroup);

    meshGroupsRef.current = groups;

    // Optical Beam Simulation Ray
    const rayPositions = new Float32Array([
      -18, 0, 93, // Collimator
      0, 0, 93,   // Mirror X
      0, 0, 81,   // Mirror Y
      0, 0, -40,  // Build plate melt pool
    ]);
    const rayGeom = new THREE.BufferGeometry();
    rayGeom.setAttribute("position", new THREE.BufferAttribute(rayPositions, 3));
    const rayLine = new THREE.Line(
      rayGeom,
      new THREE.LineBasicMaterial({ color: 0xf43f5e, linewidth: 3, transparent: true, opacity: 0.85 })
    );
    scene.add(rayLine);

    // Animation loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (autoRotate) {
        scene.rotation.z += 0.003;
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
  }, [autoRotate]);

  // Update exploded offsets whenever exploded slider changes
  useEffect(() => {
    const factor = exploded / 100;
    for (const part of MACHINE_PARTS) {
      const group = meshGroupsRef.current.get(part.id);
      if (!group) continue;

      // Base positions
      const baseZ =
        part.id === "galvo-head"
          ? 75
          : part.id === "galvo-x"
          ? 95
          : part.id === "galvo-y"
          ? 83
          : part.id === "dynamic-focus"
          ? 93
          : part.id === "build-piston"
          ? -40
          : part.id === "powder-hopper"
          ? -40
          : part.id === "recoater"
          ? -2
          : 0;

      const baseX = part.id === "dynamic-focus" ? -26 : part.id === "galvo-y" ? 13 : part.id === "powder-hopper" ? -42 : 0;
      const baseY = part.id === "galvo-x" ? 11 : part.id === "recoater" ? -35 : 0;

      group.position.x = baseX + part.explodedOffset[0] * factor;
      group.position.y = baseY + part.explodedOffset[1] * factor;
      group.position.z = baseZ + part.explodedOffset[2] * factor;

      // Category filter visibility
      if (activeCategory === "all" || part.category === activeCategory) {
        group.visible = true;
      } else {
        group.visible = false;
      }
    }
  }, [exploded, activeCategory]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-gradient-to-r from-blue-950/40 via-cyan-950/20 to-slate-900/60 p-5 backdrop-blur">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-cyan-400/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-cyan-400">
              Prototype Engineering
            </span>
            <span className="text-xs text-slate-400">Hardware BOM &amp; Assembly Architecture</span>
          </div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">
            3D Machine Assembly &amp; Wiring Schematic
          </h2>
          <p className="text-xs text-slate-300">
            Interactive exploded 3D model, independent subsystem inspection, and electrical pinouts for prototype assembly.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              autoRotate
                ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                : "border-white/10 bg-white/5 text-slate-400 hover:text-white"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" /> {autoRotate ? "Auto-Rotate ON" : "Auto-Rotate PAUSED"}
          </button>
        </div>
      </div>

      {/* Main Grid: 3D Model Explorer on Left, Part Details & Wiring on Right */}
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        {/* Left: Interactive 3D Model Viewport */}
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-2xl">
            {/* Viewport Canvas */}
            <div ref={mountRef} className="h-[520px] w-full" />

            {/* Floating 3D Controls Overlay */}
            <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/80 p-3 backdrop-blur">
              {/* Exploded View Slider */}
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                  <Sliders className="h-4 w-4 text-cyan-400" /> Exploded View:
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={exploded}
                  onChange={(e) => setExploded(Number(e.target.value))}
                  className="w-36 accent-cyan-400 sm:w-48"
                />
                <span className="font-mono text-xs text-cyan-400">{exploded}%</span>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap gap-1">
                {(["all", "optics", "motion", "chamber"] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition ${
                      activeCategory === cat
                        ? "bg-cyan-500 text-slate-900"
                        : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Orbit Instructions Badge */}
            <div className="absolute left-4 top-4 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-mono text-slate-400 backdrop-blur">
              Left Click: Orbit · Right Click: Pan · Scroll: Zoom
            </div>
          </div>

          {/* Subsystems Quick Selector Chips */}
          <div className="flex flex-wrap gap-2">
            {MACHINE_PARTS.map((part) => (
              <button
                key={part.id}
                onClick={() => setSelectedPartId(part.id)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${
                  selectedPartId === part.id
                    ? "border-cyan-400 bg-cyan-400/10 text-white font-medium"
                    : "border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-slate-200"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: `#${part.color.toString(16)}` }} />
                {part.name}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Selected Part Specifications & Wiring */}
        <div className="space-y-4">
          {/* Active Part Inspector Card */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 shadow-lg">
            <div className="flex items-start justify-between">
              <div>
                <span className="rounded-full bg-cyan-400/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
                  {selectedPart.category} Subsystem
                </span>
                <h3 className="mt-1 text-lg font-bold text-white">{selectedPart.name}</h3>
              </div>
              <span
                className="h-4 w-4 rounded-full border border-white/20 shadow-sm"
                style={{ backgroundColor: `#${selectedPart.color.toString(16)}` }}
              />
            </div>

            <p className="mt-2 text-xs leading-relaxed text-slate-300">{selectedPart.description}</p>

            {/* Engineering Specifications */}
            <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <Info className="h-3.5 w-3.5 text-cyan-400" /> Engineering Specifications
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(selectedPart.specs).map(([key, val]) => (
                  <div key={key} className="rounded-lg bg-black/30 p-2 border border-white/5">
                    <div className="text-[10px] text-slate-400">{key}</div>
                    <div className="font-mono font-medium text-slate-200">{val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Dedicated Electrical Pinout */}
            <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <Cable className="h-3.5 w-3.5 text-amber-400" /> Electrical Pinout &amp; Wiring
              </h4>
              <div className="space-y-1.5">
                {selectedPart.wiringPinout.map((pin, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md bg-black/40 px-2.5 py-1.5 font-mono text-xs text-amber-300 border border-amber-500/10">
                    <ChevronRight className="h-3 w-3 text-amber-400 flex-shrink-0" />
                    <span>{pin}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Prototype Controller Wiring Reference */}
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-950/20 p-5 shadow-lg space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
              <Cpu className="h-4 w-4" /> Motion Board Pin Assignment (Octopus Pro / Marlin)
            </h3>
            <div className="space-y-1.5 font-mono text-[11px] text-slate-300">
              <div className="flex justify-between border-b border-white/5 py-1">
                <span className="text-slate-400">Dynamic Focus Z:</span>
                <span className="text-cyan-300">MOTOR 0 (PF13, PF12, PF14)</span>
              </div>
              <div className="flex justify-between border-b border-white/5 py-1">
                <span className="text-slate-400">Build Piston Z:</span>
                <span className="text-cyan-300">MOTOR 1 (PG0, PG1, PF15)</span>
              </div>
              <div className="flex justify-between border-b border-white/5 py-1">
                <span className="text-slate-400">Recoater Blade:</span>
                <span className="text-cyan-300">MOTOR 2 (PF11, PG3, PG5)</span>
              </div>
              <div className="flex justify-between border-b border-white/5 py-1">
                <span className="text-slate-400">Laser Gate (TTL):</span>
                <span className="text-rose-400">PA1 (Fast Digital Output)</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Laser PWM (Power):</span>
                <span className="text-amber-400">PA2 (Hardware Timer PWM)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
