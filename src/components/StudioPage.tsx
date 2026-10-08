import { useEffect, useRef, useState } from "react";
import {
  Circle as CircleIcon,
  Hexagon,
  Layers,
  Pause,
  Play,
  Plus,
  RotateCw,
  Square,
  Star,
  Timer,
  Trash2,
  Copy,
  Ruler,
} from "lucide-react";
import { useGalvo } from "../context/GalvoContext";
import ScanCanvas from "./studio/ScanCanvas";
import type { ShapeType } from "../lib/types";

const SHAPE_BUTTONS: { type: ShapeType; icon: typeof CircleIcon; label: string }[] = [
  { type: "circle", icon: CircleIcon, label: "Circle" },
  { type: "rect", icon: Square, label: "Rect" },
  { type: "polygon", icon: Hexagon, label: "Polygon" },
  { type: "star", icon: Star, label: "Star" },
];

export default function StudioPage() {
  const {
    layers,
    activeLayer,
    setActiveLayerId,
    addShape,
    updateShape,
    removeShape,
    addLayer,
    duplicateLayer,
    removeLayer,
    hatch,
    setHatch,
    process,
    setProcess,
    field,
    toolpath,
  } = useGalvo();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [showJumps, setShowJumps] = useState(true);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  const selectedShape = activeLayer.shapes.find((s) => s.id === selectedId) ?? null;

  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    const durationMs = Math.max(800, toolpath.estimatedTimeS * 180);
    startRef.current = performance.now();
    const tick = (t: number) => {
      const elapsed = t - startRef.current;
      const p = Math.min(1, elapsed / durationMs);
      setProgress(p);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setPlaying(false);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  return (
    <div className="grid gap-5 xl:grid-cols-[230px_1fr_300px]">
      {/* Layer list */}
      <div className="order-1 space-y-3 xl:order-1">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white">
            <Layers className="h-4 w-4 text-cyan-300" /> Layers
          </h3>
          <button
            onClick={addLayer}
            className="flex items-center gap-1 rounded-lg bg-cyan-400/10 px-2 py-1 text-xs font-medium text-cyan-300 hover:bg-cyan-400/20"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        <div className="max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
          {layers.map((l, i) => (
            <div
              key={l.id}
              onClick={() => setActiveLayerId(l.id)}
              className={`group flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-xs transition ${
                l.id === activeLayer.id
                  ? "border-cyan-400/50 bg-cyan-400/10 text-white"
                  : "border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20"
              }`}
            >
              <div>
                <div className="font-medium">Layer {i + 1}</div>
                <div className="text-[10px] text-slate-500">Z {l.z.toFixed(3)}mm · {l.shapes.length} shape(s)</div>
              </div>
              <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                <button
                  title="Duplicate"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicateLayer(l.id);
                  }}
                  className="rounded p-1 hover:bg-white/10"
                >
                  <Copy className="h-3 w-3" />
                </button>
                <button
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeLayer(l.id);
                  }}
                  className="rounded p-1 hover:bg-white/10"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-slate-400">
          <p className="mb-1 font-medium text-slate-300">Add shape to active layer</p>
          <div className="grid grid-cols-2 gap-2">
            {SHAPE_BUTTONS.map((s) => (
              <button
                key={s.type}
                onClick={() => addShape(s.type)}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] py-2 hover:border-cyan-400/40 hover:text-cyan-300"
              >
                <s.icon className="h-3.5 w-3.5" /> {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="order-3 space-y-3 xl:order-2">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (playing) {
                  setPlaying(false);
                } else {
                  setProgress(0);
                  setPlaying(true);
                }
              }}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-cyan-300"
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {playing ? "Pause" : "Simulate scan"}
            </button>
            <button
              onClick={() => {
                setPlaying(false);
                setProgress(null);
              }}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
            >
              Show full path
            </button>
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              <input type="checkbox" checked={showJumps} onChange={(e) => setShowJumps(e.target.checked)} className="accent-cyan-400" />
              Show jumps
            </label>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <Ruler className="h-3.5 w-3.5 text-cyan-300" /> {toolpath.totalLengthMm.toFixed(1)} mm
            </span>
            <span className="flex items-center gap-1">
              <Timer className="h-3.5 w-3.5 text-cyan-300" /> {toolpath.estimatedTimeS.toFixed(2)} s/layer
            </span>
          </div>
        </div>

        <div className="flex justify-center rounded-xl bg-black/30 p-2">
          <ScanCanvas
            shapes={activeLayer.shapes}
            toolpath={toolpath}
            fieldSizeMm={field.fieldSizeMm}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={(id, cx, cy) => updateShape(id, { cx, cy })}
            progress={progress}
            showHatch={hatch.enabled}
            showJumps={showJumps}
          />
        </div>
        <p className="text-center text-[11px] text-slate-500">
          Field: {field.fieldSizeMm}mm circular scan area · drag shapes directly on canvas · red = laser-on travel,
          yellow dashed = laser-off jump
        </p>
      </div>

      {/* Inspector */}
      <div className="order-2 space-y-4 xl:order-3">
        {selectedShape ? (
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Shape properties</h3>
              <button
                onClick={() => {
                  removeShape(selectedShape.id);
                  setSelectedId(null);
                }}
                className="rounded p-1 text-rose-400 hover:bg-rose-500/10"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <NumberField label="X (mm)" value={selectedShape.cx} step={0.5} onChange={(v) => updateShape(selectedShape.id, { cx: v })} />
            <NumberField label="Y (mm)" value={selectedShape.cy} step={0.5} onChange={(v) => updateShape(selectedShape.id, { cy: v })} />
            <NumberField label="Size (mm)" value={selectedShape.size} step={0.5} min={1} onChange={(v) => updateShape(selectedShape.id, { size: v })} />
            <NumberField
              label="Rotation (°)"
              value={selectedShape.rotation}
              step={5}
              onChange={(v) => updateShape(selectedShape.id, { rotation: v })}
              icon={<RotateCw className="h-3 w-3" />}
            />
            {(selectedShape.type === "polygon" || selectedShape.type === "star") && (
              <NumberField
                label="Sides/points"
                value={selectedShape.sides ?? 5}
                step={1}
                min={3}
                max={12}
                onChange={(v) => updateShape(selectedShape.id, { sides: Math.round(v) })}
              />
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/15 p-4 text-center text-xs text-slate-500">
            Select a shape on the canvas to edit its geometry, or add a new one from the left panel.
          </div>
        )}

        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h3 className="text-sm font-semibold text-white">Hatch fill</h3>
          <label className="flex items-center justify-between text-xs text-slate-300">
            Enabled
            <input type="checkbox" checked={hatch.enabled} onChange={(e) => setHatch({ enabled: e.target.checked })} className="accent-cyan-400" />
          </label>
          <NumberField label="Spacing (mm)" value={hatch.spacingMm} step={0.01} min={0.02} onChange={(v) => setHatch({ spacingMm: v })} />
          <NumberField label="Angle (°)" value={hatch.angleDeg} step={5} onChange={(v) => setHatch({ angleDeg: v })} />
          <NumberField label="Contour passes" value={hatch.contourPasses} step={1} min={0} max={5} onChange={(v) => setHatch({ contourPasses: Math.round(v) })} />
          <label className="flex items-center justify-between text-xs text-slate-300">
            Cross-hatch (0°/90°)
            <input type="checkbox" checked={hatch.crossHatch} onChange={(e) => setHatch({ crossHatch: e.target.checked })} className="accent-cyan-400" />
          </label>
        </div>

        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h3 className="text-sm font-semibold text-white">Process settings</h3>
          <NumberField label="Laser power (%)" value={process.laserPowerPct} step={1} min={0} max={100} onChange={(v) => setProcess({ laserPowerPct: v })} />
          <NumberField label="Scan speed (mm/s)" value={process.scanSpeedMms} step={50} min={10} onChange={(v) => setProcess({ scanSpeedMms: v })} />
          <NumberField label="Jump speed (mm/s)" value={process.jumpSpeedMms} step={100} min={10} onChange={(v) => setProcess({ jumpSpeedMms: v })} />
          <NumberField label="Jump delay (µs)" value={process.jumpDelayUs} step={10} min={0} onChange={(v) => setProcess({ jumpDelayUs: v })} />
          <NumberField label="Layer height (µm)" value={process.layerHeightMicron} step={5} min={10} onChange={(v) => setProcess({ layerHeightMicron: v })} />
          <label className="flex items-center justify-between text-xs text-slate-300">
            Skywriting (corner comp.)
            <input type="checkbox" checked={process.skywriting} onChange={(e) => setProcess({ skywriting: e.target.checked })} className="accent-cyan-400" />
          </label>
        </div>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  icon,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  icon?: React.ReactNode;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs text-slate-300">
      <span className="flex items-center gap-1">
        {icon} {label}
      </span>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-right text-xs text-white outline-none focus:border-cyan-400/50"
      />
    </label>
  );
}
