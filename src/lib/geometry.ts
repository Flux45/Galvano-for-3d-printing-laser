import type { FieldSettings, HatchSettings, Point, Segment, Shape, Toolpath } from "./types";

const deg2rad = (d: number) => (d * Math.PI) / 180;

/** Convert a shape definition into a closed polygon (array of points, not repeating the first point). */
export function shapeToPolygon(shape: Shape): Point[] {
  const { cx, cy, size, rotation } = shape;
  const rot = deg2rad(rotation);
  const rotate = (x: number, y: number): Point => {
    const dx = x - cx;
    const dy = y - cy;
    return {
      x: cx + dx * Math.cos(rot) - dy * Math.sin(rot),
      y: cy + dx * Math.sin(rot) + dy * Math.cos(rot),
    };
  };

  if (shape.type === "circle") {
    const segs = 48;
    const pts: Point[] = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push(rotate(cx + Math.cos(a) * size, cy + Math.sin(a) * size));
    }
    return pts;
  }

  if (shape.type === "rect") {
    const pts = [
      { x: cx - size, y: cy - size },
      { x: cx + size, y: cy - size },
      { x: cx + size, y: cy + size },
      { x: cx - size, y: cy + size },
    ];
    return pts.map((p) => rotate(p.x, p.y));
  }

  if (shape.type === "polygon") {
    const sides = shape.sides ?? 5;
    const pts: Point[] = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
      pts.push(rotate(cx + Math.cos(a) * size, cy + Math.sin(a) * size));
    }
    return pts;
  }

  if (shape.type === "star") {
    const sides = shape.sides ?? 5;
    const pts: Point[] = [];
    const inner = size * 0.45;
    for (let i = 0; i < sides * 2; i++) {
      const a = (i / (sides * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? size : inner;
      pts.push(rotate(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
    return pts;
  }

  return [];
}

/** Scanline fill (even-odd rule) for an arbitrary closed polygon, at a given angle. */
function hatchPolygon(polygon: Point[], spacing: number, angleDeg: number): Point[][] {
  if (polygon.length < 3 || spacing <= 0) return [];
  const rad = deg2rad(angleDeg);
  const cos = Math.cos(-rad);
  const sin = Math.sin(-rad);

  // rotate polygon so hatch lines become horizontal scanlines
  const rotated = polygon.map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }));

  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of rotated) {
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const lines: Point[][] = [];
  const n = rotated.length;
  let y = Math.ceil(minY / spacing) * spacing;
  let flip = false;
  for (; y <= maxY; y += spacing) {
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = rotated[i];
      const b = rotated[(i + 1) % n];
      if (a.y === b.y) continue;
      if ((y >= a.y && y < b.y) || (y >= b.y && y < a.y)) {
        const t = (y - a.y) / (b.y - a.y);
        xs.push(a.x + t * (b.x - a.x));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const p1 = { x: xs[i], y };
      const p2 = { x: xs[i + 1], y };
      lines.push(flip ? [p2, p1] : [p1, p2]);
    }
    flip = !flip;
  }

  // rotate back
  const cosBack = Math.cos(rad);
  const sinBack = Math.sin(rad);
  return lines.map((seg) =>
    seg.map((p) => ({ x: p.x * cosBack - p.y * sinBack, y: p.x * sinBack + p.y * cosBack })),
  );
}

/** Generate the full vector toolpath (contours + hatch fill) for a set of shapes. */
export function generateToolpath(shapes: Shape[], hatch: HatchSettings, scanSpeedMms: number): Toolpath {
  const segments: Segment[] = [];
  let lastPoint: Point | null = null;

  const pushSegment = (points: Point[]) => {
    if (points.length < 2) return;
    if (lastPoint) {
      const d = dist(lastPoint, points[0]);
      if (d > 0.01) {
        segments.push({ points: [lastPoint, points[0]], isJump: true });
      }
    }
    segments.push({ points, isJump: false });
    lastPoint = points[points.length - 1];
  };

  for (const shape of shapes) {
    const polygon = shapeToPolygon(shape);
    if (polygon.length < 3) continue;

    for (let pass = 0; pass < Math.max(1, hatch.contourPasses); pass++) {
      pushSegment([...polygon, polygon[0]]);
    }

    if (hatch.enabled) {
      const lines = hatchPolygon(polygon, hatch.spacingMm, hatch.angleDeg);
      for (const line of lines) pushSegment(line);

      if (hatch.crossHatch) {
        const lines2 = hatchPolygon(polygon, hatch.spacingMm, hatch.angleDeg + 90);
        for (const line of lines2) pushSegment(line);
      }
    }
  }

  let totalLengthMm = 0;
  let jumpLengthMm = 0;
  for (const seg of segments) {
    for (let i = 0; i + 1 < seg.points.length; i++) {
      const d = dist(seg.points[i], seg.points[i + 1]);
      if (seg.isJump) jumpLengthMm += d;
      else totalLengthMm += d;
    }
  }

  const markTimeS = totalLengthMm / Math.max(1, scanSpeedMms);
  const jumpTimeS = jumpLengthMm / Math.max(1, scanSpeedMms * 4);

  return { segments, totalLengthMm, estimatedTimeS: markTimeS + jumpTimeS };
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Apply a simple radial pincushion/barrel distortion correction model, as used to pre-warp
 * vector data so that, after passing through imperfect F-theta optics, the result on the
 * build plane is geometrically accurate. */
export function applyFieldCorrection(p: Point, field: FieldSettings): Point {
  const half = field.fieldSizeMm / 2;
  const nx = p.x / half;
  const ny = p.y / half;
  const r2 = nx * nx + ny * ny;
  const k = field.pincushionK;
  const factor = 1 + k * r2;
  return { x: p.x * factor, y: p.y * factor };
}

export function correctToolpath(toolpath: Toolpath, field: FieldSettings): Toolpath {
  const segments = toolpath.segments.map((seg) => ({
    ...seg,
    points: seg.points.map((p) => applyFieldCorrection(p, field)),
  }));
  return { ...toolpath, segments };
}

export function polygonBounds(points: Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}
