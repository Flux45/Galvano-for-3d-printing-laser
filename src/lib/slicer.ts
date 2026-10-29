import type { MeshGeometry, Point } from "./types";

export interface SlicedLayer {
  layerIndex: number;
  z: number;
  contours: Point[][];
}

/**
 * Slice a 3D triangle mesh with horizontal planes at interval layerHeightMm.
 * Returns an array of SlicedLayer objects containing 2D contours for each layer.
 */
export function sliceMesh(
  mesh: MeshGeometry,
  layerHeightMm: number,
  onProgress?: (pct: number) => void
): SlicedLayer[] {
  const { positions, indices, bounds } = mesh;
  const numTriangles = indices.length / 3;

  const minZ = bounds.minZ;
  const maxZ = bounds.maxZ;
  const totalHeight = maxZ - minZ;

  if (totalHeight <= 0 || layerHeightMm <= 0) {
    return [];
  }

  const rawNumLayers = Math.max(1, Math.ceil(totalHeight / layerHeightMm));
  // Keep simulation layer count within a responsive 30-120 range to prevent main-thread freezing
  const effectiveLayerHeight = rawNumLayers > 120 ? totalHeight / 90 : layerHeightMm;
  const numLayers = Math.max(1, Math.ceil(totalHeight / effectiveLayerHeight));

  // Pre-allocate segment arrays per layer
  const layerSegments: [Point, Point][][] = Array.from({ length: numLayers }, () => []);

  // Tiny offset to prevent slicing exactly through coplanar triangle vertices
  const eps = 1e-5;

  // Process all triangles
  for (let t = 0; t < numTriangles; t++) {
    const i0 = indices[t * 3] * 3;
    const i1 = indices[t * 3 + 1] * 3;
    const i2 = indices[t * 3 + 2] * 3;

    const x0 = positions[i0], y0 = positions[i0 + 1], z0 = positions[i0 + 2];
    const x1 = positions[i1], y1 = positions[i1 + 1], z1 = positions[i1 + 2];
    const x2 = positions[i2], y2 = positions[i2 + 1], z2 = positions[i2 + 2];

    const triMinZ = Math.min(z0, z1, z2);
    const triMaxZ = Math.max(z0, z1, z2);

    const startLayer = Math.max(0, Math.floor((triMinZ - minZ) / effectiveLayerHeight));
    const endLayer = Math.min(numLayers - 1, Math.ceil((triMaxZ - minZ) / effectiveLayerHeight));

    for (let l = startLayer; l <= endLayer; l++) {
      const planeZ = minZ + (l + 0.5) * effectiveLayerHeight + eps;

      if (planeZ < triMinZ || planeZ > triMaxZ) continue;

      const pts: Point[] = [];

      // Intersect edges: 0-1, 1-2, 2-0
      intersectEdge(x0, y0, z0, x1, y1, z1, planeZ, pts);
      intersectEdge(x1, y1, z1, x2, y2, z2, planeZ, pts);
      intersectEdge(x2, y2, z2, x0, y0, z0, planeZ, pts);

      if (pts.length >= 2) {
        // Only take distinct points
        const p1 = pts[0];
        const p2 = pts[1];
        if (Math.hypot(p1.x - p2.x, p1.y - p2.y) > 1e-4) {
          layerSegments[l].push([p1, p2]);
        }
      }
    }
  }

  const slicedLayers: SlicedLayer[] = [];

  for (let l = 0; l < numLayers; l++) {
    const z = Number((minZ + (l + 0.5) * effectiveLayerHeight).toFixed(4));
    const segs = layerSegments[l];
    const contours = assembleSegmentsToContours(segs);

    if (contours.length > 0) {
      slicedLayers.push({
        layerIndex: l,
        z,
        contours,
      });
    }

    if (onProgress && l % 10 === 0) {
      onProgress(Math.round(((l + 1) / numLayers) * 100));
    }
  }

  if (onProgress) onProgress(100);
  return slicedLayers;
}

function intersectEdge(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  planeZ: number,
  out: Point[]
) {
  if ((z1 < planeZ && z2 >= planeZ) || (z2 < planeZ && z1 >= planeZ)) {
    const denom = z2 - z1;
    if (Math.abs(denom) < 1e-9) return;
    const t = (planeZ - z1) / denom;
    out.push({
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1),
    });
  }
}

/**
 * Assembles a collection of 2D line segments into closed/clean polygon contours.
 */
function assembleSegmentsToContours(segments: [Point, Point][]): Point[][] {
  if (segments.length === 0) return [];

  const precision = 100; // Quantize to ~0.01mm for robust vertex matching
  const keyOf = (p: Point) => `${Math.round(p.x * precision)},${Math.round(p.y * precision)}`;

  // Build adjacency list
  interface Node {
    point: Point;
    neighbors: { nextPt: Point; edgeIdx: number }[];
  }

  const nodes = new Map<string, Node>();
  const edgeUsed = new Uint8Array(segments.length);

  for (let i = 0; i < segments.length; i++) {
    const [p1, p2] = segments[i];
    const k1 = keyOf(p1);
    const k2 = keyOf(p2);

    if (!nodes.has(k1)) nodes.set(k1, { point: p1, neighbors: [] });
    if (!nodes.has(k2)) nodes.set(k2, { point: p2, neighbors: [] });

    nodes.get(k1)!.neighbors.push({ nextPt: p2, edgeIdx: i });
    nodes.get(k2)!.neighbors.push({ nextPt: p1, edgeIdx: i });
  }

  const contours: Point[][] = [];

  for (let i = 0; i < segments.length; i++) {
    if (edgeUsed[i]) continue;

    const startPt = segments[i][0];
    const poly: Point[] = [startPt, segments[i][1]];
    edgeUsed[i] = 1;

    let currentPt = segments[i][1];
    let closed = false;

    // Follow edges with a safety iteration limit to prevent any possible infinite loop
    let steps = 0;
    const maxSteps = segments.length * 2;
    while (!closed && steps++ < maxSteps) {
      const k = keyOf(currentPt);
      const node = nodes.get(k);
      if (!node) break;

      let foundNext = false;
      for (const n of node.neighbors) {
        if (!edgeUsed[n.edgeIdx]) {
          edgeUsed[n.edgeIdx] = 1;
          poly.push(n.nextPt);
          currentPt = n.nextPt;
          foundNext = true;

          // Check if closed
          if (Math.hypot(currentPt.x - startPt.x, currentPt.y - startPt.y) < 0.05) {
            closed = true;
          }
          break;
        }
      }

      if (!foundNext) break;
    }

    if (poly.length >= 3) {
      contours.push(poly);
    }
  }

  return contours;
}
