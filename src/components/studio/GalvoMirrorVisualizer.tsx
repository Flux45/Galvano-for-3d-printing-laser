import { useMemo } from "react";
import { Gauge, Zap, Compass, Activity, MoveHorizontal, CheckCircle2, ShieldCheck, Maximize2 } from "lucide-react";
import { defaultGalvoKinematics, type Galvo3DAxisState } from "../../lib/galvoKinematics";
import type { Point, Toolpath } from "../../lib/types";

interface Props {
  activePoint: Point;
  isLaserOn: boolean;
  toolpath?: Toolpath;
  scanSpeedMms: number;
  activeZ?: number;
  fieldSizeMm?: number;
}

export default function GalvoMirrorVisualizer({
  activePoint,
  isLaserOn,
  toolpath,
  scanSpeedMms,
  activeZ = 0,
  fieldSizeMm = 500,
}: Props) {
  // Compute full 3-axis kinematics state for lensless scanning
  const axisState: Galvo3DAxisState = useMemo(() => {
    return defaultGalvoKinematics.xyToMirrorAngles(activePoint.x, activePoint.y, activeZ);
  }, [activePoint.x, activePoint.y, activeZ]);

  // Angular velocity estimate: omega = v / (2 * L) in rad/s -> converted to deg/ms
  const angularSpeedDegMs = useMemo(() => {
    const L = defaultGalvoKinematics.L; // 600mm working distance
    const radS = scanSpeedMms / (2 * L);
    return Number(((radS * 180) / (Math.PI * 1000)).toFixed(2));
  }, [scanSpeedMms]);

  // Linear voice coil actuator speed
  const linearSpeedMmS = useMemo(() => {
    const mz2 = defaultGalvoKinematics.opticalMagnificationMz * defaultGalvoKinematics.opticalMagnificationMz;
    const hyp = Math.hypot(activePoint.x, activePoint.y);
    const scale = hyp / defaultGalvoKinematics.L;
    return Number(((scanSpeedMms * scale) / mz2).toFixed(1));
  }, [scanSpeedMms, activePoint.x, activePoint.y]);

  return (
    <div className="space-y-4 rounded-xl border border-white/10 bg-[#070b12] p-4 text-slate-200 shadow-xl">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Compass className="h-4 w-4 text-cyan-300" /> Lens-Free 3-Axis 3D Galvanometer System
            </h3>
            <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 border border-cyan-500/30">
              No F-Theta Lens
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Pre-Objective Dynamic Focus Stage (Z-Axis) + Direct Mirror Projection into {fieldSizeMm}mm Build Chamber
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
            <Maximize2 className="h-3 w-3" /> Field: {fieldSizeMm}mm
          </span>
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
              isLaserOn
                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isLaserOn ? "bg-rose-500 animate-pulse" : "bg-amber-400"
              }`}
            />
            {isLaserOn ? "10 kW Laser Active" : "Jump (Laser OFF)"}
          </span>
        </div>
      </div>

      {/* 3-Axis Dynamic Actuator Telemetry: 3 Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Axis 1: X Mirror Rotary Servo */}
        <div className="flex flex-col items-center rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-3">
          <div className="flex w-full items-center justify-between text-xs text-cyan-300 mb-1">
            <span className="font-semibold flex items-center gap-1">
              <Zap className="h-3.5 w-3.5" /> Axis 1: Galvo X-Motor
            </span>
            <span className="font-mono text-[10px] text-slate-400">Rotary Servo</span>
          </div>

          <MirrorGauge angleDeg={axisState.thetaXDeg} maxAngleDeg={16} label="Mirror X Tilt" color="#38bdf8" />

          <div className="mt-2 w-full space-y-1 text-xs font-mono">
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Mechanical (θx):</span>
              <span className="font-bold text-cyan-300">
                {axisState.thetaXDeg > 0 ? `+${axisState.thetaXDeg}°` : `${axisState.thetaXDeg}°`}
              </span>
            </div>
            <div className="flex justify-between text-slate-400 text-[11px]">
              <span>Direct Beam (2θx):</span>
              <span className="text-slate-200">
                {axisState.opticalAngleXDeg > 0 ? `+${axisState.opticalAngleXDeg}°` : `${axisState.opticalAngleXDeg}°`}
              </span>
            </div>
            <div className="flex justify-between text-slate-400 text-[11px]">
              <span>Slew Rate:</span>
              <span className="text-slate-200">{angularSpeedDegMs} °/ms</span>
            </div>
          </div>
        </div>

        {/* Axis 2: Y Mirror Rotary Servo */}
        <div className="flex flex-col items-center rounded-xl border border-rose-500/20 bg-rose-950/20 p-3">
          <div className="flex w-full items-center justify-between text-xs text-rose-300 mb-1">
            <span className="font-semibold flex items-center gap-1">
              <Zap className="h-3.5 w-3.5" /> Axis 2: Galvo Y-Motor
            </span>
            <span className="font-mono text-[10px] text-slate-400">Rotary Servo</span>
          </div>

          <MirrorGauge angleDeg={axisState.thetaYDeg} maxAngleDeg={16} label="Mirror Y Tilt" color="#f43f5e" />

          <div className="mt-2 w-full space-y-1 text-xs font-mono">
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Mechanical (θy):</span>
              <span className="font-bold text-rose-300">
                {axisState.thetaYDeg > 0 ? `+${axisState.thetaYDeg}°` : `${axisState.thetaYDeg}°`}
              </span>
            </div>
            <div className="flex justify-between text-slate-400 text-[11px]">
              <span>Direct Beam (2θy):</span>
              <span className="text-slate-200">
                {axisState.opticalAngleYDeg > 0 ? `+${axisState.opticalAngleYDeg}°` : `${axisState.opticalAngleYDeg}°`}
              </span>
            </div>
            <div className="flex justify-between text-slate-400 text-[11px]">
              <span>Slew Rate:</span>
              <span className="text-slate-200">{angularSpeedDegMs} °/ms</span>
            </div>
          </div>
        </div>

        {/* Axis 3: Fiber-In Linear Dynamic Focus Stage */}
        <div className="flex flex-col items-center rounded-xl border border-amber-500/30 bg-amber-950/20 p-3">
          <div className="flex w-full items-center justify-between text-xs text-amber-300 mb-1">
            <span className="font-semibold flex items-center gap-1">
              <MoveHorizontal className="h-3.5 w-3.5" /> Axis 3: Fiber-In Focus
            </span>
            <span className="font-mono text-[10px] text-slate-400">Pre-Objective VCM</span>
          </div>

          {/* Linear Translator Gauge */}
          <LinearStageGauge
            zLinearMm={axisState.zLinearMm}
            maxStrokeMm={18}
            color="#f59e0b"
          />

          <div className="mt-2 w-full space-y-1 text-xs font-mono">
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Fiber Shift (Z_lin):</span>
              <span className="font-bold text-amber-300">
                {axisState.zLinearMm > 0 ? `+${axisState.zLinearMm} mm` : `${axisState.zLinearMm} mm`}
              </span>
            </div>
            <div className="flex justify-between text-slate-400 text-[11px]">
              <span>True Path Distance R:</span>
              <span className="text-slate-200">{axisState.focalDistanceMm} mm</span>
            </div>
            <div className="flex justify-between text-slate-400 text-[11px]">
              <span>Linear Speed (VCM):</span>
              <span className="text-slate-200">{linearSpeedMmS} mm/s</span>
            </div>
          </div>
        </div>
      </div>

      {/* Optical Spot Quality & Flat-Field Comparison */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono">
        <div className="rounded-lg bg-black/40 p-2.5 border border-white/5">
          <div className="text-[10px] text-slate-400">Dynamic Spot Size (Lensless 3D)</div>
          <div className="text-base font-bold text-emerald-400">
            {axisState.spotDiameterUm} <span className="text-[10px] font-normal text-slate-400">µm</span>
          </div>
          <div className="text-[9px] text-emerald-500/80">Uniform across entire {fieldSizeMm}mm field</div>
        </div>

        <div className="rounded-lg bg-black/40 p-2.5 border border-white/5">
          <div className="text-[10px] text-slate-400">Uncompensated Spot (without Axis 3)</div>
          <div className="text-base font-bold text-rose-400">
            {axisState.spotDiameterUncompensatedUm} <span className="text-[10px] font-normal text-slate-400">µm</span>
          </div>
          <div className="text-[9px] text-rose-400/80">Severe defocus without F-theta / VCM</div>
        </div>

        <div className="rounded-lg bg-black/40 p-2.5 border border-white/5">
          <div className="text-[10px] text-slate-400">Spherical Curvature Error (Δf)</div>
          <div className="text-base font-bold text-amber-300">
            {axisState.focalDeltaMm > 0 ? `+${axisState.focalDeltaMm}` : axisState.focalDeltaMm}{" "}
            <span className="text-[10px] font-normal text-slate-400">mm</span>
          </div>
          <div className="text-[9px] text-slate-500">Corrected by pre-objective stage</div>
        </div>

        <div className="rounded-lg bg-black/40 p-2.5 border border-white/5">
          <div className="text-[10px] text-slate-400">Working Distance (L)</div>
          <div className="text-base font-bold text-cyan-300">
            {axisState.workingDistanceMm}{" "}
            <span className="text-[10px] font-normal text-slate-400">mm</span>
          </div>
          <div className="text-[9px] text-slate-500">Long-range clear optical standoff</div>
        </div>
      </div>

      {/* Optical Ray Trace Schematic Diagram with Movable Fiber-In & Open Lensless Exit */}
      <div className="rounded-xl border border-white/10 bg-black/40 p-3">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <span className="font-medium text-slate-300 flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-cyan-400" /> Lensless 3-Axis Optical Ray Tracing &amp; Direct Mirror Projection
          </span>
          <span className="text-[10px] font-mono text-cyan-400">
            NO F-THETA LENS · L={axisState.workingDistanceMm}mm · Area={fieldSizeMm}mm
          </span>
        </div>

        <svg viewBox="0 0 380 150" className="w-full h-auto">
          {/* Linear Guide Rails for Fiber-In Collimator */}
          <line x1="8" y1="20" x2="85" y2="20" stroke="#334155" strokeWidth="2.5" strokeDasharray="3 3" />
          <line x1="8" y1="36" x2="85" y2="36" stroke="#334155" strokeWidth="2.5" strokeDasharray="3 3" />
          <text x="32" y="14" fontSize="7" fill="#64748b" textAnchor="middle">Linear Guide Rail</text>

          {/* Voice Coil Stator Frame */}
          <rect x="8" y="18" width="16" height="20" rx="2" fill="#1e293b" stroke="#f59e0b" strokeWidth="1" />
          <text x="16" y="30" fontSize="6" fill="#f59e0b" textAnchor="middle" fontWeight="bold">VCM</text>

          {/* Fiber Optic Armored Input Cable */}
          <path
            d={`M 0,28 Q 15,28 ${24 + axisState.zLinearNormalized * 12},28`}
            fill="none"
            stroke="#fbbf24"
            strokeWidth="3.5"
            strokeLinecap="round"
          />

          {/* Movable Pre-Objective Fiber Collimator Assembly */}
          {(() => {
            const collimatorX = 35 + axisState.zLinearNormalized * 14;
            const beamStartX = collimatorX + 34;
            const mirrorXPos = 120;
            const mirrorYPos = 205;

            // Target landing X coordinate on the expanded field
            const halfField = fieldSizeMm / 2;
            const targetSvgX = mirrorYPos + (activePoint.x / halfField) * 95;

            return (
              <g>
                {/* Carriage Slider */}
                <g transform={`translate(${collimatorX}, 18)`}>
                  <rect x="0" y="0" width="34" height="20" rx="3" fill="#0284c7" stroke="#38bdf8" strokeWidth="1.2" />
                  <rect x="24" y="2" width="10" height="16" rx="1.5" fill="#0369a1" />
                  {/* Pre-Objective Focusing Doublet Lens inside moving carriage */}
                  <ellipse cx="33" cy="10" rx="2" ry="7" fill="#7dd3fc" opacity="0.9" />
                  <text x="15" y="13" textAnchor="middle" fontSize="7" fill="#ffffff" fontWeight="bold">
                    PRE-FOCUS
                  </text>
                  {/* Linear Motion Indicator Arrows */}
                  <line x1="4" y1="16" x2="26" y2="16" stroke="#fef08a" strokeWidth="1" />
                </g>

                {/* Linear Translation Label */}
                <text x={collimatorX + 17} y="47" textAnchor="middle" fontSize="7" fill="#fbbf24" fontWeight="mono">
                  Δz: {axisState.zLinearMm > 0 ? `+${axisState.zLinearMm}` : axisState.zLinearMm}mm
                </text>

                {/* Laser beam from pre-focus collimator to Mirror X */}
                <line
                  x1={beamStartX}
                  y1="28"
                  x2={mirrorXPos}
                  y2="28"
                  stroke={isLaserOn ? "#f43f5e" : "#eab308"}
                  strokeWidth="2.5"
                  strokeDasharray={isLaserOn ? "" : "3 3"}
                />

                {/* Mirror X (rotates by thetaX) */}
                <g transform={`translate(${mirrorXPos}, 28) rotate(${45 + axisState.thetaXDeg})`}>
                  <rect x="-3" y="-14" width="6" height="28" rx="1.5" fill="#f1f5f9" stroke="#38bdf8" strokeWidth="1.2" />
                  <circle cx="0" cy="0" r="2.5" fill="#0284c7" />
                </g>
                <text x={mirrorXPos} y="11" textAnchor="middle" fontSize="8" fill="#38bdf8">
                  Mirror X ({axisState.thetaXDeg}°)
                </text>

                {/* Beam from Mirror X to Mirror Y */}
                <line
                  x1={mirrorXPos}
                  y1="28"
                  x2={mirrorYPos}
                  y2="60"
                  stroke={isLaserOn ? "#f43f5e" : "#eab308"}
                  strokeWidth="2.5"
                  strokeDasharray={isLaserOn ? "" : "3 3"}
                />

                {/* Mirror Y (rotates by thetaY) */}
                <g transform={`translate(${mirrorYPos}, 60) rotate(${45 + axisState.thetaYDeg})`}>
                  <rect x="-3" y="-16" width="6" height="32" rx="1.5" fill="#f1f5f9" stroke="#f43f5e" strokeWidth="1.2" />
                  <circle cx="0" cy="0" r="2.5" fill="#e11d48" />
                </g>
                <text x={mirrorYPos + 32} y="50" fontSize="8" fill="#fb7185">
                  Mirror Y ({axisState.thetaYDeg}°)
                </text>

                {/* Direct Unobstructed Beam from Mirror Y down to Open Exit Collar */}
                <line
                  x1={mirrorYPos}
                  y1="60"
                  x2={mirrorYPos}
                  y2="88"
                  stroke={isLaserOn ? "#f43f5e" : "#eab308"}
                  strokeWidth="2.5"
                />

                {/* Open Exit Collar / Gas Purge Knife (NO F-THETA LENS) */}
                <g transform={`translate(${mirrorYPos - 40}, 88)`}>
                  <rect x="0" y="0" width="80" height="6" rx="2" fill="#1e293b" stroke="#0284c7" strokeWidth="1" />
                  {/* Dashed open aperture throat indicating no optical glass */}
                  <line x1="20" y1="3" x2="60" y2="3" stroke="#38bdf8" strokeWidth="2" strokeDasharray="3 2" />
                  <text x="88" y="5" fontSize="7" fill="#38bdf8" fontWeight="bold">
                    Open Aperture (No F-Theta Lens)
                  </text>
                  <text x="88" y="13" fontSize="6" fill="#94a3b8">
                    Clear Beam Line-of-Sight
                  </text>
                </g>

                {/* Direct Focused Beam from Exit Collar to Powder Bed across expanded field */}
                <line
                  x1={mirrorYPos}
                  y1="94"
                  x2={targetSvgX}
                  y2="135"
                  stroke={isLaserOn ? "#f43f5e" : "#eab308"}
                  strokeWidth={isLaserOn ? "2.5" : "1.2"}
                  strokeDasharray={isLaserOn ? "" : "2 2"}
                />

                {/* Expanded Powder Bed Target Platform */}
                <line x1="70" y1="135" x2="340" y2="135" stroke="#475569" strokeWidth="2.5" />
                <text x="345" y="138" fontSize="6" fill="#64748b">
                  {fieldSizeMm}mm
                </text>

                {/* Spot on Bed */}
                <circle
                  cx={targetSvgX}
                  cy="135"
                  r={isLaserOn ? "4" : "2.5"}
                  fill={isLaserOn ? "#fde047" : "#eab308"}
                />

                {/* Active Focus Point Label */}
                <text
                  x={targetSvgX}
                  y="146"
                  textAnchor="middle"
                  fontSize="7"
                  fill="#fde047"
                  fontWeight="bold"
                >
                  Spot: {axisState.spotDiameterUm}µm
                </text>
              </g>
            );
          })()}
        </svg>
      </div>
    </div>
  );
}

/**
 * Analog dial gauge for galvanometer mirror mechanical tilt
 */
function MirrorGauge({
  angleDeg,
  maxAngleDeg,
  label,
  color,
}: {
  angleDeg: number;
  maxAngleDeg: number;
  label: string;
  color: string;
}) {
  const clampedAngle = Math.max(-maxAngleDeg, Math.min(maxAngleDeg, angleDeg));
  const needleRot = (clampedAngle / maxAngleDeg) * 60;

  return (
    <div className="relative flex flex-col items-center">
      <svg viewBox="0 0 100 65" className="w-24 h-16">
        <path
          d="M 15 55 A 40 40 0 0 1 85 55"
          fill="none"
          stroke="#1e293b"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <line x1="50" y1="15" x2="50" y2="20" stroke="#94a3b8" strokeWidth="1.5" />
        <line x1="20" y1="50" x2="25" y2="47" stroke="#64748b" strokeWidth="1" />
        <line x1="80" y1="50" x2="75" y2="47" stroke="#64748b" strokeWidth="1" />

        <circle cx="50" cy="55" r="4" fill="#334155" />

        <g transform={`rotate(${needleRot} 50 55)`}>
          <line x1="50" y1="55" x2="50" y2="18" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="50" cy="55" r="2" fill="#ffffff" />
        </g>
      </svg>
      <div className="text-[10px] text-slate-400 font-medium">{label}</div>
    </div>
  );
}

/**
 * Linear Vernier Stage Gauge for Axis 3 (Fiber-In Focus Actuator)
 */
function LinearStageGauge({
  zLinearMm,
  maxStrokeMm,
  color,
}: {
  zLinearMm: number;
  maxStrokeMm: number;
  color: string;
}) {
  const clampedMm = Math.max(-maxStrokeMm, Math.min(maxStrokeMm, zLinearMm));
  const normalized = (clampedMm + maxStrokeMm) / (2 * maxStrokeMm);
  const markerPercent = 10 + normalized * 80;

  return (
    <div className="w-full flex flex-col items-center py-1">
      <div className="w-full px-2">
        <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-1">
          <span>-{maxStrokeMm}mm</span>
          <span className="text-slate-400">0 (Nominal)</span>
          <span>+{maxStrokeMm}mm</span>
        </div>

        {/* Linear Stage Track */}
        <div className="relative h-5 w-full rounded-md border border-white/10 bg-black/60 overflow-hidden">
          <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-slate-600 -translate-x-1/2" />

          {clampedMm >= 0 ? (
            <div
              className="absolute top-1 bottom-1 left-1/2 rounded bg-amber-500/30 border border-amber-500/50"
              style={{ width: `${(clampedMm / maxStrokeMm) * 40}%` }}
            />
          ) : (
            <div
              className="absolute top-1 bottom-1 right-1/2 rounded bg-amber-500/30 border border-amber-500/50"
              style={{ width: `${(Math.abs(clampedMm) / maxStrokeMm) * 40}%` }}
            />
          )}

          <div
            className="absolute top-0 bottom-0 w-3 -translate-x-1/2 rounded bg-amber-400 shadow-md shadow-amber-500/50 flex items-center justify-center transition-all duration-75"
            style={{ left: `${markerPercent}%` }}
          >
            <div className="w-0.5 h-3 bg-slate-900 rounded-full" />
          </div>
        </div>
      </div>
      <div className="text-[10px] text-slate-400 font-medium mt-1">Pre-Objective Fiber Focus Position</div>
    </div>
  );
}
