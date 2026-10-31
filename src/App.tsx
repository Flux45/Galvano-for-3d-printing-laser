import { useMemo, useState } from "react";
import {
  Activity,
  BookOpenText,
  Boxes,
  Cpu,
  Crosshair,
  LayoutGrid,
  Radar,
  Route,
  Settings2,
} from "lucide-react";
import { GalvoProvider } from "./context/GalvoContext";
import OverviewPage from "./components/OverviewPage";
import StudioPage from "./components/StudioPage";
import CalibrationPage from "./components/CalibrationPage";
import ExportPage from "./components/ExportPage";
import HardwarePage from "./components/HardwarePage";
import AnatomyPage from "./components/AnatomyPage";
import { CadViewport3D } from "./components/CadViewport3D";
import { PathOptimizerStudio, type PresetShapeType } from "./components/PathOptimizerStudio";
import {
  DEFAULT_CALIBRATION_PARAMS,
  generateOpenScadMountCode,
  generatePresetLayerSegments,
  optimizeToolpath,
  type CalibrationParams,
  type OptimizationAlgorithm,
  type VectorSegment,
} from "./utils/galvoMath";
import { downloadTextFile } from "./lib/exportFormat";
import { cn } from "./utils/cn";

type Tab =
  | "overview"
  | "prototype"
  | "optimizer"
  | "studio"
  | "anatomy"
  | "hardware"
  | "calibration"
  | "export";

const TABS: { id: Tab; label: string; icon: typeof BookOpenText; badge?: string }[] = [
  { id: "overview", label: "Overview", icon: BookOpenText },
  { id: "prototype", label: "DIY Prototype CAD", icon: Cpu, badge: "$65" },
  { id: "optimizer", label: "Path Optimizer", icon: Route, badge: "2-Opt" },
  { id: "studio", label: "Toolpath Studio", icon: LayoutGrid },
  { id: "anatomy", label: "Machine Anatomy", icon: Activity },
  { id: "hardware", label: "3D Hardware BOM", icon: Boxes },
  { id: "calibration", label: "Calibration", icon: Crosshair },
  { id: "export", label: "Export / Control", icon: Settings2 },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("prototype");
  const [selectedCadPart, setSelectedCadPart] = useState<string | null>(null);
  const [calibration, setCalibration] = useState<CalibrationParams>(DEFAULT_CALIBRATION_PARAMS);
  const [presetShape, setPresetShape] = useState<PresetShapeType>("calibration_gear");
  const [hatchSpacingMm, setHatchSpacingMm] = useState<number>(4.5);
  const [algorithm, setAlgorithm] = useState<OptimizationAlgorithm>("2opt_skywriting");
  const [customSegments, setCustomSegments] = useState<VectorSegment[]>([]);

  const activeSegments = useMemo(() => {
    const base = generatePresetLayerSegments(presetShape, hatchSpacingMm);
    return [...base, ...customSegments];
  }, [presetShape, hatchSpacingMm, customSegments]);

  const optimizedPath = useMemo(() => {
    return optimizeToolpath(
      activeSegments,
      algorithm,
      calibration.scanSpeedMmPerSec,
      calibration.jumpSpeedMmPerSec
    );
  }, [activeSegments, algorithm, calibration.scanSpeedMmPerSec, calibration.jumpSpeedMmPerSec]);

  const handleDownloadScad = () => {
    downloadTextFile("galvo_stepper_mount.scad", generateOpenScadMountCode(calibration));
  };

  const handleDownloadStl = (partId: string) => {
    const stlAscii = `solid ${partId}\n  facet normal 0 0 1\n    outer loop\n      vertex 0 0 0\n      vertex 20 0 0\n      vertex 0 20 0\n    endloop\n  endfacet\nendsolid ${partId}\n`;
    downloadTextFile(`${partId}.stl`, stlAscii);
  };

  return (
    <GalvoProvider>
      <div className="min-h-screen bg-[#0b0f17] text-slate-100">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0f17]/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1560px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
            <div
              onClick={() => setTab("overview")}
              className="flex cursor-pointer items-center gap-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-600 shadow-lg shadow-cyan-900/40">
                <Radar className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-semibold leading-tight tracking-tight text-white">
                    GalvoForge
                  </h1>
                  <span className="rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-300">
                    v2.4 + DIY Stepper CAD
                  </span>
                </div>
                <p className="text-[11px] leading-tight text-slate-400">
                  Galvanometer 3D Laser Printing, Path Optimization &amp; $65 Arduino Prototype Studio
                </p>
              </div>
            </div>

            <nav className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 xl:flex">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    tab === t.id
                      ? "bg-cyan-500 text-slate-950 font-semibold"
                      : "text-slate-300 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  <span>{t.label}</span>
                  {t.badge && (
                    <span
                      className={cn(
                        "rounded px-1 py-0.2 font-mono text-[9px] font-bold",
                        tab === t.id
                          ? "bg-slate-950/25 text-slate-950"
                          : "bg-amber-400/15 text-amber-300",
                      )}
                    >
                      {t.badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex gap-1 overflow-x-auto border-t border-white/5 px-3 py-2 xl:hidden">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
                  tab === t.id ? "bg-cyan-500 text-slate-900 font-semibold" : "bg-white/5 text-slate-300",
                )}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        </header>

        {tab === "prototype" ? (
          <main className="h-[calc(100vh-58px)] w-full overflow-hidden">
            <CadViewport3D
              calibration={calibration}
              optimizedPath={optimizedPath}
              selectedPartId={selectedCadPart}
              onSelectPart={setSelectedCadPart}
              onDownloadScad={handleDownloadScad}
              onDownloadStl={handleDownloadStl}
            />
          </main>
        ) : (
          <main className="mx-auto max-w-[1500px] px-4 pb-16 pt-6 sm:px-6">
            {tab === "overview" && (
              <OverviewPage
                onLaunch={() => setTab("studio")}
                onOpenPrototype={() => setTab("prototype")}
                onOpenOptimizer={() => setTab("optimizer")}
                onOpenCalibration={() => setTab("calibration")}
              />
            )}
            {tab === "optimizer" && (
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#090D16] shadow-2xl">
                <PathOptimizerStudio
                  segments={activeSegments}
                  algorithm={algorithm}
                  onChangeAlgorithm={setAlgorithm}
                  presetShape={presetShape}
                  onChangePresetShape={(preset) => {
                    setPresetShape(preset);
                    setCustomSegments([]);
                  }}
                  hatchSpacingMm={hatchSpacingMm}
                  onChangeHatchSpacing={setHatchSpacingMm}
                  onAddCustomSegment={(seg) => setCustomSegments((prev) => [...prev, seg])}
                  onResetSegments={() => setCustomSegments([])}
                  calibration={calibration}
                />
              </div>
            )}
            {tab === "studio" && <StudioPage />}
            {tab === "anatomy" && <AnatomyPage />}
            {tab === "hardware" && <HardwarePage />}
            {tab === "calibration" && <CalibrationPage />}
            {tab === "export" && <ExportPage />}
          </main>
        )}
      </div>
    </GalvoProvider>
  );
}
