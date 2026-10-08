import type { Layer, ProcessSettings, Toolpath } from "./types";

/** Produce a human-readable, galvo-controller-style command stream for one layer's toolpath.
 * This mirrors the ASCII command style used by many open-source galvo/laser controllers
 * (GRBL-derived "G1/G0" motion with S = laser power and F = feedrate), which is the most
 * common interchange format for DIY XY2-100 galvo boards that expose a serial command layer. */
export function toolpathToCommands(layer: Layer, toolpath: Toolpath, settings: ProcessSettings): string[] {
  const lines: string[] = [];
  lines.push(`; --- Layer ${layer.id} | Z=${layer.z.toFixed(3)}mm | layer height ${settings.layerHeightMicron}um ---`);
  lines.push(`M3 S0 ; laser armed, power off`);
  lines.push(`G4 P${(settings.laserOnDelayUs / 1000).toFixed(3)} ; laser warm-up delay`);

  let lastWasJump = true;
  for (const seg of toolpath.segments) {
    for (let i = 0; i < seg.points.length; i++) {
      const p = seg.points[i];
      if (i === 0) {
        if (seg.isJump) {
          lines.push(`G0 X${p.x.toFixed(4)} Y${p.y.toFixed(4)} F${settings.jumpSpeedMms}`);
          lastWasJump = true;
        }
        continue;
      }
      if (!seg.isJump && lastWasJump) {
        lines.push(`M3 S${settings.laserPowerPct.toFixed(1)} ; laser on`);
        lastWasJump = false;
      }
      if (seg.isJump) {
        lines.push(`G0 X${p.x.toFixed(4)} Y${p.y.toFixed(4)} F${settings.jumpSpeedMms}`);
      } else {
        lines.push(`G1 X${p.x.toFixed(4)} Y${p.y.toFixed(4)} F${settings.scanSpeedMms}`);
      }
    }
    if (!seg.isJump) {
      lines.push(`M5 ; laser off`);
      lines.push(`G4 P${(settings.jumpDelayUs / 1000).toFixed(3)} ; jump settle delay`);
      lastWasJump = true;
    }
  }

  lines.push(`M5 ; ensure laser off`);
  lines.push(`G4 P${(settings.markDelayUs / 1000).toFixed(3)} ; layer settle delay`);
  lines.push(`; Z-stage: lift / dip sequence for recoat happens on controller side`);
  return lines;
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
