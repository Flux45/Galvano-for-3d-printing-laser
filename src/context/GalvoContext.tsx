import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { FieldSettings, HatchSettings, Layer, ProcessSettings, Shape, ShapeType, Toolpath } from "../lib/types";
import { generateToolpath } from "../lib/geometry";

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
  hatch: HatchSettings;
  process: ProcessSettings;
  field: FieldSettings;
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
  activeLayer: Layer;
  toolpath: Toolpath;
  allToolpaths: Record<string, Toolpath>;
}

const GalvoContext = createContext<GalvoState | null>(null);

export function GalvoProvider({ children }: { children: ReactNode }) {
  const [layers, setLayers] = useState<Layer[]>(() => makeDefaultLayers());
  const [activeLayerId, setActiveLayerId] = useState<string>(() => layers[0].id);
  const [hatch, setHatchState] = useState<HatchSettings>({
    enabled: true,
    spacingMm: 0.1,
    angleDeg: 45,
    crossHatch: false,
    contourPasses: 1,
  });
  const [process, setProcessState] = useState<ProcessSettings>({
    laserPowerPct: 65,
    scanSpeedMms: 3500,
    jumpSpeedMms: 8000,
    jumpDelayUs: 300,
    markDelayUs: 5,
    laserOnDelayUs: 120,
    skywriting: true,
    layerHeightMicron: 50,
  });
  const [field, setFieldState] = useState<FieldSettings>({
    fieldSizeMm: 150,
    spotSizeMicron: 85,
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
      const newLayer: Layer = { id: nextId("layer"), z: Number((maxZ + process.layerHeightMicron / 1000).toFixed(3)), shapes: [] };
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

  const allToolpaths = useMemo(() => {
    const map: Record<string, Toolpath> = {};
    for (const l of layers) {
      map[l.id] = generateToolpath(l.shapes, hatch, process.scanSpeedMms);
    }
    return map;
  }, [layers, hatch, process.scanSpeedMms]);

  const toolpath = allToolpaths[activeLayer.id];

  const value: GalvoState = {
    layers,
    activeLayerId: activeLayer.id,
    hatch,
    process,
    field,
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
    activeLayer,
    toolpath,
    allToolpaths,
  };

  return <GalvoContext.Provider value={value}>{children}</GalvoContext.Provider>;
}

export function useGalvo() {
  const ctx = useContext(GalvoContext);
  if (!ctx) throw new Error("useGalvo must be used within GalvoProvider");
  return ctx;
}
