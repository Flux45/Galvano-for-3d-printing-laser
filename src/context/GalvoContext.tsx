import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type {
  FieldSettings,
  HatchSettings,
  Layer,
  MeshGeometry,
  ProcessSettings,
  Shape,
  ShapeType,
  Toolpath,
} from "../lib/types";
import { generateToolpath } from "../lib/geometry";
import { loadCadFile } from "../lib/stepLoader";
import { sliceMesh } from "../lib/slicer";
import { planLayerToolpath } from "../lib/pathPlanner";

let idCounter = 1;
const nextId = (prefix: string) => `${prefix}-${idCounter++}`;

function defaultShapes(): Shape[] {
  return [
    { id: nextId("shape"), type: "star", cx: 0, cy: 0, size: 24, rotation: 0, sides: 6 },
    { id: nextId("shape"), type: "circle", cx: -45, cy: 30, size: 12, rotation: 0 },
    { id: nextId("shape"), type: "rect", cx: 45, cy: -30, size: 14, rotation: 20 },
  ];
}

function makeDefaultLayers(): Layer[] {
  const layers: Layer[] = [];
  for (let i = 0; i < 6; i++) {
    layers.push({ id: nextId("layer"), z: i * 0.05, shapes: i === 0 ? defaultShapes() : [] });
  }
  return layers;
}

interface GalvoState {
  layers: Layer[];
  activeLayerId: string;
  activeLayer: Layer;
  cadMesh: MeshGeometry | null;
  isLoadingCad: boolean;
  cadProgress: number;
  cadStatus: string;
  hatch: HatchSettings;
  process: ProcessSettings;
  field: FieldSettings;
  toolpath: Toolpath;
  allToolpaths: Record<string, Toolpath>;
  setActiveLayerId: (id: string) => void;
  addShape: (type: ShapeType) => void;
  updateShape: (id: string, patch: Partial<Shape>) => void;
  removeShape: (id: string) => void;
  addLayer: () => void;
  duplicateLayer: (id: string) => void;
  removeLayer: (id: string) => void;
  setHatch: (patch: Partial<HatchSettings>) => void;
  setProcess: (patch: Partial<ProcessSettings>) => void;
  setField: (patch: Partial<FieldSettings>) => void;
  loadAndSliceCad: (file: File) => Promise<void>;
  loadSampleCad: (samplePath: string, name: string) => Promise<void>;
  clearCad: () => void;
}

const GalvoContext = createContext<GalvoState | null>(null);

export function GalvoProvider({ children }: { children: ReactNode }) {
  const [layers, setLayers] = useState<Layer[]>(() => makeDefaultLayers());
  const [activeLayerId, setActiveLayerId] = useState<string>(() => layers[0].id);

  const [cadMesh, setCadMesh] = useState<MeshGeometry | null>(null);
  const [isLoadingCad, setIsLoadingCad] = useState(false);
  const [cadProgress, setCadProgress] = useState(0);
  const [cadStatus, setCadStatus] = useState("");

  // Metal SLM Laser defaults: 10 kW laser, 5000 mm/s (5 m/s) scan speed, 67° rotating hatch
  const [hatch, setHatchState] = useState<HatchSettings>({
    enabled: true,
    spacingMm: 0.1,
    angleDeg: 45,
    crossHatch: false,
    contourPasses: 1,
    rotationPerLayerDeg: 67,
  });

  const [process, setProcessState] = useState<ProcessSettings>({
    laserPowerPct: 100,
    scanSpeedMms: 5000, // 5 m/s
    jumpSpeedMms: 12000,
    jumpDelayUs: 200,
    markDelayUs: 10,
    laserOnDelayUs: 80,
    skywriting: true,
    layerHeightMicron: 50, // 50 µm
    laserPowerWatts: 10000, // 10 kW
  });

  const [field, setFieldState] = useState<FieldSettings>({
    fieldSizeMm: 500, // Expanded lensless 3D build area
    spotSizeMicron: 60,
    pincushionK: 0,
  });

  const activeLayer = layers.find((l) => l.id === activeLayerId) ?? layers[0];

  const addShape = (type: ShapeType) => {
    setLayers((prev) =>
      prev.map((l) =>
        l.id === activeLayerId
          ? {
              ...l,
              shapes: [
                ...l.shapes,
                {
                  id: nextId("shape"),
                  type,
                  cx: (Math.random() - 0.5) * 60,
                  cy: (Math.random() - 0.5) * 60,
                  size: 16,
                  rotation: 0,
                  sides: type === "polygon" || type === "star" ? 5 : undefined,
                },
              ],
            }
          : l,
      ),
    );
  };

  const updateShape = (id: string, patch: Partial<Shape>) => {
    setLayers((prev) =>
      prev.map((l) => ({
        ...l,
        shapes: l.shapes.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      })),
    );
  };

  const removeShape = (id: string) => {
    setLayers((prev) => prev.map((l) => ({ ...l, shapes: l.shapes.filter((s) => s.id !== id) })));
  };

  const addLayer = () => {
    setLayers((prev) => {
      const maxZ = prev.reduce((m, l) => Math.max(m, l.z), 0);
      const newLayer: Layer = {
        id: nextId("layer"),
        z: Number((maxZ + process.layerHeightMicron / 1000).toFixed(3)),
        shapes: [],
      };
      setActiveLayerId(newLayer.id);
      return [...prev, newLayer];
    });
  };

  const duplicateLayer = (id: string) => {
    setLayers((prev) => {
      const src = prev.find((l) => l.id === id);
      if (!src) return prev;
      const maxZ = prev.reduce((m, l) => Math.max(m, l.z), 0);
      const copy: Layer = {
        id: nextId("layer"),
        z: Number((maxZ + process.layerHeightMicron / 1000).toFixed(3)),
        shapes: src.shapes.map((s) => ({ ...s, id: nextId("shape") })),
        contours: src.contours ? src.contours.map((c) => [...c]) : undefined,
      };
      setActiveLayerId(copy.id);
      return [...prev, copy];
    });
  };

  const removeLayer = (id: string) => {
    setLayers((prev) => {
      if (prev.length <= 1) return prev;
      const filtered = prev.filter((l) => l.id !== id);
      if (activeLayerId === id) setActiveLayerId(filtered[0].id);
      return filtered;
    });
  };

  const setHatch = (patch: Partial<HatchSettings>) => setHatchState((prev) => ({ ...prev, ...patch }));
  const setProcess = (patch: Partial<ProcessSettings>) => setProcessState((prev) => ({ ...prev, ...patch }));
  const setField = (patch: Partial<FieldSettings>) => setFieldState((prev) => ({ ...prev, ...patch }));

  // Load and slice CAD/STEP file
  const loadAndSliceCad = async (file: File) => {
    try {
      setIsLoadingCad(true);
      setCadProgress(10);
      setCadStatus(`Parsing CAD file: ${file.name}...`);

      const mesh = await loadCadFile(file);
      setCadMesh(mesh);
      setCadProgress(50);
      setCadStatus(`Slicing 3D mesh (${mesh.triangleCount.toLocaleString()} triangles)...`);

      const layerHeightMm = process.layerHeightMicron / 1000;
      const sliced = sliceMesh(mesh, layerHeightMm, (pct) => {
        setCadProgress(50 + Math.round(pct * 0.4));
      });

      if (sliced.length === 0) {
        throw new Error("No layers generated from mesh. Check model geometry.");
      }

      setCadStatus(`Generating galvo scan paths (${sliced.length} layers)...`);
      const newLayers: Layer[] = sliced.map((s) => ({
        id: nextId("layer"),
        z: s.z,
        shapes: [],
        contours: s.contours,
      }));

      setLayers(newLayers);
      setActiveLayerId(newLayers[0].id);
      setCadProgress(100);
      setCadStatus(`Ready: ${sliced.length} layers sliced.`);
    } catch (err: any) {
      console.error("CAD Slicing Error:", err);
      setCadStatus(`Error loading/slicing CAD file: ${err.message || err}`);
    } finally {
      setIsLoadingCad(false);
    }
  };

  const loadSampleCad = async (sampleUrl: string, sampleName: string) => {
    try {
      setIsLoadingCad(true);
      setCadProgress(15);
      setCadStatus(`Fetching sample model ${sampleName}...`);
      const res = await fetch(sampleUrl);
      if (!res.ok) throw new Error(`Failed to load ${sampleUrl}: ${res.statusText}`);
      const blob = await res.blob();
      const file = new File([blob], sampleName, { type: "application/octet-stream" });
      await loadAndSliceCad(file);
    } catch (err: any) {
      console.error(err);
      setCadStatus(`Could not load sample: ${err.message}`);
      setIsLoadingCad(false);
    }
  };

  const clearCad = () => {
    setCadMesh(null);
    setLayers(makeDefaultLayers());
    setActiveLayerId("layer-1");
    setCadStatus("");
  };

  // Compute active layer toolpath immediately for instant rendering
  const toolpath = useMemo(() => {
    if (!activeLayer) {
      return { segments: [], totalLengthMm: 0, estimatedTimeS: 0 };
    }
    const idx = Math.max(0, layers.findIndex((l) => l.id === activeLayer.id));
    if (activeLayer.contours && activeLayer.contours.length > 0) {
      return planLayerToolpath(idx, activeLayer.contours, hatch, process);
    }
    return generateToolpath(activeLayer.shapes, hatch, process.scanSpeedMms);
  }, [activeLayer, layers, hatch, process]);

  // Lazy on-demand toolpath generator for full-job exports without blocking UI thread on CAD load
  const allToolpaths = useMemo(() => {
    const cache = new Map<string, Toolpath>();
    if (activeLayer && toolpath) {
      cache.set(activeLayer.id, toolpath);
    }

    return new Proxy({} as Record<string, Toolpath>, {
      get(_target, prop: string | symbol) {
        if (typeof prop !== "string") return undefined;
        if (cache.has(prop)) return cache.get(prop);
        const idx = layers.findIndex((l) => l.id === prop);
        if (idx === -1) return undefined;
        const l = layers[idx];
        let tp: Toolpath;
        if (l.contours && l.contours.length > 0) {
          tp = planLayerToolpath(idx, l.contours, hatch, process);
        } else {
          tp = generateToolpath(l.shapes, hatch, process.scanSpeedMms);
        }
        cache.set(prop, tp);
        return tp;
      },
      has(_target, prop: string | symbol) {
        if (typeof prop !== "string") return false;
        return layers.some((l) => l.id === prop);
      },
    });
  }, [layers, hatch, process, activeLayer, toolpath]);

  const value: GalvoState = {
    layers,
    activeLayerId: activeLayer.id,
    activeLayer,
    cadMesh,
    isLoadingCad,
    cadProgress,
    cadStatus,
    hatch,
    process,
    field,
    toolpath,
    allToolpaths,
    setActiveLayerId,
    addShape,
    updateShape,
    removeShape,
    addLayer,
    duplicateLayer,
    removeLayer,
    setHatch,
    setProcess,
    setField,
    loadAndSliceCad,
    loadSampleCad,
    clearCad,
  };

  return <GalvoContext.Provider value={value}>{children}</GalvoContext.Provider>;
}

export function useGalvo() {
  const ctx = useContext(GalvoContext);
  if (!ctx) throw new Error("useGalvo must be used within GalvoProvider");
  return ctx;
}
