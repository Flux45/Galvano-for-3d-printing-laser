import type { Layer, ProcessSettings, Toolpath } from "./types";
import { defaultGalvoKinematics } from "./galvoKinematics";

/**
 * Produce a 3-axis galvo controller command stream with dynamic linear fiber focus (X, Y, Z):
 * - X: Galvo Mirror X position (mm)
 * - Y: Galvo Mirror Y position (mm)
 * - Z: Linear Fiber-In translation stage position (mm) for dynamic focus & field curvature elimination
 * - F: Feedrate / scan speed (mm/s)
 * - S: Laser power percentage
 */
export function toolpathToCommands(layer: Layer, toolpath: Toolpath, settings: ProcessSettings): string[] {
  const lines: string[] = [];
  lines.push(`; --- 3-Axis Galvano Print: Layer ${layer.id} | Z_bed=${layer.z.toFixed(3)}mm | Height ${settings.layerHeightMicron}um ---`);
  lines.push(`; Kinematics: X=Galvo-X, Y=Galvo-Y, Z=Linear-Fiber-Focus (Dynamic VCM)`);
  lines.push(`M3 S0 ; laser armed, power off`);
  lines.push(`G4 P${(settings.laserOnDelayUs / 1000).toFixed(3)} ; laser warm-up delay`);

  let lastWasJump = true;
  for (const seg of toolpath.segments) {
    for (let i = 0; i < seg.points.length; i++) {
      const p = seg.points[i];
      const axisState = defaultGalvoKinematics.xyToMirrorAngles(p.x, p.y, layer.z);
      const zFocus = axisState.zLinearMm.toFixed(4);

      if (i === 0) {
        if (seg.isJump) {
          lines.push(`G0 X${p.x.toFixed(4)} Y${p.y.toFixed(4)} Z${zFocus} F${settings.jumpSpeedMms}`);
          lastWasJump = true;
        }
        continue;
      }
      if (!seg.isJump && lastWasJump) {
        lines.push(`M3 S${settings.laserPowerPct.toFixed(1)} ; laser on`);
        lastWasJump = false;
      }
      if (seg.isJump) {
        lines.push(`G0 X${p.x.toFixed(4)} Y${p.y.toFixed(4)} Z${zFocus} F${settings.jumpSpeedMms}`);
      } else {
        lines.push(`G1 X${p.x.toFixed(4)} Y${p.y.toFixed(4)} Z${zFocus} F${settings.scanSpeedMms}`);
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
  lines.push(`; Z-stage: powder recoat sweep executed by elevator controller`);
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
