import { useMemo, useState } from "react";
import { Cable, CheckCircle2, Clipboard, Download, FileCode2, Layers3, Plug, Unplug } from "lucide-react";
import { useGalvo } from "../context/GalvoContext";
import { correctToolpath } from "../lib/geometry";
import { downloadTextFile, toolpathToCommands } from "../lib/exportFormat";

export default function ExportPage() {
  const { layers, activeLayer, toolpath, field, process, allToolpaths } = useGalvo();
  const [scope, setScope] = useState<"layer" | "job">("layer");
  const [copied, setCopied] = useState(false);
  const [serialStatus, setSerialStatus] = useState<"idle" | "connecting" | "connected" | "sending" | "error" | "unsupported">(
    "idle",
  );
  const [serialLog, setSerialLog] = useState<string[]>([]);
  const portRef = useState<{ current: SerialPort | null }>(() => ({ current: null }))[0];

  const correctedActive = useMemo(() => correctToolpath(toolpath, field), [toolpath, field]);
  const activeCommands = useMemo(
    () => toolpathToCommands(activeLayer, correctedActive, process),
    [activeLayer, correctedActive, process],
  );

  const jobCommands = useMemo(() => {
    const lines: string[] = [`; GalvoForge job export — ${layers.length} layer(s)`];
    for (const l of layers) {
      const corrected = correctToolpath(allToolpaths[l.id], field);
      lines.push(...toolpathToCommands(l, corrected, process));
    }
    return lines;
  }, [layers, allToolpaths, field, process]);

  const commands = scope === "layer" ? activeCommands : jobCommands;
  const text = commands.join("\n");

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    downloadTextFile(scope === "layer" ? `layer-${activeLayer.id}.gcode` : "galvo-job.gcode", text);
  };

  const connectSerial = async () => {
    if (!("serial" in navigator) || !navigator.serial) {
      setSerialStatus("unsupported");
      return;
    }
    try {
      setSerialStatus("connecting");
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      portRef.current = port;
      setSerialStatus("connected");
      setSerialLog((log) => [...log, "Connected to serial device at 115200 baud."]);
    } catch (err) {
      setSerialStatus("error");
      setSerialLog((log) => [...log, `Connection failed: ${(err as Error).message}`]);
    }
  };

  const sendSerial = async () => {
    const port = portRef.current;
    if (!port?.writable) return;
    setSerialStatus("sending");
    const writer = port.writable.getWriter();
    const encoder = new TextEncoder();
    try {
      for (const line of commands) {
        await writer.write(encoder.encode(line + "\n"));
      }
      setSerialLog((log) => [...log, `Streamed ${commands.length} command lines to controller.`]);
      setSerialStatus("connected");
    } catch (err) {
      setSerialLog((log) => [...log, `Send failed: ${(err as Error).message}`]);
      setSerialStatus("error");
    } finally {
      writer.releaseLock();
    }
  };

  const disconnectSerial = async () => {
    try {
      await portRef.current?.close();
    } catch {
      /* ignore */
    }
    portRef.current = null;
    setSerialStatus("idle");
    setSerialLog((log) => [...log, "Disconnected."]);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold text-white">
          <FileCode2 className="h-5 w-5 text-cyan-300" /> Export &amp; controller streaming
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Vectors from the active layer (or the whole job) are run through the field-correction model from the{" "}
          <strong className="text-slate-300">Calibration</strong> tab and converted into an ASCII command stream:
          <code className="mx-1 rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-cyan-200">G0/G1</code> motion with{" "}
          <code className="mx-1 rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-cyan-200">F</code> feedrate and{" "}
          <code className="mx-1 rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-cyan-200">M3 S..</code> laser power
          — the common interchange format used by open-source XY2-100 galvo controller firmware (e.g. GRBL-derived
          laser/galvo boards). A real XY2-100 board would translate this into the digital mirror-position protocol;
          boards that already speak serial G-code can consume it directly.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full border border-white/10 bg-white/5 p-1 text-xs">
              <button
                onClick={() => setScope("layer")}
                className={`rounded-full px-3 py-1.5 font-medium ${scope === "layer" ? "bg-cyan-400 text-slate-900" : "text-slate-300"}`}
              >
                Active layer only
              </button>
              <button
                onClick={() => setScope("job")}
                className={`rounded-full px-3 py-1.5 font-medium ${scope === "job" ? "bg-cyan-400 text-slate-900" : "text-slate-300"}`}
              >
                Full job ({layers.length} layers)
              </button>
            </div>
            <button
              onClick={copy}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
            >
              {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Clipboard className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={download}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-cyan-300"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </button>
            <span className="ml-auto flex items-center gap-1 text-xs text-slate-500">
              <Layers3 className="h-3.5 w-3.5" /> {commands.length} lines
            </span>
          </div>

          <pre className="h-[440px] overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-[11px] leading-relaxed text-emerald-300">
            {text}
          </pre>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
              <Cable className="h-4 w-4 text-cyan-300" /> Stream to real hardware
            </h3>
            <p className="mb-3 text-xs leading-relaxed text-slate-400">
              If your galvo controller exposes a USB-serial port running G-code-style firmware, you can connect
              directly from this browser tab (Chrome/Edge) using the Web Serial API and stream the commands above.
            </p>
            <div className="flex gap-2">
              {serialStatus !== "connected" && serialStatus !== "sending" ? (
                <button
                  onClick={connectSerial}
                  className="flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-cyan-300"
                >
                  <Plug className="h-3.5 w-3.5" /> Connect
                </button>
              ) : (
                <>
                  <button
                    onClick={sendSerial}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-emerald-300"
                  >
                    Send job
                  </button>
                  <button
                    onClick={disconnectSerial}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
                  >
                    <Unplug className="h-3.5 w-3.5" /> Disconnect
                  </button>
                </>
              )}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Status:{" "}
              <span
                className={
                  serialStatus === "connected" || serialStatus === "sending"
                    ? "text-emerald-400"
                    : serialStatus === "error" || serialStatus === "unsupported"
                      ? "text-rose-400"
                      : "text-slate-400"
                }
              >
                {serialStatus === "unsupported" ? "Web Serial not supported in this browser" : serialStatus}
              </span>
            </p>
            {serialLog.length > 0 && (
              <div className="mt-2 max-h-28 space-y-1 overflow-y-auto rounded-lg bg-black/30 p-2 text-[10px] text-slate-400">
                {serialLog.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs text-slate-400">
            <h4 className="mb-2 text-sm font-semibold text-white">Current process snapshot</h4>
            <dl className="space-y-1.5">
              <Row label="Laser power" value={`${process.laserPowerPct}%`} />
              <Row label="Scan speed" value={`${process.scanSpeedMms} mm/s`} />
              <Row label="Jump speed" value={`${process.jumpSpeedMms} mm/s`} />
              <Row label="Layer height" value={`${process.layerHeightMicron} µm`} />
              <Row label="Field size" value={`${field.fieldSizeMm} mm`} />
              <Row label="Distortion k" value={field.pincushionK.toFixed(3)} />
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-1 last:border-0">
      <dt>{label}</dt>
      <dd className="font-medium text-slate-200">{value}</dd>
    </div>
  );
}
