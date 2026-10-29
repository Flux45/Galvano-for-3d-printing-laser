export interface Point {
  x: number;
  y: number;
}

export type ShapeType = "circle" | "rect" | "polygon" | "star";

export interface Shape {
  id: string;
  type: ShapeType;
  cx: number;
  cy: number;
  size: number; // radius or half-width
  rotation: number; // degrees
  sides?: number; // for polygon/star
}

export interface HatchSettings {
  enabled: boolean;
  spacingMm: number;
  angleDeg: number;
  crossHatch: boolean;
  contourPasses: number;
  rotationPerLayerDeg?: number; // e.g. 67° for SLM/LPBF metal printing
}

export interface ProcessSettings {
  laserPowerPct: number;
  scanSpeedMms: number;
  jumpSpeedMms: number;
  jumpDelayUs: number;
  markDelayUs: number;
  laserOnDelayUs: number;
  skywriting: boolean;
  layerHeightMicron: number;
  laserPowerWatts?: number; // Physical laser power e.g. 10000 W (10 kW)
}

export interface Layer {
  id: string;
  z: number;
  shapes: Shape[];
  contours?: Point[][]; // Sliced 2D perimeter contours
  toolpath?: Toolpath;
}

export interface Segment {
  points: Point[];
  isJump: boolean;
}

export interface Toolpath {
  segments: Segment[];
  totalLengthMm: number;
  estimatedTimeS: number;
  jumpLengthMm?: number;
  energyDensityJmm?: number; // Linear energy density P/v (J/mm)
}

export interface FieldSettings {
  fieldSizeMm: number;
  spotSizeMicron: number;
  pincushionK: number; // distortion coefficient
}

export interface MeshBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
}

export interface MeshGeometry {
  positions: Float32Array;
  indices: Uint32Array;
  bounds: MeshBounds;
  filename: string;
  triangleCount: number;
}
