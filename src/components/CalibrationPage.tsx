import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Info, Layers } from "lucide-react";
import { useGalvo } from "../context/GalvoContext";
import { applyFieldCorrection } from "../lib/geometry";
import { CalibrationAndFirmwareLab } from "./CalibrationAndFirmwareLab";
import {
  DEFAULT_CALIBRATION_PARAMS,
  generateOpenScadMountCode,
  generatePresetLayerSegments,
  optimizeToolpath,
  type CalibrationParams,
  type StepperMode,
} from "../utils/galvoMath";
import { downloadTextFile } from "../lib/exportFormat";

const SIZE = 520;

export default function CalibrationPage() {
  const { field, setField } = useGalvo();
  const [calibration, setCalibration] = useState<CalibrationParams>(DEFAULT_CALIBRATION_PARAMS);
  const optimizedPath = useMemo(() => {
    const segs = generatePresetLayerSegments("calibration_gear", 4.5);
    return optimizeToolpath(segs, "2opt_skywriting", calibration.scanSpeedMmPerSec, calibration.jumpSpeedMmPerSec);
  }, [calibration]);
  const rawRef = useRef<HTMLCanvasElement>(null);
  const correctedRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    drawGrid(rawRef.current, field.fieldSizeMm, 0);
    drawGrid(correctedRef.current, field.fieldSizeMm, field.pincushionK);
  }, [field.fieldSizeMm, field.pincushionK]);

  function drawGrid(canvas: HTMLCanvasElement | null, fieldSize: number, k: number) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    canvas.style.width = `${SIZE}px`;
    canvas.style.height = `${SIZE}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = "#070b12";
    ctx.fillRect(0, 0, SIZE, SIZE);

    const scale = SIZE / fieldSize;
    const toPx = (x: number, y: number) => ({ x: SIZE / 2 + x * scale, y: SIZE / 2 - y * scale });

    ctx.strokeStyle = "rgba(34,211,238,0.3)";
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, (fieldSize / 2) * scale, 0, Math.PI * 2);
    ctx.stroke();

    const step = fieldSize / 10;
    ctx.fillStyle = "#67e8f9";
    for (let gx = -fieldSize / 2; gx <= fieldSize / 2 + 0.01; gx += step) {
      for (let gy = -fieldSize / 2; gy <= fieldSize / 2 + 0.01; gy += step) {
        const corrected = applyFieldCorrection({ x: gx, y: gy }, { fieldSizeMm: fieldSize, spotSizeMicron: 0, pincushionK: k });
        const p = toPx(corrected.x, corrected.y);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ideal dashed reference grid
    ctx.strokeStyle = "rgba(148,163,184,0.18)";
    ctx.setLineDash([3, 3]);
    for (let gx = -fieldSize / 2; gx <= fieldSize / 2 + 0.01; gx += step) {
      const p1 = toPx(gx, -fieldSize / 2);
      const p2 = toPx(gx, fieldSize / 2);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    for (let gy = -fieldSize / 2; gy <= fieldSize / 2 + 0.01; gy += step) {
      const p1 = toPx(-fieldSize / 2, gy);
      const p2 = toPx(fieldSize / 2, gy);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold text-white">
          <Crosshair className="h-5 w-5 text-cyan-300" /> Field calibration
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Real galvo/F-theta optics rarely map perfectly flat — mirror rotation and lens curvature introduce
          pincushion or barrel distortion plus bow near the field edges. The standard fix is to print/scan a dot
          grid, measure the actual landing position of each dot, and build a correction map that is applied to every
          vector before it's sent to the controller. Use the slider below to see how a radial correction coefficient
          pre-warps the grid so the real output comes out square.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_260px]">
        <div className="space-y-2">
          <p className="text-center text-xs font-medium text-slate-400">Uncorrected scan field (ideal grid)</p>
          <canvas ref={rawRef} className="w-full rounded-xl border border-white/10" />
        </div>
        <div className="space-y-2">
          <p className="text-center text-xs font-medium text-slate-400">
            Pre-warped command grid (k = {field.pincushionK.toFixed(3)})
          </p>
          <canvas ref={correctedRef} className="w-full rounded-xl border border-white/10" />
        </div>
        <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs text-slate-300">
          <div>
            <label className="mb-1 flex items-center justify-between">
              Field size (mm)
              <span className="text-slate-400">{field.fieldSizeMm}</span>
            </label>
            <input
              type="range"
              min={50}
              max={400}
              step={10}
              value={field.fieldSizeMm}
              onChange={(e) => setField({ fieldSizeMm: Number(e.target.value) })}
              className="w-full accent-cyan-400"
            />
          </div>
          <div>
            <label className="mb-1 flex items-center justify-between">
              Spot size (µm)
              <span className="text-slate-400">{field.spotSizeMicron}</span>
            </label>
            <input
              type="range"
              min={20}
              max={300}
              step={5}
              value={field.spotSizeMicron}
              onChange={(e) => setField({ spotSizeMicron: Number(e.target.value) })}
              className="w-full accent-cyan-400"
            />
          </div>
          <div>
            <label className="mb-1 flex items-center justify-between">
              Distortion coefficient k
              <span className="text-slate-400">{field.pincushionK.toFixed(3)}</span>
            </label>
            <input
              type="range"
              min={-0.25}
              max={0.25}
              step={0.005}
              value={field.pincushionK}
              onChange={(e) => setField({ pincushionK: Number(e.target.value) })}
              className="w-full accent-cyan-400"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Negative = barrel correction, positive = pincushion correction. Derived in practice from measured dot
              offsets at the calibration station, not guessed by eye.
            </p>
          </div>

          <div className="flex gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3 text-[11px] text-cyan-200">
            <Info className="h-4 w-4 shrink-0" />
            <p>
              All vectors generated in the Toolpath Studio are automatically run through this same radial model
              (see Export) before being converted into controller commands, so changes here propagate to the
              exported G-code-style stream.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-slate-400">
        <h3 className="mb-2 text-sm font-semibold text-white">Calibration workflow in practice</h3>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Mark a known N×N dot grid (e.g. 9×9 at 10mm pitch) at low power onto card stock or burned acrylic.</li>
          <li>Photograph or measure each dot's real XY position relative to the commanded position.</li>
          <li>Fit a correction model (radial k-coefficient here, or a full per-point lookup table for best accuracy).</li>
          <li>Bake the correction into firmware/software so every future job is pre-warped automatically.</li>
          <li>Re-validate after any mechanical disturbance to the laser/mirror/lens stack.</li>
        </ol>
      </div>

      <div className="space-y-4 border-t border-white/10 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold text-white">
              <Layers className="h-5 w-5 text-amber-300" /> Multi-Layer Z-Stage, Stepper Backlash &amp; Arduino Firmware Lab
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Configure 4-axis dynamic focus (Δz), descending Z-bed layer stepping, directional stepper backlash
              compensation, and export ready-to-flash Arduino Uno R3 (.ino) and OpenSCAD (.scad) files.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={calibration.stepperMode}
              onChange={(e) => setCalibration((prev) => ({ ...prev, stepperMode: e.target.value as StepperMode }))}
              className="rounded-lg border border-white/15 bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-200"
            >
              <option value="nema17_32x_belt3x">NEMA17 1/32 + 3:1 GT2 Belt (0.0187°/step)</option>
              <option value="nema17_16x">NEMA17 Direct 1/16 (0.1125°/step)</option>
              <option value="28byj48_half">28BYJ-48 ULN2003 Half-Step (0.0879°/step)</option>
            </select>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#090D16]">
          <CalibrationAndFirmwareLab
            calibration={calibration}
            onChangeCalibration={setCalibration}
            optimizedPath={optimizedPath}
            onDownloadScad={() =>
              downloadTextFile("galvo_stepper_mount.scad", generateOpenScadMountCode(calibration))
            }
            onDownloadStl={(partId) =>
              downloadTextFile(`${partId}.stl`, `solid ${partId}\nendsolid ${partId}\n`)
            }
          />
        </div>
      </div>
    </div>
  );
}
