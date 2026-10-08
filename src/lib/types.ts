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
}

export interface Layer {
  id: string;
  z: number;
  shapes: Shape[];
}

export interface Segment {
  points: Point[];
  isJump: boolean;
}

export interface Toolpath {
  segments: Segment[];
  totalLengthMm: number;
  estimatedTimeS: number;
}

export interface FieldSettings {
  fieldSizeMm: number;
  spotSizeMicron: number;
  pincushionK: number; // distortion coefficient
}
