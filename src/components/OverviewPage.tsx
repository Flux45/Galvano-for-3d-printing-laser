import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Cpu,
  Layers,
  Lightbulb,
  Magnet,
  Radar,
  ScanLine,
  Target,
  Waves,
} from "lucide-react";

const COMPONENTS = [
  {
    icon: Waves,
    title: "UV Laser Source",
    desc: "A 405nm (or 355nm for true photoinitiator match) diode/DPSS laser, collimated and focused. Power typically 50mW–2W for hobby/prosumer resin curing.",
  },
  {
    icon: Radar,
    title: "X/Y Galvanometer Pair",
    desc: "Two mirror-tipped galvo motors mounted orthogonally. Each rotates a few degrees to steer the beam, driven by a closed-loop servo amplifier for microsecond positioning.",
  },
  {
    icon: Target,
    title: "F-Theta Lens",
    desc: "A flat-field lens placed after the mirrors so the focused spot lands on a flat plane (the resin surface) with constant spot size across the whole scan field, instead of a curved focal surface.",
  },
  {
    icon: Cpu,
    title: "Galvo Controller Board",
    desc: "Converts vector commands into XY2-100 digital (or ±10V analog) signals for the two galvo drivers, and pulses/modulates the laser (TTL or analog power) in sync with mirror position.",
  },
  {
    icon: Layers,
    title: "Z-Stage & Resin Vat",
    desc: "Same subsystem as any SLA machine: a build platform that dips/lifts through a resin tank (or hangs above a tank with a transparent FEP/glass floor) by one layer height per cycle.",
  },
  {
    icon: Magnet,
    title: "Frame & Optics Mount",
    desc: "Rigid enclosure holding laser, mirrors and lens in fixed alignment — vibration and thermal drift here directly translate into print distortion, so it must be stiff and light-sealed.",
  },
];

const PIPELINE = [
  {
    step: "1",
    title: "Slice the model",
    desc: "The STL/3MF mesh is sliced into thin horizontal layers (25–100µm), just like DLP/FDM slicers, producing 2D polygon contours per layer.",
  },
  {
    step: "2",
    title: "Generate vectors",
    desc: "Each layer's contours are offset/outlined, and the interior is filled with hatch lines (parallel, cross-hatch, or spiral) spaced to match the laser spot size and desired cure overlap.",
  },
  {
    step: "3",
    title: "Order & optimize",
    desc: "Vectors are sorted to minimize travel ('jump') distance and galvo settling time, with skywriting/delay compensation added at sharp corners so the beam doesn't over- or under-expose.",
  },
  {
    step: "4",
    title: "Field correction",
    desc: "A calibration map (built from a scanned dot grid) pre-warps every point to cancel pincushion/barrel distortion and bow introduced by the F-theta lens and mirror geometry.",
  },
  {
    step: "5",
    title: "Stream to controller",
    desc: "The corrected vectors are converted into XY2-100 / analog command frames (or G-code-like ASCII for DIY serial boards) and streamed in sync with laser power modulation.",
  },
  {
    step: "6",
    title: "Cure & step Z",
    desc: "The laser traces the layer onto the resin surface, the platform steps by one layer height, recoats, and the cycle repeats until the part is complete.",
  },
];

const PROS_CONS = {
  pros: [
    "No DLP/LCD projector or masking panel to wear out — mirrors are the only moving optical parts",
    "Resolution is limited by spot size & positioning accuracy, not pixel pitch, so very large build areas stay sharp",
    "Vector exposure lets you vary power/speed per feature (fine detail vs. bulk fill) in the same layer",
    "Scales well to big-format or industrial resin printers / SLA where masked panels get expensive",
  ],
  cons: [
    "Layer times scale with vector length, not constant like masked exposure — fine lattices can be slow",
    "Requires precision analog/digital calibration (XY2-100 board, F-theta lens, distortion mapping)",
    "Mirror/driver hardware and alignment are more complex and costly than an LCD masking panel",
    "Laser safety enclosure (Class 4 UV) is mandatory — far stricter than LED/UV panel printers",
  ],
};

export default function OverviewPage({
  onLaunch,
  onOpenPrototype,
  onOpenOptimizer,
  onOpenCalibration,
}: {
  onLaunch: () => void;
  onOpenPrototype?: () => void;
  onOpenOptimizer?: () => void;
  onOpenCalibration?: () => void;
}) {
  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950 p-6 sm:p-10">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div className="space-y-5">
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-300">
              <ScanLine className="h-3.5 w-3.5" /> Galvanometer-based Laser SLA &amp; DIY Stepper Prototype
            </span>
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
              Build a galvo laser scanner for your 3D printer — and validate it with a $65 Arduino + Stepper prototype.
            </h2>
            <p className="max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
              A "galvano" (galvanometer scanner) steers a focused laser beam with two orthogonal mirrors instead of
              projecting a masked image. Now featuring our{" "}
              <strong className="text-amber-300">
                Low-Cost 4-Axis Prototype CAD (5mW Kids Laser with Motorized Linear Focus Stage Δz, Stepper Galvo
                Mirrors, Descending Z-Bed Elevator, and Arduino Uno R3 + CNC Shield V3)
              </strong>
              , <strong className="text-cyan-300">Real-Time 2-Opt + Corner Skywriting Path Optimization</strong>, and{" "}
              <strong className="text-emerald-300">Multi-Layer Z-Stage &amp; Stepper Backlash Calibration</strong>.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {onOpenPrototype && (
                <button
                  onClick={onOpenPrototype}
                  className="group inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-300"
                >
                  Open $65 DIY Prototype 3D CAD
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </button>
              )}
              <button
                onClick={onLaunch}
                className="group inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300"
              >
                Open Toolpath Studio
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </button>
              {onOpenOptimizer && (
                <button
                  onClick={onOpenOptimizer}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                >
                  Real-Time Path Optimizer
                </button>
              )}
              {onOpenCalibration && (
                <button
                  onClick={onOpenCalibration}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                >
                  Layer Calibration &amp; Arduino Firmware
                </button>
              )}
            </div>
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-sm">
            <GalvoDiagram />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-400/25 bg-gradient-to-r from-amber-500/[0.07] via-slate-900/80 to-cyan-500/[0.07] p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-300">
              <Cpu className="h-4 w-4" /> New: Low-Cost 4-Axis Prototype Validation Architecture ($65 Total BOM)
            </div>
            <h3 className="text-lg font-bold text-white">
              Motorized Linear Laser Focus Stage (Δz) + Orthogonal Stepper Mirrors + Descending Z-Bed (-Z)
            </h3>
            <p className="max-w-3xl text-sm text-slate-300">
              Validate core galvo motion mechanics, dynamic flat-field focus compensation{" "}
              <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs text-amber-300">
                Δz = √(L₀² + x² + y²) - L₀
              </code>{" "}
              without an expensive F-theta lens, descending Z-platform layer stepping, and Arduino Uno CNC Shield V3
              firmware before investing $3,870 in industrial hardware.
            </p>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="text-[11px] text-slate-400">Laser Focus Axis</div>
              <div className="mt-0.5 font-mono text-sm font-bold text-amber-300">A-Axis (D12/D13)</div>
              <div className="text-[10px] text-slate-500">Linear Δz carriage</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="text-[11px] text-slate-400">Build Platform</div>
              <div className="mt-0.5 font-mono text-sm font-bold text-emerald-300">Z-Axis (D4/D7)</div>
              <div className="text-[10px] text-slate-500">Descending -Z bed</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="text-[11px] text-slate-400">2-Opt Optimizer</div>
              <div className="mt-0.5 font-mono text-sm font-bold text-cyan-300">-58% Air Jumps</div>
              <div className="text-[10px] text-slate-500">+ Corner Skywriting</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="text-[11px] text-slate-400">Prototype Cost</div>
              <div className="mt-0.5 font-mono text-sm font-bold text-white">$65.00 USD</div>
              <div className="text-[10px] text-emerald-400">-98.3% vs Industrial</div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-4 text-lg font-semibold text-white">Hardware anatomy</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COMPONENTS.map((c) => (
            <div key={c.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-cyan-400/30 hover:bg-white/[0.05]">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300">
                <c.icon className="h-5 w-5" />
              </div>
              <h4 className="mb-1.5 text-sm font-semibold text-white">{c.title}</h4>
              <p className="text-sm leading-relaxed text-slate-400">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-4 text-lg font-semibold text-white">Software pipeline</h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PIPELINE.map((p) => (
            <div key={p.step} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-indigo-500 text-sm font-bold text-slate-900">
                {p.step}
              </div>
              <div>
                <h4 className="mb-1 text-sm font-semibold text-white">{p.title}</h4>
                <p className="text-sm leading-relaxed text-slate-400">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-5">
          <div className="mb-3 flex items-center gap-2 text-emerald-300">
            <Lightbulb className="h-4.5 w-4.5" />
            <h4 className="text-sm font-semibold">Why galvo over DLP/MSLA</h4>
          </div>
          <ul className="space-y-2 text-sm leading-relaxed text-slate-300">
            {PROS_CONS.pros.map((p) => (
              <li key={p} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-5">
          <div className="mb-3 flex items-center gap-2 text-amber-300">
            <AlertTriangle className="h-4.5 w-4.5" />
            <h4 className="text-sm font-semibold">Trade-offs to plan for</h4>
          </div>
          <ul className="space-y-2 text-sm leading-relaxed text-slate-300">
            {PROS_CONS.cons.map((p) => (
              <li key={p} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <div className="mb-3 flex items-center gap-2 text-cyan-300">
          <Activity className="h-4.5 w-4.5" />
          <h4 className="text-sm font-semibold text-white">What this app gives you</h4>
        </div>
        <p className="text-sm leading-relaxed text-slate-400">
          <strong className="text-slate-200">Toolpath Studio</strong> lets you place vector shapes per layer, tune
          hatch fill &amp; contour passes, and watch an animated simulation of exactly how the galvo mirrors would
          scan each layer. <strong className="text-slate-200">Calibration</strong> generates a dot-grid test pattern
          and lets you dial in pincushion/barrel correction before you ever burn resin.{" "}
          <strong className="text-slate-200">Export / Control</strong> turns the current layer into a
          controller-ready ASCII command stream (G-code-style motion with laser power/feed, the common interchange
          format for open-source XY2-100 galvo boards) that you can download, copy, or stream live to real hardware
          over a serial connection from the browser.
        </p>
      </section>
    </div>
  );
}

function GalvoDiagram() {
  return (
    <svg viewBox="0 0 320 320" className="h-full w-full">
      <defs>
        <radialGradient id="beamGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="160" cy="160" r="150" fill="none" stroke="#1e293b" strokeWidth="2" />
      <circle cx="160" cy="160" r="110" fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />
      {/* laser source */}
      <rect x="140" y="10" width="40" height="26" rx="4" fill="#0ea5e9" />
      <text x="160" y="27" textAnchor="middle" fontSize="9" fill="#06202b" fontWeight="700">
        LASER
      </text>
      <line x1="160" y1="36" x2="160" y2="95" stroke="#67e8f9" strokeWidth="2" />
      {/* X mirror */}
      <g transform="translate(160,100) rotate(20)">
        <rect x="-18" y="-3" width="36" height="6" rx="2" fill="#e2e8f0" />
      </g>
      <text x="190" y="104" fontSize="9" fill="#94a3b8">
        X mirror
      </text>
      <line x1="160" y1="100" x2="160" y2="150" stroke="#67e8f9" strokeWidth="2" strokeDasharray="2 3" />
      {/* Y mirror */}
      <g transform="translate(160,155) rotate(-20)">
        <rect x="-18" y="-3" width="36" height="6" rx="2" fill="#e2e8f0" />
      </g>
      <text x="100" y="150" fontSize="9" fill="#94a3b8" textAnchor="end">
        Y mirror
      </text>
      <line x1="160" y1="155" x2="210" y2="230" stroke="#67e8f9" strokeWidth="2" strokeDasharray="2 3" />
      {/* f-theta lens */}
      <ellipse cx="225" cy="245" rx="7" ry="18" fill="#818cf8" transform="rotate(35 225 245)" />
      <line x1="225" y1="245" x2="255" y2="290" stroke="#67e8f9" strokeWidth="2.5" />
      <circle cx="255" cy="290" r="14" fill="url(#beamGlow)" />
      <circle cx="255" cy="290" r="3" fill="#a5f3fc" />
      <text x="255" y="312" fontSize="9" fill="#94a3b8" textAnchor="middle">
        resin surface
      </text>
      <text x="225" y="228" fontSize="9" fill="#94a3b8" textAnchor="middle">
        F-theta lens
      </text>
    </svg>
  );
}
