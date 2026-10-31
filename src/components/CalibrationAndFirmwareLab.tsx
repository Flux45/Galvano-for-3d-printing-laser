import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  generateArduinoFirmwareSketch,
  generateCalibratedGCode,
  generateCalibrationGrid,
  generateLayerCalibrationTable,
  generateOpenScadMountCode,
  getStepperModeLabel,
  type CalibrationParams,
  type OptimizedPathResult,
  type StepperMode,
} from '../utils/galvoMath';
import { PROTOTYPE_CAD_PARTS } from '../data/prototypeCadData';
import { Check, Copy, Download, RotateCcw, Terminal } from 'lucide-react';

interface CalibrationAndFirmwareLabProps {
  primarySection?: 'calibration' | 'bom';
  calibration: CalibrationParams;
  onChangeCalibration: (next: CalibrationParams) => void;
  optimizedPath: OptimizedPathResult;
  onDownloadScad: () => void;
  onDownloadStl: (partId: string) => void;
}

export const CalibrationAndFirmwareLab: React.FC<CalibrationAndFirmwareLabProps> = ({
  primarySection = 'calibration',
  calibration,
  onChangeCalibration,
  optimizedPath,
  onDownloadScad,
  onDownloadStl,
}) => {
  const rawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const correctedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [codeTab, setCodeTab] = useState<'arduino' | 'gcode' | 'openscad'>('arduino');
  const [copied, setCopied] = useState<boolean>(false);
  const [serialLog, setSerialLog] = useState<string[]>([
    'READY: GalvoProto Arduino Uno R3 Virtual Serial Bus (115200 baud)',
    'INFO: 5mW 650nm Kids Laser Diode armed on Pin D11 (Timer2 PWM)',
  ]);

  const gridData = useMemo(
    () => generateCalibrationGrid(calibration, 9),
    [calibration]
  );

  const layerTable = useMemo(
    () => generateLayerCalibrationTable(calibration, 8),
    [calibration]
  );

  const arduinoCode = useMemo(
    () => generateArduinoFirmwareSketch(calibration),
    [calibration]
  );

  const gcodeText = useMemo(
    () => generateCalibratedGCode(optimizedPath, calibration, 1),
    [optimizedPath, calibration]
  );

  const openscadCode = useMemo(
    () => generateOpenScadMountCode(calibration),
    [calibration]
  );

  const activeCodeString =
    codeTab === 'arduino'
      ? arduinoCode
      : codeTab === 'gcode'
        ? gcodeText
        : openscadCode;

  // Render Uncalibrated vs Pre-Warped 9x9 Calibration Dot Grids
  useEffect(() => {
    const drawGrid = (
      canvas: HTMLCanvasElement | null,
      mode: 'uncalibrated' | 'calibrated'
    ) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#070b14';
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const fieldMm = Math.max(60, calibration.fieldSizeMm);
      const pxPerMm = (Math.min(w, h) * 0.82) / fieldMm;

      const toPx = (pt: { x: number; y: number }) => ({
        x: cx + pt.x * pxPerMm,
        y: cy - pt.y * pxPerMm,
      });

      // Outer scan boundary circle
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, (fieldMm * 0.5) * pxPerMm, 0, Math.PI * 2);
      ctx.stroke();

      // Ideal reference cross-lines
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
      ctx.lineWidth = 1;
      for (const p of gridData.points) {
        const idealPx = toPx(p.ideal);
        ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.beginPath();
        ctx.arc(idealPx.x, idealPx.y, 2, 0, Math.PI * 2);
        ctx.fill();

        const actualPt =
          mode === 'uncalibrated' ? p.rawDistorted : p.correctedLanding;
        const actualPx = toPx(actualPt);

        // Error vector line
        ctx.strokeStyle =
          mode === 'uncalibrated'
            ? 'rgba(244, 63, 94, 0.5)'
            : 'rgba(16, 185, 129, 0.5)';
        ctx.beginPath();
        ctx.moveTo(idealPx.x, idealPx.y);
        ctx.lineTo(actualPx.x, actualPx.y);
        ctx.stroke();

        // Laser landing spot
        ctx.fillStyle = mode === 'uncalibrated' ? '#f43f5e' : '#06b6d4';
        ctx.beginPath();
        ctx.arc(actualPx.x, actualPx.y, 3.6, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    drawGrid(rawCanvasRef.current, 'uncalibrated');
    drawGrid(correctedCanvasRef.current, 'calibrated');
  }, [gridData, calibration.fieldSizeMm]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(activeCodeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadCode = () => {
    const ext =
      codeTab === 'arduino'
        ? 'GalvoProto_Arduino_Uno.ino'
        : codeTab === 'gcode'
          ? 'GalvoProto_Calibrated_Layer1.gcode'
          : 'GalvoProto_Stepper_Mount.scad';
    const blob = new Blob([activeCodeString], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = ext;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSimulateSerialSend = () => {
    const sampleLines = gcodeText
      .split('\n')
      .filter((l) => l.startsWith('G0') || l.startsWith('G1') || l.startsWith('M3'))
      .slice(0, 4);
    setSerialLog((prev) => [
      ...prev.slice(-8),
      `TX -> ${sampleLines.join(' | ')}`,
      `RX <- OK [Steps quantized · Radial k1=${calibration.radialK1.toFixed(3)} · Backlash=${calibration.backlashXMm.toFixed(2)}mm]`,
    ]);
  };

  const totalPrototypeCost = PROTOTYPE_CAD_PARTS.reduce((acc, p) => acc + p.costUsd, 0);
  const totalIndustrialCost = PROTOTYPE_CAD_PARTS.reduce(
    (acc, p) => acc + p.industrialEquivalentCostUsd,
    0
  );

  return (
    <section
      className={`max-w-[1400px] mx-auto px-6 py-6 flex flex-col gap-8 ${
        primarySection === 'bom' ? 'flex-col-reverse' : ''
      }`}
    >
      {/* Section 1: Optical Field Distortion & Stepper Backlash Calibration */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 bg-[#0b1120] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs text-cyan-400 font-medium">
                Lensless Tangent Compensation & Stepper Microstep Calibration
              </div>
              <h2 className="text-lg font-bold text-white mt-0.5">
                9×9 Optical Dot-Grid Distortion & Layer Calibration
              </h2>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
              <div>
                <span className="text-slate-400">Raw RMS Error: </span>
                <span className="text-rose-400 font-semibold">
                  {gridData.rmsErrorBeforeMm.toFixed(2)} mm
                </span>
              </div>
              <div>
                <span className="text-slate-400">Calibrated RMS: </span>
                <span className="text-emerald-400 font-semibold">
                  {gridData.rmsErrorAfterMm.toFixed(2)} mm
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-300 flex items-center justify-between">
                <span>Uncalibrated Stepper Tangent Field</span>
                <span className="font-mono tabular-nums text-rose-400">Pincushion + Skew</span>
              </div>
              <canvas
                ref={rawCanvasRef}
                width={380}
                height={380}
                className="w-full aspect-square rounded-lg border border-slate-800"
              />
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-300 flex items-center justify-between">
                <span>Pre-Warped & Quantized Stepper Field</span>
                <span className="font-mono tabular-nums text-cyan-300">
                  k1 = {calibration.radialK1.toFixed(3)}
                </span>
              </div>
              <canvas
                ref={correctedCanvasRef}
                width={380}
                height={380}
                className="w-full aspect-square rounded-lg border border-slate-800"
              />
            </div>
          </div>

          {/* Multi-Layer Z-Stage Calibration Table */}
          <div className="pt-4 border-t border-slate-800/80">
            <h3 className="text-sm font-semibold text-white mb-2">
              Multi-Layer Z-Stage Focus & Exposure Lookup Table
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-sans">
                    <th className="py-2 pr-3">Layer</th>
                    <th className="py-2 px-3 text-right">Z Height</th>
                    <th className="py-2 px-3 text-right">T8 Z-Steps</th>
                    <th className="py-2 px-3 text-right">Effective L0</th>
                    <th className="py-2 px-3 text-right">XY Scale Factor</th>
                    <th className="py-2 pl-3 text-right">Corner Gate Delay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {layerTable.map((row) => (
                    <tr key={row.layerIndex} className="hover:bg-slate-900/60">
                      <td className="py-2 pr-3 text-cyan-300">Layer 0{row.layerIndex}</td>
                      <td className="py-2 px-3 text-right">{row.zHeightMm.toFixed(3)} mm</td>
                      <td className="py-2 px-3 text-right text-amber-300">{row.zLeadscrewSteps}</td>
                      <td className="py-2 px-3 text-right">{row.effectiveWorkDistMm.toFixed(2)} mm</td>
                      <td className="py-2 px-3 text-right text-emerald-300">
                        {row.scaleCorrectionFactor.toFixed(5)}×
                      </td>
                      <td className="py-2 pl-3 text-right">{row.cornerLaserGateDelayUs} µs</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Controls Panel */}
        <div className="lg:col-span-4 bg-[#0b1120] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              Hardware & Calibration Parameters
            </h3>
            <button
              type="button"
              onClick={() =>
                onChangeCalibration({
                  workingDistanceMm: 140,
                  fieldSizeMm: 100,
                  radialK1: 0.14,
                  tangentialSkewDeg: 0.0,
                  backlashXMm: 0.12,
                  backlashYMm: 0.12,
                  stepperMode: 'nema17_32x_belt3x',
                  scanSpeedMmPerSec: 180,
                  jumpSpeedMmPerSec: 420,
                  laserPowerPct: 90,
                  layerHeightUm: 100,
                })
              }
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              Optimal Preset
            </button>
          </div>

          <div>
            <label htmlFor="stepper-mode-select" className="block text-xs font-medium text-slate-300 mb-1.5">
              Stepper Motor & Microstep Drive
            </label>
            <select
              id="stepper-mode-select"
              value={calibration.stepperMode}
              onChange={(e) =>
                onChangeCalibration({
                  ...calibration,
                  stepperMode: e.target.value as StepperMode,
                })
              }
              className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-400"
            >
              <option value="nema17_32x_belt3x">
                NEMA 17 + 3:1 GT2 Pulley (1/32 Step · 0.0188°/step)
              </option>
              <option value="28byj48_half">
                28BYJ-48 5V Geared Stepper (4096 steps/rev · 0.0879°/step)
              </option>
              <option value="nema17_16x">
                NEMA 17 Direct Shaft (1/16 Step · 0.1125°/step)
              </option>
            </select>
          </div>

          <div className="space-y-3 pt-2">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="calib-k1" className="text-slate-300">
                  Radial Pincushion Compensation (k1)
                </label>
                <span className="font-mono tabular-nums text-cyan-300">
                  {calibration.radialK1.toFixed(3)}
                </span>
              </div>
              <input
                id="calib-k1"
                type="range"
                min={-0.2}
                max={0.25}
                step={0.01}
                value={calibration.radialK1}
                onChange={(e) =>
                  onChangeCalibration({ ...calibration, radialK1: Number(e.target.value) })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="calib-skew" className="text-slate-300">
                  Mirror Orthogonality Skew Trim
                </label>
                <span className="font-mono tabular-nums text-cyan-300">
                  {calibration.tangentialSkewDeg.toFixed(2)}°
                </span>
              </div>
              <input
                id="calib-skew"
                type="range"
                min={-3.0}
                max={3.0}
                step={0.1}
                value={calibration.tangentialSkewDeg}
                onChange={(e) =>
                  onChangeCalibration({
                    ...calibration,
                    tangentialSkewDeg: Number(e.target.value),
                  })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="calib-backlash" className="text-slate-300">
                  Stepper Belt / Gear Backlash X & Y
                </label>
                <span className="font-mono tabular-nums text-amber-300">
                  {calibration.backlashXMm.toFixed(2)} mm
                </span>
              </div>
              <input
                id="calib-backlash"
                type="range"
                min={0}
                max={0.6}
                step={0.02}
                value={calibration.backlashXMm}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onChangeCalibration({
                    ...calibration,
                    backlashXMm: val,
                    backlashYMm: val,
                  });
                }}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="calib-work-dist" className="text-slate-300">
                  Mirror-to-Bed Working Distance (L0)
                </label>
                <span className="font-mono tabular-nums text-cyan-300">
                  {calibration.workingDistanceMm} mm
                </span>
              </div>
              <input
                id="calib-work-dist"
                type="range"
                min={90}
                max={220}
                step={5}
                value={calibration.workingDistanceMm}
                onChange={(e) =>
                  onChangeCalibration({
                    ...calibration,
                    workingDistanceMm: Number(e.target.value),
                  })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="calib-layer-height" className="text-slate-300">
                  Z Slice Layer Thickness
                </label>
                <span className="font-mono tabular-nums text-cyan-300">
                  {calibration.layerHeightUm} µm
                </span>
              </div>
              <input
                id="calib-layer-height"
                type="range"
                min={25}
                max={200}
                step={25}
                value={calibration.layerHeightUm}
                onChange={(e) =>
                  onChangeCalibration({
                    ...calibration,
                    layerHeightUm: Number(e.target.value),
                  })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Arduino Firmware (.ino), Calibrated G-Code & Low-Cost BOM */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Firmware & G-Code Generator */}
        <div className="lg:col-span-7 bg-[#0b1120] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              role="group"
              aria-label="Export Code Format"
              className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg"
            >
              {(
                [
                  { id: 'arduino', label: 'Arduino Uno Sketch (.ino)' },
                  { id: 'gcode', label: 'Calibrated G-Code (.gcode)' },
                  { id: 'openscad', label: '3D Mount CAD (.scad)' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCodeTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    codeTab === tab.id
                      ? 'bg-cyan-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyCode}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy Code'}
              </button>
              <button
                type="button"
                onClick={handleDownloadCode}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Download File
              </button>
            </div>
          </div>

          <pre className="w-full h-80 overflow-auto p-4 rounded-lg bg-[#050811] border border-slate-800 text-xs font-mono text-emerald-300 leading-relaxed">
            <code>{activeCodeString}</code>
          </pre>

          {/* Simulated Serial Streamer Bar */}
          <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                Arduino Serial Stream Verification (115200 baud)
              </div>
              <button
                type="button"
                onClick={handleSimulateSerialSend}
                className="px-3 py-1 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                Stream Test Frame to Controller
              </button>
            </div>
            <div className="p-2.5 rounded bg-[#050811] border border-slate-800/80 font-mono text-[11px] text-slate-300 space-y-1 max-h-28 overflow-y-auto">
              {serialLog.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Low-Cost Prototype Bill of Materials Comparison */}
        <div className="lg:col-span-5 bg-[#0b1120] border border-slate-800 rounded-xl p-5 space-y-4">
          <div>
            <div className="text-xs text-emerald-400 font-medium">
              98.4% Cost Reduction for Concept & Firmware Validation
            </div>
            <h3 className="text-base font-bold text-white mt-0.5">
              Low-Cost DIY Prototype Bill of Materials
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-sans">
                  <th className="py-2 pr-2">Subsystem Component</th>
                  <th className="py-2 px-2 text-right">DIY Prototype</th>
                  <th className="py-2 pl-2 text-right">Industrial SLM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {PROTOTYPE_CAD_PARTS.map((part) => (
                  <tr key={part.id} className="text-slate-200">
                    <td className="py-2.5 pr-2 font-sans">
                      <div className="font-medium text-white">{part.name}</div>
                      <div className="text-[11px] text-slate-400">{part.materialAndPrintSpec}</div>
                    </td>
                    <td className="py-2.5 px-2 text-right text-emerald-400 font-semibold">
                      ${part.costUsd.toFixed(2)}
                    </td>
                    <td className="py-2.5 pl-2 text-right text-slate-500 line-through">
                      ${part.industrialEquivalentCostUsd}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-700 font-semibold text-sm">
                  <td className="pt-3 font-sans text-white">Total Hardware Budget</td>
                  <td className="pt-3 px-2 text-right text-emerald-400">
                    ${totalPrototypeCost.toFixed(2)}
                  </td>
                  <td className="pt-3 pl-2 text-right text-slate-500 line-through">
                    ${totalIndustrialCost}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="pt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onDownloadStl('all-mounts')}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Download All 3D Printable Mounts (.stl)
            </button>
            <button
              type="button"
              onClick={onDownloadScad}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Parametric OpenSCAD (.scad)
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
