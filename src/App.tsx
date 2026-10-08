import { useState } from "react";
import { BookOpenText, Crosshair, LayoutGrid, Radar, Settings2 } from "lucide-react";
import { GalvoProvider } from "./context/GalvoContext";
import OverviewPage from "./components/OverviewPage";
import StudioPage from "./components/StudioPage";
import CalibrationPage from "./components/CalibrationPage";
import ExportPage from "./components/ExportPage";
import { cn } from "./utils/cn";

type Tab = "overview" | "studio" | "calibration" | "export";

const TABS: { id: Tab; label: string; icon: typeof BookOpenText }[] = [
  { id: "overview", label: "Overview", icon: BookOpenText },
  { id: "studio", label: "Toolpath Studio", icon: LayoutGrid },
  { id: "calibration", label: "Calibration", icon: Crosshair },
  { id: "export", label: "Export / Control", icon: Settings2 },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <GalvoProvider>
      <div className="min-h-screen bg-[#0b0f17] text-slate-100">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0f17]/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-600 shadow-lg shadow-cyan-900/40">
                <Radar className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-semibold leading-tight tracking-tight text-white sm:text-lg">
                  GalvoForge
                </h1>
                <p className="text-[11px] leading-tight text-slate-400 sm:text-xs">
                  Galvanometer Laser-SLA Toolpath &amp; Control Suite
                </p>
              </div>
            </div>
            <nav className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 md:flex">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                    tab === t.id ? "bg-cyan-500 text-slate-900" : "text-slate-300 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex gap-1 overflow-x-auto border-t border-white/5 px-3 py-2 md:hidden">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
                  tab === t.id ? "bg-cyan-500 text-slate-900" : "bg-white/5 text-slate-300",
                )}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 pb-16 pt-6 sm:px-6">
          {tab === "overview" && <OverviewPage onLaunch={() => setTab("studio")} />}
          {tab === "studio" && <StudioPage />}
          {tab === "calibration" && <CalibrationPage />}
          {tab === "export" && <ExportPage />}
        </main>
      </div>
    </GalvoProvider>
  );
}
