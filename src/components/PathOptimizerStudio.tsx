import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  computeStepperGalvoKinematics,
  optimizeToolpath,
  type CalibrationParams,
  type OptimizationAlgorithm,
  type OptimizedPathResult,
  type VectorSegment,
} from '../utils/galvoMath';
import {
  Play,
  Pause,
  RotateCcw,
  Plus,
  Trash2,
  Zap,
  ArrowRight,
  Sliders,
} from 'lucide-react';

export type PresetShapeType =
  | 'calibration_gear'
  | 'honeycomb_lattice'
  | 'tensile_dogbone'
  | 'calib_crosshair';

interface PathOptimizerStudioProps {
  segments: VectorSegment[];
  algorithm: OptimizationAlgorithm;
  onChangeAlgorithm: (algo: OptimizationAlgorithm) => void;
  presetShape: PresetShapeType;
  onChangePresetShape: (preset: PresetShapeType) => void;
  hatchSpacingMm: number;
  onChangeHatchSpacing: (val: number) => void;
  onAddCustomSegment: (seg: VectorSegment) => void;
  onResetSegments: () => void;
  calibration: CalibrationParams;
}

export const PathOptimizerStudio: React.FC<PathOptimizerStudioProps> = ({
  segments,
  algorithm,
  onChangeAlgorithm,
  presetShape,
  onChangePresetShape,
  hatchSpacingMm,
  onChangeHatchSpacing,
  onAddCustomSegment,
  onResetSegments,
  calibration,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showJumps, setShowJumps] = useState<boolean>(true);
  const [showSkywriting, setShowSkywriting] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [playbackProgress, setPlaybackProgress] = useState<number>(100);
  const [activeLayerIdx, setActiveLayerIdx] = useState<number>(1);
  const [pendingPoint, setPendingPoint] = useState<{ x: number; y: number } | null>(null);

  // Compare all 3 algorithms in real time for the comparison matrix
  const rawResult = useMemo(
    () =>
      optimizeToolpath(
        segments,
        'raw',
        calibration.scanSpeedMmPerSec,
        calibration.jumpSpeedMmPerSec
      ),
    [segments, calibration.scanSpeedMmPerSec, calibration.jumpSpeedMmPerSec]
  );

  const nearestResult = useMemo(
    () =>
      optimizeToolpath(
        segments,
        'nearest',
        calibration.scanSpeedMmPerSec,
        calibration.jumpSpeedMmPerSec
      ),
    [segments, calibration.scanSpeedMmPerSec, calibration.jumpSpeedMmPerSec]
  );

  const opt2Result = useMemo(
    () =>
      optimizeToolpath(
        segments,
        '2opt_skywriting',
        calibration.scanSpeedMmPerSec,
        calibration.jumpSpeedMmPerSec
      ),
    [segments, calibration.scanSpeedMmPerSec, calibration.jumpSpeedMmPerSec]
  );

  const activeResult: OptimizedPathResult =
    algorithm === 'raw'
      ? rawResult
      : algorithm === 'nearest'
        ? nearestResult
        : opt2Result;

  // Animation loop for real-time toolpath playback
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    let last = performance.now();

    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setPlaybackProgress((prev) => {
        const next = prev + dt * 24;
        return next > 100 ? 0 : next;
      });
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying]);

  // Render 2D vector toolpath canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const fieldMm = Math.max(80, calibration.fieldSizeMm);
    const pxPerMm = (Math.min(w, h) * 0.84) / fieldMm;

    const toPx = (pt: { x: number; y: number }) => ({
      x: cx + pt.x * pxPerMm,
      y: cy - pt.y * pxPerMm,
    });

    // Grid lines every 5mm
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.35)';
    ctx.lineWidth = 1;
    const halfField = fieldMm / 2;
    for (let m = -halfField; m <= halfField; m += 5) {
      const p1 = toPx({ x: m, y: -halfField });
      const p2 = toPx({ x: m, y: halfField });
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      const q1 = toPx({ x: -halfField, y: m });
      const q2 = toPx({ x: halfField, y: m });
      ctx.beginPath();
      ctx.moveTo(q1.x, q1.y);
      ctx.lineTo(q2.x, q2.y);
      ctx.stroke();
    }

    // Scan field boundary circle & square
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.35)';
    ctx.lineWidth = 1.5;
    const topLeft = toPx({ x: -halfField, y: halfField });
    ctx.strokeRect(topLeft.x, topLeft.y, fieldMm * pxPerMm, fieldMm * pxPerMm);

    ctx.beginPath();
    ctx.arc(cx, cy, halfField * pxPerMm, 0, Math.PI * 2);
    ctx.stroke();

    const totalSegs = activeResult.segments.length;
    const visibleSegCount = Math.max(
      1,
      Math.ceil((playbackProgress / 100) * totalSegs)
    );

    // 1. Non-lasing Jump travel lines (dashed amber)
    if (showJumps) {
      ctx.save();
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
      ctx.lineWidth = 1.25;
      ctx.setLineDash([4, 4]);
      let cursor = { x: 0, y: 0 };
      for (let i = 0; i < visibleSegCount && i < totalSegs; i++) {
        const seg = activeResult.segments[i];
        const pFrom = toPx(cursor);
        const pTo = toPx(seg.start);
        if (Math.hypot(pTo.x - pFrom.x, pTo.y - pFrom.y) > 2) {
          ctx.beginPath();
          ctx.moveTo(pFrom.x, pFrom.y);
          ctx.lineTo(pTo.x, pTo.y);
          ctx.stroke();
        }
        cursor = seg.end;
      }
      ctx.restore();
    }

    // 2. Corner Skywriting Overshoot Ramps (emerald)
    if (showSkywriting && algorithm === '2opt_skywriting') {
      ctx.save();
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.75)';
      ctx.lineWidth = 1.6;
      for (const arc of activeResult.skywritingArcs) {
        const pCorner = toPx(arc.corner);
        const pOver = toPx(arc.overshoot);
        ctx.beginPath();
        ctx.moveTo(pCorner.x, pCorner.y);
        ctx.lineTo(pOver.x, pOver.y);
        ctx.stroke();

        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(pOver.x, pOver.y, 2.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 3. Laser ON vectors (red for contour, cyan for hatch)
    for (let i = 0; i < visibleSegCount && i < totalSegs; i++) {
      const seg = activeResult.segments[i];
      const p1 = toPx(seg.start);
      const p2 = toPx(seg.end);
      ctx.strokeStyle =
        seg.featureType === 'contour'
          ? '#f43f5e'
          : seg.featureType === 'hatch'
            ? '#06b6d4'
            : '#a855f7';
      ctx.lineWidth = seg.featureType === 'contour' ? 2.4 : 1.6;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // 4. Active Laser Head Spot
    if (totalSegs > 0) {
      const headSeg = activeResult.segments[Math.min(visibleSegCount - 1, totalSegs - 1)];
      const headPx = toPx(headSeg.end);

      ctx.fillStyle = 'rgba(244, 63, 94, 0.32)';
      ctx.beginPath();
      ctx.arc(headPx.x, headPx.y, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(headPx.x, headPx.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. Pending custom vector start point indicator
    if (pendingPoint) {
      const p = toPx(pendingPoint);
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [
    activeResult,
    showJumps,
    showSkywriting,
    playbackProgress,
    calibration.fieldSizeMm,
    algorithm,
    pendingPoint,
  ]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const clickY = ((e.clientY - rect.top) / rect.height) * canvas.height;

    const fieldMm = Math.max(80, calibration.fieldSizeMm);
    const pxPerMm = (Math.min(canvas.width, canvas.height) * 0.84) / fieldMm;
    const mmX = Number(((clickX - canvas.width / 2) / pxPerMm).toFixed(2));
    const mmY = Number(((canvas.height / 2 - clickY) / pxPerMm).toFixed(2));

    if (!pendingPoint) {
      setPendingPoint({ x: mmX, y: mmY });
    } else {
      onAddCustomSegment({
        id: `custom-${Date.now()}`,
        start: pendingPoint,
        end: { x: mmX, y: mmY },
        featureType: 'contour',
        powerPct: 100,
      });
      setPendingPoint(null);
    }
  };

  const activeHeadSeg =
    activeResult.segments[
      Math.min(
        Math.max(0, Math.ceil((playbackProgress / 100) * activeResult.segments.length) - 1),
        Math.max(0, activeResult.segments.length - 1)
      )
    ];

  const headKinematics = computeStepperGalvoKinematics(
    activeHeadSeg ? activeHeadSeg.end.x : 0,
    activeHeadSeg ? activeHeadSeg.end.y : 0,
    calibration.workingDistanceMm,
    calibration.stepperMode
  );

  return (
    <section className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
      {/* Top Toolbar */}
      <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs text-cyan-400 font-medium">
            Real-Time Vector Ordering & Stepper Lookahead
          </div>
          <h2 className="text-xl font-bold text-white mt-0.5">
            Toolpath Optimization Studio
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Low-cost stepper motors have higher rotor inertia than closed-loop voice-coil galvos.
            2-Opt path ordering + Corner Skywriting minimizes non-lasing jump travel and prevents
            over-exposure at sharp corners.
          </p>
        </div>

        {/* Algorithm Selector */}
        <div
          role="group"
          aria-label="Optimization Algorithm"
          className="flex items-center gap-1.5 p-1.5 bg-slate-900 border border-slate-800 rounded-xl"
        >
          {(
            [
              { id: 'raw', label: '01. Unordered Slicer Raw' },
              { id: 'nearest', label: '02. Nearest-Neighbor Greedy' },
              { id: '2opt_skywriting', label: '03. 2-Opt + Corner Skywriting' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeAlgorithm(item.id)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                algorithm === item.id
                  ? 'bg-cyan-400 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main 3-Column Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Layer & Geometry Controls */}
        <div className="lg:col-span-3 bg-[#0b1120] border border-slate-800 rounded-xl p-4 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-white">1. Test Geometry Preset</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Select a 2D slice contour or click twice on the bed canvas to append custom vectors.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              {(
                [
                  { id: 'calibration_gear', label: '16-Tooth Spur Gear + Hatch' },
                  { id: 'honeycomb_lattice', label: 'Hexagonal Cellular Lattice' },
                  { id: 'tensile_dogbone', label: 'ASTM Tensile Dogbone Coupon' },
                  { id: 'calib_crosshair', label: '5-Box Corner Alignment Target' },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onChangePresetShape(preset.id)}
                  className={`w-full text-left px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    presetShape === preset.id
                      ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300'
                      : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <label htmlFor="hatch-spacing-slider" className="text-slate-300 font-medium">
                Infill Hatch Pitch:
              </label>
              <span className="font-mono tabular-nums text-cyan-300">
                {hatchSpacingMm.toFixed(1)} mm
              </span>
            </div>
            <input
              id="hatch-spacing-slider"
              type="range"
              min={2.5}
              max={8.0}
              step={0.5}
              value={hatchSpacingMm}
              onChange={(e) => onChangeHatchSpacing(Number(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>

          <div className="pt-4 border-t border-slate-800/80">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-slate-300 font-medium">Slice Layer Stack (Δz = {calibration.layerHeightUm}µm)</span>
              <span className="font-mono tabular-nums text-slate-400">Layer {activeLayerIdx}/6</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[1, 2, 3, 4, 5, 6].map((layerNum) => (
                <button
                  key={layerNum}
                  type="button"
                  onClick={() => setActiveLayerIdx(layerNum)}
                  className={`px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                    activeLayerIdx === layerNum
                      ? 'bg-cyan-500 text-slate-950 font-semibold border-cyan-400'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  L{layerNum} ({((layerNum - 1) * (calibration.layerHeightUm / 1000)).toFixed(2)}mm)
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80 space-y-2">
            <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
              <span>Show Non-Lasing Jumps (G0)</span>
              <input
                type="checkbox"
                checked={showJumps}
                onChange={(e) => setShowJumps(e.target.checked)}
                className="accent-cyan-400"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
              <span>Show Corner Skywriting Ramps</span>
              <input
                type="checkbox"
                checked={showSkywriting}
                onChange={(e) => setShowSkywriting(e.target.checked)}
                className="accent-cyan-400"
              />
            </label>
            <button
              type="button"
              onClick={onResetSegments}
              className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Custom Vectors
            </button>
          </div>
        </div>

        {/* Center Column: Interactive 2D Vector Scan Field Canvas */}
        <div className="lg:col-span-5 bg-[#0b1120] border border-slate-800 rounded-xl p-4 flex flex-col items-center">
          <div className="w-full flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPlaying((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {isPlaying ? 'Pause Scan' : 'Simulate Scan'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setPlaybackProgress(100);
                }}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Show 100% Path
              </button>
            </div>
            <div className="text-xs font-mono tabular-nums text-slate-400">
              {activeResult.segments.length} vectors · Click 2 pts to draw
            </div>
          </div>

          <canvas
            ref={canvasRef}
            width={520}
            height={520}
            onClick={handleCanvasClick}
            className="w-full max-w-[520px] aspect-square rounded-lg border border-slate-800 cursor-crosshair"
          />

          {/* Progress Scrubber & Legend */}
          <div className="w-full mt-3 space-y-2">
            <div className="flex items-center gap-3">
              <label htmlFor="scan-progress-slider" className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                Scan Progress:
              </label>
              <input
                id="scan-progress-slider"
                type="range"
                min={1}
                max={100}
                value={Math.round(playbackProgress)}
                onChange={(e) => {
                  setIsPlaying(false);
                  setPlaybackProgress(Number(e.target.value));
                }}
                className="w-full accent-cyan-400 cursor-pointer"
              />
              <span className="text-xs font-mono tabular-nums text-cyan-300 w-10 text-right">
                {Math.round(playbackProgress)}%
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 pt-1">
              <span>Red: Contour (100% PWM) · Cyan: Hatch (85% PWM)</span>
              <span>Dashed Amber: Stepper Jump (Laser OFF) · Emerald: Skywriting</span>
            </div>
          </div>
        </div>

        {/* Right Column: Quantitative Algorithm Comparison & Live Stepper Telemetry */}
        <div className="lg:col-span-4 space-y-5">
          {/* Quantitative Comparison Table */}
          <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white">
              Real-Time Path Optimization Benchmark
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Direct comparison on current {segments.length}-segment layer geometry.
            </p>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-2 font-sans font-medium">Algorithm</th>
                    <th className="py-2 px-2 text-right font-sans font-medium">Jump Travel</th>
                    <th className="py-2 px-2 text-right font-sans font-medium">Saved</th>
                    <th className="py-2 pl-2 text-right font-sans font-medium">Cycle Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {[
                    { label: 'Unordered Raw', res: rawResult, key: 'raw' },
                    { label: 'Nearest-Neighbor', res: nearestResult, key: 'nearest' },
                    { label: '2-Opt + Skywriting', res: opt2Result, key: '2opt_skywriting' },
                  ].map((row) => {
                    const isSelected = algorithm === row.key;
                    return (
                      <tr
                        key={row.key}
                        onClick={() => onChangeAlgorithm(row.key as OptimizationAlgorithm)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-cyan-500/10 text-white' : 'text-slate-300 hover:bg-slate-900'
                        }`}
                      >
                        <td className="py-2.5 pr-2 font-sans font-medium">
                          {row.label}
                        </td>
                        <td className="py-2.5 px-2 text-right text-amber-300">
                          {row.res.jumpDistanceMm.toFixed(1)} mm
                        </td>
                        <td className="py-2.5 px-2 text-right text-emerald-400">
                          {row.res.jumpSavedPct > 0 ? `-${row.res.jumpSavedPct.toFixed(1)}%` : '0.0%'}
                        </td>
                        <td className="py-2.5 pl-2 text-right text-cyan-300">
                          {row.res.estimatedTimeSec.toFixed(2)} s
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-slate-400">Active Lasing Path</div>
                <div className="text-base font-semibold font-mono tabular-nums text-white mt-0.5">
                  {activeResult.laserDistanceMm.toFixed(1)} mm
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-slate-400">Stepper Reversals / Skywriting</div>
                <div className="text-base font-semibold font-mono tabular-nums text-emerald-400 mt-0.5">
                  {activeResult.directionReversals} rev · {activeResult.skywritingArcs.length} arcs
                </div>
              </div>
            </div>
          </div>

          {/* Live Stepper Galvo Kinematics Card */}
          <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white">
              Live Stepper-Galvo Angular Telemetry
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Instantaneous mirror angles and discrete Arduino step counts at current laser spot.
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2.5 font-mono tabular-nums text-xs">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-slate-400 font-sans">X-Mirror Angle (θx)</div>
                <div className="text-sm font-semibold text-cyan-300 mt-0.5">
                  {headKinematics.thetaXDeg.toFixed(3)}°
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Arduino D2: {headKinematics.stepsX} steps
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-slate-400 font-sans">Y-Mirror Angle (θy)</div>
                <div className="text-sm font-semibold text-rose-300 mt-0.5">
                  {headKinematics.thetaYDeg.toFixed(3)}°
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Arduino D3: {headKinematics.stepsY} steps
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-slate-400 font-sans">Step Quantization Error</div>
                <div className="text-sm font-semibold text-amber-300 mt-0.5">
                  {headKinematics.quantizationErrorUm.toFixed(1)} µm
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-slate-400 font-sans">Flat-Field Focus Δz</div>
                <div className="text-sm font-semibold text-emerald-300 mt-0.5">
                  +{headKinematics.focusDeltaZMm.toFixed(3)} mm
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
