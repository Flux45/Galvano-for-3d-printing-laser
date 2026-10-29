import { useEffect, useRef, useState, useMemo } from "react";
import {
  Activity,
  Box,
  Circle as CircleIcon,
  ChevronLeft,
  ChevronRight,
  Compass,
  Eye,
  FastForward,
  FileUp,
  Flame,
  Gauge,
  Hexagon,
  Layers,
  Maximize2,
  Pause,
  Play,
  RotateCw,
  Ruler,
  Square,
  Star,
  Timer,
  Trash2,
  UploadCloud,
  Zap,
} from "lucide-react";
import { useGalvo } from "../context/GalvoContext";
import ScanCanvas from "./studio/ScanCanvas";
import ThreeMeshViewer from "./studio/ThreeMeshViewer";
import GalvoMirrorVisualizer from "./studio/GalvoMirrorVisualizer";
import { getActiveLaserSpot, defaultGalvoKinematics } from "../lib/galvoKinematics";
import { estimateLayerMetrics } from "../lib/pathPlanner";
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
    hatch,
    setHatch,
    process,
    setProcess,
    field,
    toolpath,
    allToolpaths,
    cadMesh,
    isLoadingCad,
    cadProgress,
    cadStatus,
    loadAndSliceCad,
    loadSampleCad,
    clearCad,
  } = useGalvo();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playAllLayers, setPlayAllLayers] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(2);
  const [showJumps, setShowJumps] = useState(true);
  const [recoating, setRecoating] = useState(false);
  const [viewMode, setViewMode] = useState<"galvo" | "3d" | "mirrors" | "both">("galvo");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  const selectedShape = activeLayer.shapes.find((s) => s.id === selectedId) ?? null;
  const activeLayerIndex = Math.max(0, layers.findIndex((l) => l.id === activeLayer.id));

  // Instantaneous laser beam spot and servo mirror tilt angles
  const currentSpot = useMemo(() => {
    return getActiveLaserSpot(toolpath, progress);
  }, [toolpath, progress]);

  const mirrorAngles = useMemo(() => {
    return defaultGalvoKinematics.xyToMirrorAngles(currentSpot.point.x, currentSpot.point.y, activeLayer.z);
  }, [currentSpot, activeLayer.z]);

  // Compute total job statistics instantaneously without blocking the UI thread
  const jobStats = useMemo(() => {
    let totalLengthMm = 0;
    let totalEstimatedTimeS = 0;
    for (const l of layers) {
      if (l.id === activeLayer.id && toolpath) {
        totalLengthMm += toolpath.totalLengthMm;
        totalEstimatedTimeS += toolpath.estimatedTimeS;
      } else if (l.contours && l.contours.length > 0) {
        const est = estimateLayerMetrics(l.contours, hatch, process);
        totalLengthMm += est.totalLengthMm;
        totalEstimatedTimeS += est.estimatedTimeS;
      } else {
        const tp = allToolpaths[l.id];
        if (tp) {
          totalLengthMm += tp.totalLengthMm;
          totalEstimatedTimeS += tp.estimatedTimeS;
        }
      }
    }
    // Estimated time at configured scan speed (5000 mm/s) plus recoater delay (1.5s per layer)
    const scanTimeS = totalLengthMm / Math.max(1, process.scanSpeedMms);
    const recoatTimeS = layers.length * 1.5;
    const totalJobTimeS = scanTimeS + recoatTimeS;

    const powerWatts = process.laserPowerWatts ?? 10000;
    const linearEnergyDensity = Number((powerWatts / Math.max(1, process.scanSpeedMms)).toFixed(2));
    const hatchSpacing = hatch.spacingMm;
    const layerHeight = process.layerHeightMicron / 1000;
    const volumetricEnergyDensity = Number(
      (powerWatts / (Math.max(1, process.scanSpeedMms) * hatchSpacing * layerHeight)).toFixed(1)
    );

    return {
      totalLengthMm,
      scanTimeS,
      totalJobTimeS,
      linearEnergyDensity,
      volumetricEnergyDensity,
    };
  }, [layers, activeLayer.id, toolpath, allToolpaths, process.scanSpeedMms, process.laserPowerWatts, process.layerHeightMicron, hatch]);

  // Animation controller
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    // Dynamic duration based on path length and speed multiplier
    const rawDuration = Math.max(800, toolpath.estimatedTimeS * 1000);
    const durationMs = Math.max(300, rawDuration / (speedMultiplier * 4));
    startRef.current = performance.now();

    const tick = (t: number) => {
      const elapsed = t - startRef.current;
      const p = Math.min(1, elapsed / durationMs);
      setProgress(p);

      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        if (playAllLayers && activeLayerIndex < layers.length - 1) {
          // Trigger brief recoater blade sweep simulation, then step to next layer
          setRecoating(true);
          setTimeout(() => {
            setRecoating(false);
            setActiveLayerId(layers[activeLayerIndex + 1].id);
            setProgress(0);
            startRef.current = performance.now();
            rafRef.current = requestAnimationFrame(tick);
          }, 350);
        } else {
          setPlaying(false);
          setPlayAllLayers(false);
        }
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, playAllLayers, activeLayerIndex, layers, toolpath.estimatedTimeS, speedMultiplier, setActiveLayerId]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadAndSliceCad(file);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner: CAD Import Bar & Metal SLM Process Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/80 p-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".step,.stp,.iges,.igs,.brep,.stl,.obj"
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoadingCad}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-xs font-semibold text-slate-900 shadow-lg shadow-cyan-500/25 transition hover:brightness-110 disabled:opacity-50"
          >
            <UploadCloud className="h-4 w-4 text-slate-900" />
            Upload STEP / CAD File
          </button>

          <span className="text-xs text-slate-400">or load sample:</span>
          <button
            onClick={() => { const b = import.meta.env.BASE_URL || "./"; const p = b.endsWith("/") ? b : b + "/"; loadSampleCad(p + "samples/cube.stp", "cube.stp"); }}
            disabled={isLoadingCad}
            className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-cyan-400/50 hover:text-cyan-300"
          >
            Basic Cube (STEP)
          </button>
          <button
            onClick={() => { const b = import.meta.env.BASE_URL || "./"; const p = b.endsWith("/") ? b : b + "/"; loadSampleCad(p + "samples/rounded-cube.step", "rounded-cube.step"); }}
            disabled={isLoadingCad}
            className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-cyan-400/50 hover:text-cyan-300"
          >
            Rounded Cube (STEP)
          </button>

          {cadMesh && (
            <button
              onClick={clearCad}
              className="flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear CAD
            </button>
          )}
        </div>

        {/* CAD Model & Process Badges */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {cadMesh ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-emerald-300">
              <Box className="h-3.5 w-3.5" />
              <span>
                {cadMesh.filename} · {cadMesh.bounds.sizeX.toFixed(1)}×{cadMesh.bounds.sizeY.toFixed(1)}×
                {cadMesh.bounds.sizeZ.toFixed(1)}mm · {cadMesh.triangleCount.toLocaleString()} tris
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-cyan-300">
              <Activity className="h-3.5 w-3.5" /> Procedural Vectors Active
            </div>
          )}

          <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 font-mono text-amber-300">
            <Flame className="h-3.5 w-3.5" /> 10 kW · 5000 mm/s · 2.0 J/mm
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 font-mono text-cyan-300">
            <Maximize2 className="h-3.5 w-3.5" /> Lensless 3D Field: {field.fieldSizeMm}mm Ø
          </div>
        </div>
      </div>

      {/* Slicing Progress Bar */}
      {isLoadingCad && (
        <div className="space-y-2 rounded-xl border border-cyan-400/30 bg-cyan-950/40 p-4">
          <div className="flex justify-between text-xs text-cyan-300">
            <span className="font-semibold">{cadStatus || "Processing CAD file..."}</span>
            <span>{cadProgress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300"
              style={{ width: `${cadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Main Studio Grid */}
      <div className="grid gap-5 xl:grid-cols-[250px_1fr_320px]">
        {/* Left Column: Layer Management & CAD Navigation */}
        <div className="order-1 space-y-3 xl:order-1">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white">
              <Layers className="h-4 w-4 text-cyan-300" /> Layers ({layers.length})
            </h3>
            <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-[11px] text-slate-400">
              Δz: {process.layerHeightMicron}µm
            </span>
          </div>

          {/* Layer Quick Scroller */}
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-2">
            <button
              onClick={() => {
                if (activeLayerIndex > 0) setActiveLayerId(layers[activeLayerIndex - 1].id);
              }}
              disabled={activeLayerIndex === 0}
              className="rounded p-1 hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex-1 text-center text-xs">
              <span className="font-semibold text-white">Layer {activeLayerIndex + 1}</span> of {layers.length}
              <div className="text-[10px] font-mono text-cyan-400">Z: {activeLayer.z.toFixed(3)} mm</div>
            </div>
            <button
              onClick={() => {
                if (activeLayerIndex < layers.length - 1) setActiveLayerId(layers[activeLayerIndex + 1].id);
              }}
              disabled={activeLayerIndex === layers.length - 1}
              className="rounded p-1 hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Layer List */}
          <div className="max-h-[480px] space-y-1.5 overflow-y-auto pr-1">
            {layers.map((l, i) => (
              <div
                key={l.id}
                onClick={() => setActiveLayerId(l.id)}
                className={`group flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-xs transition ${
                  l.id === activeLayer.id
                    ? "border-cyan-400/50 bg-cyan-400/10 text-white shadow-sm"
                    : "border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20"
                }`}
              >
                <div>
                  <div className="font-medium">Layer {i + 1}</div>
                  <div className="text-[10px] text-slate-500">
                    Z {l.z.toFixed(3)}mm · {l.contours ? `${l.contours.length} contour(s)` : `${l.shapes.length} shape(s)`}
                  </div>
                </div>
                <div className="text-right font-mono text-[10px] text-slate-400">
                  {l.id === activeLayer.id && toolpath?.totalLengthMm
                    ? `${toolpath.totalLengthMm.toFixed(1)} mm`
                    : ""}
                </div>
              </div>
            ))}
          </div>

          {!cadMesh && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-slate-400">
              <p className="mb-2 font-medium text-slate-300">Add 2D Shape to active layer</p>
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
          )}
        </div>

        {/* Middle Column: Viewport & Galvano Movement Simulation */}
        <div className="order-3 space-y-3 xl:order-2">
          {/* Top Control Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {/* Simulate Single Layer */}
              <button
                onClick={() => {
                  if (playing) {
                    setPlaying(false);
                    setPlayAllLayers(false);
                  } else {
                    setProgress(0);
                    setPlayAllLayers(false);
                    setPlaying(true);
                  }
                }}
                className="flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-cyan-300"
              >
                {playing && !playAllLayers ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {playing && !playAllLayers ? "Pause" : "Simulate Layer"}
              </button>

              {/* Continuous Multi-Layer Print */}
              <button
                onClick={() => {
                  if (playing && playAllLayers) {
                    setPlaying(false);
                    setPlayAllLayers(false);
                  } else {
                    setProgress(0);
                    setPlayAllLayers(true);
                    setPlaying(true);
                  }
                }}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-rose-500 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:brightness-110"
              >
                <Flame className="h-3.5 w-3.5 text-white" />
                {playing && playAllLayers ? "Stop Print" : "Print All Layers"}
              </button>

              {/* Show Full Path */}
              <button
                onClick={() => {
                  setPlaying(false);
                  setPlayAllLayers(false);
                  setProgress(null);
                }}
                className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10"
              >
                Show Full Path
              </button>

              {/* Speed Multiplier */}
              <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5 text-[11px]">
                {[1, 2, 5, 10].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setSpeedMultiplier(spd)}
                    className={`rounded px-1.5 py-0.5 font-medium transition ${
                      speedMultiplier === spd ? "bg-cyan-400 text-slate-900" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1 text-xs">
              <button
                onClick={() => setViewMode("galvo")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition ${
                  viewMode === "galvo" ? "bg-cyan-400 text-slate-900" : "text-slate-300 hover:text-white"
                }`}
              >
                <Zap className="h-3 w-3" /> Galvo 2D
              </button>
              {cadMesh && (
                <button
                  onClick={() => setViewMode("3d")}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition ${
                    viewMode === "3d" ? "bg-cyan-400 text-slate-900" : "text-slate-300 hover:text-white"
                  }`}
                >
                  <Box className="h-3 w-3" /> 3D Part
                </button>
              )}
              <button
                onClick={() => setViewMode("mirrors")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition ${
                  viewMode === "mirrors" ? "bg-cyan-400 text-slate-900" : "text-slate-300 hover:text-white"
                }`}
              >
                <Compass className="h-3 w-3" /> Mirror Optics
              </button>
              {cadMesh && (
                <button
                  onClick={() => setViewMode("both")}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition ${
                    viewMode === "both" ? "bg-cyan-400 text-slate-900" : "text-slate-300 hover:text-white"
                  }`}
                >
                  <Eye className="h-3 w-3" /> Split View
                </button>
              )}
            </div>
          </div>

          {/* Recoater Blade Animation Overlay Notification */}
          {recoating && (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/20 py-2 text-xs font-semibold text-cyan-200 animate-pulse">
              <FastForward className="h-4 w-4" /> Recoating metal powder bed... Stepping Z stage
            </div>
          )}

          {/* Viewport Render Area */}
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl bg-black/40 p-3">
            {(viewMode === "galvo" || viewMode === "both") && (
              <div className="relative w-full max-w-[580px]">
                <ScanCanvas
                  shapes={activeLayer.shapes}
                  contours={activeLayer.contours}
                  toolpath={toolpath}
                  fieldSizeMm={field.fieldSizeMm}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onMove={(id, cx, cy) => updateShape(id, { cx, cy })}
                  progress={progress}
                  showHatch={hatch.enabled}
                  showJumps={showJumps}
                />
                {/* Active scan status indicator overlay */}
                <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg bg-black/70 px-2.5 py-1 text-[11px] text-slate-300 backdrop-blur border border-white/10">
                  <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                  <span>
                    Layer {activeLayerIndex + 1}/{layers.length} · Z={activeLayer.z.toFixed(3)}mm ·{" "}
                    {toolpath.totalLengthMm.toFixed(1)} mm path
                  </span>
                </div>
              </div>
            )}

            {cadMesh && (viewMode === "3d" || viewMode === "both") && (
              <div className="w-full max-w-[580px]">
                <ThreeMeshViewer
                  mesh={cadMesh}
                  activeZ={activeLayer.z}
                  toolpath={toolpath}
                  progress={progress}
                  totalLayers={layers.length}
                  currentLayerIndex={activeLayerIndex}
                />
              </div>
            )}

            {viewMode === "mirrors" && (
              <div className="w-full max-w-[720px]">
                <GalvoMirrorVisualizer
                  activePoint={currentSpot.point}
                  isLaserOn={currentSpot.isLaserOn}
                  toolpath={toolpath}
                  scanSpeedMms={process.scanSpeedMms}
                  activeZ={activeLayer.z}
                  fieldSizeMm={field.fieldSizeMm}
                />
              </div>
            )}
          </div>

          {/* Canvas Bottom Legend */}
          <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-4 rounded bg-rose-500" /> Laser Melt Path (ON)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-4 rounded border border-dashed border-amber-400 bg-amber-400/20" /> Galvo Jump (OFF)
              </span>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showJumps}
                  onChange={(e) => setShowJumps(e.target.checked)}
                  className="accent-cyan-400"
                />
                Show jumps
              </label>
            </div>
            <div>
              Scanning field: <span className="text-slate-200">{field.fieldSizeMm}mm</span> Ø
            </div>
          </div>
        </div>

        {/* Right Column: Metal SLM Metrics & Process Inspector */}
        <div className="order-2 space-y-4 xl:order-3">
          {/* SLM Metrics Card */}
          <div className="space-y-3 rounded-xl border border-cyan-400/20 bg-cyan-950/20 p-4 shadow-lg">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
              <Gauge className="h-4 w-4" /> Metal SLM Process Metrics
            </h3>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-black/40 p-2 border border-white/5">
                <div className="text-[10px] text-slate-400">Linear Energy Density</div>
                <div className="text-base font-bold text-amber-300">
                  {jobStats.linearEnergyDensity} <span className="text-[10px] font-normal">J/mm</span>
                </div>
                <div className="text-[9px] text-slate-500">P / v = 10 kW / 5 m/s</div>
              </div>

              <div className="rounded-lg bg-black/40 p-2 border border-white/5">
                <div className="text-[10px] text-slate-400">Volumetric Energy</div>
                <div className="text-base font-bold text-cyan-300">
                  {jobStats.volumetricEnergyDensity} <span className="text-[10px] font-normal">J/mm³</span>
                </div>
                <div className="text-[9px] text-slate-500">P / (v·h·t)</div>
              </div>
            </div>

            <div className="space-y-2 border-t border-white/10 pt-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span className="flex items-center gap-1 text-slate-400">
                  <Ruler className="h-3.5 w-3.5 text-cyan-400" /> Active Layer Path:
                </span>
                <span className="font-mono">{toolpath.totalLengthMm.toFixed(1)} mm</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="flex items-center gap-1 text-slate-400">
                  <Timer className="h-3.5 w-3.5 text-cyan-400" /> Active Layer Time:
                </span>
                <span className="font-mono">{toolpath.estimatedTimeS.toFixed(2)} s</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="flex items-center gap-1 text-slate-400">
                  <Layers className="h-3.5 w-3.5 text-cyan-400" /> Total Job Distance:
                </span>
                <span className="font-mono">{(jobStats.totalLengthMm / 1000).toFixed(2)} m</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="flex items-center gap-1 text-slate-400">
                  <Timer className="h-3.5 w-3.5 text-cyan-400" /> Total Est. Build Time:
                </span>
                <span className="font-mono font-semibold text-emerald-400">
                  {(jobStats.totalJobTimeS / 60).toFixed(1)} min
                </span>
              </div>
            </div>
          </div>

          {/* Live 3-Axis 3D Galvo & Dynamic Focus Card */}
          <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-1.5 font-semibold text-white">
                <Compass className="h-3.5 w-3.5 text-cyan-400" /> 3-Axis Galvo &amp; Fiber Focus Live
              </h4>
              <button
                onClick={() => setViewMode("mirrors")}
                className="text-[10px] text-cyan-400 hover:underline"
              >
                Full Optics &rarr;
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-center font-mono">
              <div className="rounded-lg bg-black/40 p-1.5 border border-cyan-500/20">
                <div className="text-[9px] text-slate-400">θ_x (Mirror X)</div>
                <div className="text-xs font-bold text-cyan-300">
                  {mirrorAngles.thetaXDeg > 0 ? `+${mirrorAngles.thetaXDeg.toFixed(2)}` : mirrorAngles.thetaXDeg.toFixed(2)}°
                </div>
                <div className="text-[8px] text-slate-500">2θ: {mirrorAngles.opticalAngleXDeg.toFixed(1)}°</div>
              </div>
              <div className="rounded-lg bg-black/40 p-1.5 border border-rose-500/20">
                <div className="text-[9px] text-slate-400">θ_y (Mirror Y)</div>
                <div className="text-xs font-bold text-rose-300">
                  {mirrorAngles.thetaYDeg > 0 ? `+${mirrorAngles.thetaYDeg.toFixed(2)}` : mirrorAngles.thetaYDeg.toFixed(2)}°
                </div>
                <div className="text-[8px] text-slate-500">2θ: {mirrorAngles.opticalAngleYDeg.toFixed(1)}°</div>
              </div>
              <div className="rounded-lg bg-black/40 p-1.5 border border-amber-500/20">
                <div className="text-[9px] text-slate-400">Z_lin (Fiber)</div>
                <div className="text-xs font-bold text-amber-300">
                  {mirrorAngles.zLinearMm > 0 ? `+${mirrorAngles.zLinearMm.toFixed(2)}` : mirrorAngles.zLinearMm.toFixed(2)}
                  <span className="text-[9px] font-normal">mm</span>
                </div>
                <div className="text-[8px] text-emerald-400">Spot: {mirrorAngles.spotDiameterUm}µm</div>
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
              <span>Laser Spot (X, Y):</span>
              <span className="font-mono text-slate-200">
                ({currentSpot.point.x.toFixed(1)}, {currentSpot.point.y.toFixed(1)}) mm
              </span>
            </div>
          </div>

          {/* Lensless 3D Galvo Scanning Field Settings */}
          <div className="space-y-3 rounded-xl border border-cyan-400/20 bg-cyan-950/20 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                <Maximize2 className="h-4 w-4 text-cyan-400" /> Lensless Build Field Area
              </h3>
              <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[10px] font-mono text-cyan-300">
                No F-Theta Lens
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Unobstructed large-area printing enabled by pre-objective dynamic focusing. Select or tune your target build area:
            </p>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Active Print Field Diameter:</span>
                <span className="font-mono text-cyan-300 font-bold">{field.fieldSizeMm} mm Ø</span>
              </div>
              <div className="flex gap-1.5">
                {[300, 500, 800, 1000].map((sz) => (
                  <button
                    key={sz}
                    onClick={() => {
                      setField({ fieldSizeMm: sz });
                      defaultGalvoKinematics.scanFieldSizeMm = sz;
                    }}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-mono font-medium transition ${
                      field.fieldSizeMm === sz
                        ? "bg-cyan-400 text-slate-900 font-bold shadow-md shadow-cyan-500/25"
                        : "bg-white/5 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {sz}mm
                  </button>
                ))}
              </div>
            </div>

            <NumberField
              label="Working Distance L (mm)"
              value={defaultGalvoKinematics.L}
              step={50}
              min={300}
              max={1500}
              onChange={(v) => {
                defaultGalvoKinematics.L = v;
              }}
            />
          </div>

          {/* Hatch Settings Card */}
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <h3 className="text-sm font-semibold text-white">Rotating Hatch Fill (SLM)</h3>
            <label className="flex items-center justify-between text-xs text-slate-300">
              Enabled
              <input
                type="checkbox"
                checked={hatch.enabled}
                onChange={(e) => setHatch({ enabled: e.target.checked })}
                className="accent-cyan-400"
              />
            </label>
            <NumberField
              label="Hatch spacing (mm)"
              value={hatch.spacingMm}
              step={0.01}
              min={0.02}
              onChange={(v) => setHatch({ spacingMm: v })}
            />
            <NumberField
              label="Base angle (°)"
              value={hatch.angleDeg}
              step={5}
              onChange={(v) => setHatch({ angleDeg: v })}
            />
            <NumberField
              label="Rotation / layer (°)"
              value={hatch.rotationPerLayerDeg ?? 67}
              step={1}
              onChange={(v) => setHatch({ rotationPerLayerDeg: v })}
              icon={<RotateCw className="h-3 w-3 text-cyan-300" />}
            />
            <NumberField
              label="Contour passes"
              value={hatch.contourPasses}
              step={1}
              min={0}
              max={5}
              onChange={(v) => setHatch({ contourPasses: Math.round(v) })}
            />
            <label className="flex items-center justify-between text-xs text-slate-300">
              Cross-hatch (0°/90°)
              <input
                type="checkbox"
                checked={hatch.crossHatch}
                onChange={(e) => setHatch({ crossHatch: e.target.checked })}
                className="accent-cyan-400"
              />
            </label>
          </div>

          {/* High-Power Laser & Galvo Kinematics */}
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <h3 className="text-sm font-semibold text-white">Laser &amp; Galvo Kinematics</h3>
            <NumberField
              label="Laser Power (Watts)"
              value={process.laserPowerWatts ?? 10000}
              step={500}
              min={100}
              max={20000}
              onChange={(v) => setProcess({ laserPowerWatts: v })}
            />
            <NumberField
              label="Scan speed (mm/s)"
              value={process.scanSpeedMms}
              step={200}
              min={500}
              max={15000}
              onChange={(v) => setProcess({ scanSpeedMms: v })}
            />
            <NumberField
              label="Jump speed (mm/s)"
              value={process.jumpSpeedMms}
              step={500}
              min={1000}
              max={25000}
              onChange={(v) => setProcess({ jumpSpeedMms: v })}
            />
            <NumberField
              label="Layer height (µm)"
              value={process.layerHeightMicron}
              step={5}
              min={10}
              max={200}
              onChange={(v) => setProcess({ layerHeightMicron: v })}
            />
            <NumberField
              label="Laser ON delay (µs)"
              value={process.laserOnDelayUs}
              step={10}
              min={0}
              onChange={(v) => setProcess({ laserOnDelayUs: v })}
            />
            <label className="flex items-center justify-between text-xs text-slate-300">
              Skywriting compensation
              <input
                type="checkbox"
                checked={process.skywriting}
                onChange={(e) => setProcess({ skywriting: e.target.checked })}
                className="accent-cyan-400"
              />
            </label>
          </div>

          {/* Procedural Shape Inspector if selected */}
          {selectedShape && (
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
              <NumberField
                label="X (mm)"
                value={selectedShape.cx}
                step={0.5}
                onChange={(v) => updateShape(selectedShape.id, { cx: v })}
              />
              <NumberField
                label="Y (mm)"
                value={selectedShape.cy}
                step={0.5}
                onChange={(v) => updateShape(selectedShape.id, { cy: v })}
              />
              <NumberField
                label="Size (mm)"
                value={selectedShape.size}
                step={0.5}
                min={1}
                onChange={(v) => updateShape(selectedShape.id, { size: v })}
              />
              <NumberField
                label="Rotation (°)"
                value={selectedShape.rotation}
                step={5}
                onChange={(v) => updateShape(selectedShape.id, { rotation: v })}
                icon={<RotateCw className="h-3 w-3" />}
              />
            </div>
          )}
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
