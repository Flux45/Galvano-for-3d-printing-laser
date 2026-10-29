import type { HatchSettings, Point, ProcessSettings, Segment, Toolpath } from "./types";

const deg2rad = (d: number) => (d * Math.PI) / 180;

/**
 * Scanline hatch filling for multiple closed polygons on a single layer,
 * utilizing the even-odd rule to naturally support nested holes and islands.
 */
export function hatchPolygons(
  polygons: Point[][],
  spacingMm: number,
  angleDeg: number
): Point[][] {
  if (polygons.length === 0 || spacingMm <= 0) return [];

  const rad = deg2rad(angleDeg);
  const cos = Math.cos(-rad);
  const sin = Math.sin(-rad);

  // Rotate all polygons
  const rotatedPolys = polygons.map((poly) =>
    poly.map((p) => ({
      x: p.x * cos - p.y * sin,
      y: p.x * sin + p.y * cos,
    }))
  );

  let minY = Infinity;
  let maxY = -Infinity;

  for (const poly of rotatedPolys) {
    for (const p of poly) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }

  if (minY === Infinity || maxY === -Infinity) return [];

  const lines: Point[][] = [];
  let y = Math.ceil(minY / spacingMm) * spacingMm;
  let flip = false;

  for (; y <= maxY; y += spacingMm) {
    const xs: number[] = [];

    for (const poly of rotatedPolys) {
      const n = poly.length;
      for (let i = 0; i < n; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % n];
        if (a.y === b.y) continue;
        if ((y >= a.y && y < b.y) || (y >= b.y && y < a.y)) {
          const t = (y - a.y) / (b.y - a.y);
          xs.push(a.x + t * (b.x - a.x));
        }
      }
    }

    xs.sort((a, b) => a - b);

    // Pair intersections using even-odd rule
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x1 = xs[i];
      const x2 = xs[i + 1];
      // Skip tiny degenerate segments
      if (Math.abs(x2 - x1) < 1e-4) continue;

      const p1 = { x: x1, y };
      const p2 = { x: x2, y };
      // Bidirectional scanning
      lines.push(flip ? [p2, p1] : [p1, p2]);
    }

    flip = !flip;
  }

  // Rotate back to original coordinate system
  const cosBack = Math.cos(rad);
  const sinBack = Math.sin(rad);

  return lines.map((seg) =>
    seg.map((p) => ({
      x: p.x * cosBack - p.y * sinBack,
      y: p.x * sinBack + p.y * cosBack,
    }))
  );
}

/**
 * Plans complete galvo scan paths for a sliced layer:
 * - Perimeter contour scan(s)
 * - Direction-rotated hatch vectors (default 67° increment per layer)
 * - Galvo jump vectors with laser OFF
 * - Energy density & timing metrics
 */
export function planLayerToolpath(
  layerIndex: number,
  contours: Point[][],
  hatch: HatchSettings,
  process: ProcessSettings
): Toolpath {
  const segments: Segment[] = [];
  let lastPoint: Point | null = null;

  const pushSegment = (points: Point[]) => {
    if (points.length < 2) return;
    if (lastPoint) {
      const d = Math.hypot(lastPoint.x - points[0].x, lastPoint.y - points[0].y);
      if (d > 0.01) {
        segments.push({ points: [lastPoint, points[0]], isJump: true });
      }
    }
    segments.push({ points, isJump: false });
    lastPoint = points[points.length - 1];
  };

  // 1. Contour passes (boundary border)
  const passes = Math.max(0, hatch.contourPasses);
  for (let pass = 0; pass < passes; pass++) {
    for (const poly of contours) {
      if (poly.length < 3) continue;
      // Close the loop
      pushSegment([...poly, poly[0]]);
    }
  }

  // 2. Hatch fill with layer rotation
  if (hatch.enabled && contours.length > 0) {
    const rotStep = hatch.rotationPerLayerDeg ?? 67; // 67° standard SLM rotation
    const layerAngle = (hatch.angleDeg + layerIndex * rotStep) % 360;

    const hatchLines = hatchPolygons(contours, hatch.spacingMm, layerAngle);
    for (const line of hatchLines) {
      pushSegment(line);
    }

    if (hatch.crossHatch) {
      const crossLines = hatchPolygons(contours, hatch.spacingMm, (layerAngle + 90) % 360);
      for (const line of crossLines) {
        pushSegment(line);
      }
    }
  }

  // Calculate length and time metrics
  let totalLengthMm = 0;
  let jumpLengthMm = 0;

  for (const seg of segments) {
    for (let i = 0; i + 1 < seg.points.length; i++) {
      const d = Math.hypot(
        seg.points[i].x - seg.points[i + 1].x,
        seg.points[i].y - seg.points[i + 1].y
      );
      if (seg.isJump) jumpLengthMm += d;
      else totalLengthMm += d;
    }
  }

  const markSpeed = Math.max(1, process.scanSpeedMms);
  const jumpSpeed = Math.max(1, process.jumpSpeedMms);

  const markTimeS = totalLengthMm / markSpeed;
  const jumpTimeS = jumpLengthMm / jumpSpeed;
  const delaysTimeS =
    (segments.length * (process.jumpDelayUs + process.markDelayUs + process.laserOnDelayUs)) /
    1_000_000;

  const estimatedTimeS = markTimeS + jumpTimeS + delaysTimeS;

  // Energy metrics for Metal 3D Laser Printing:
  // Linear energy density: E_L = P / v [J/mm]
  const powerWatts = process.laserPowerWatts ?? 10000; // default 10 kW (10,000 W)
  const energyDensityJmm = Number((powerWatts / markSpeed).toFixed(3));

  return {
    segments,
    totalLengthMm,
    jumpLengthMm,
    estimatedTimeS,
    energyDensityJmm,
  };
}

/**
 * Lightweight metric estimation based on contour perimeters and cross-sectional areas.
 * Computes estimated toolpath length and scan time in <0.01ms without generating segments.
 */
export function estimateLayerMetrics(
  contours: Point[][],
  hatch: HatchSettings,
  process: ProcessSettings
): { totalLengthMm: number; estimatedTimeS: number } {
  let perimeter = 0;
  let totalArea = 0;

  for (const poly of contours) {
    if (poly.length < 3) continue;
    let p = 0;
    let a = 0;
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % n];
      p += Math.hypot(p2.x - p1.x, p2.y - p1.y);
      a += p1.x * p2.y - p2.x * p1.y;
    }
    perimeter += p;
    totalArea += Math.abs(a) * 0.5;
  }

  const contourPasses = hatch.contourPasses ?? 1;
  const contourLength = perimeter * contourPasses;

  let hatchLength = 0;
  if (hatch.enabled && hatch.spacingMm > 0) {
    hatchLength = totalArea / hatch.spacingMm;
    if (hatch.crossHatch) hatchLength *= 2;
  }

  const totalLengthMm = contourLength + hatchLength;
  const estimatedTimeS = totalLengthMm / Math.max(1, process.scanSpeedMms);

  return { totalLengthMm, estimatedTimeS };
}
