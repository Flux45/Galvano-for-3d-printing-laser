import type { Point, Toolpath } from "./types";

/**
 * Lens-Free 3-Axis 3D Galvanometer Scanner Kinematics & Optical Ray Tracing
 *
 * Pre-Objective Dynamic Focusing Architecture (NO F-Theta Lens):
 * - Traditional 2D galvos place a heavy F-Theta lens AFTER the mirrors. That restricts
 *   the scan area to small fields (100-200mm) and causes thermal lensing at 10 kW.
 * - In this LENSLESS 3D system, there is NO F-Theta lens after the mirrors. The exit
 *   aperture is completely open / clear window with direct line-of-sight to the powder bed.
 * - Dynamic Focusing is achieved PRE-OBJECTIVE: the high-speed linear voice-coil actuator
 *   on the Fiber Input (Axis 3) dynamically moves the collimation/focusing optics along
 *   the optical axis BEFORE the mirrors.
 *
 * Kinematics of Lensless Scanning:
 * 1. Tangent Angle Mapping:
 *    Without F-Theta geometry (r = f * theta), the beam follows free-space trigonometry:
 *    x = (L - z) * tan(2 * theta_x)  =>  theta_x = 0.5 * atan(x / (L - z))
 *    y = (L - z + d) * tan(2 * theta_y) => theta_y = 0.5 * atan(y / (L - z + d))
 *    where L is the working distance from scan head to the bed (e.g. 600 mm).
 *
 * 2. Spherical Field Curvature Correction:
 *    The geometric distance to point (x, y, z) is R = sqrt(x^2 + y^2 + (L - z)^2).
 *    Because there is NO F-theta flat-field lens, the natural focus plane is a sphere.
 *    The Fiber-In linear stage eliminates this curvature by translating:
 *    delta_z_linear = -(R - L) / M_z^2
 *    This allows expanding the print area from 150mm up to 500mm, 800mm, or 1000mm!
 */

export interface Galvo3DAxisState {
  // Axis 1: X Rotary Servo
  thetaXDeg: number;            // Mechanical mirror X angle in degrees
  thetaXRad: number;            // Mechanical mirror X angle in radians
  opticalAngleXDeg: number;     // Optical beam deflection X (2 * theta_x)

  // Axis 2: Y Rotary Servo
  thetaYDeg: number;            // Mechanical mirror Y angle in degrees
  thetaYRad: number;            // Mechanical mirror Y angle in radians
  opticalAngleYDeg: number;     // Optical beam deflection Y (2 * theta_y)

  // Axis 3: Fiber-In Dynamic Focus Linear Stage (Pre-Objective)
  zLinearMm: number;            // Axial linear shift of fiber collimator (mm)
  zLinearNormalized: number;    // -1.0 to +1.0 within stroke limit
  focalDistanceMm: number;      // True 3D optical distance R(x, y, z)
  focalDeltaMm: number;         // Spherical focus error R - L (mm)
  spotDiameterUm: number;       // Spot diameter with 3rd-axis dynamic focus engaged (µm)
  spotDiameterUncompensatedUm: number; // Defocused spot diameter if 3rd axis were absent (µm)
  depthOfFieldMm: number;       // Optical depth of focus (+/- 2*zR)
  isWithinStrokeLimits: boolean;// Whether within voice coil stroke limit

  workingDistanceMm: number;    // Nominal working distance L (mm)
  scanFieldSizeMm: number;      // Expanded build area diameter (mm)
  isLensless: boolean;          // True = No F-theta lens

  angularVelocityXDegS?: number;// Angular slew rate deg/s
  angularVelocityYDegS?: number;// Angular slew rate deg/s
  linearVelocityMmS?: number;   // Linear voice coil speed mm/s
}

// Backward-compatible alias
export type GalvoMirrorAngles = Galvo3DAxisState;

export interface GalvoRayPath {
  fiberInput: [number, number, number];   // Movable fiber collimator exit (Axis 3)
  mirrorX: [number, number, number];      // First mirror reflection point
  mirrorY: [number, number, number];      // Second mirror reflection point
  exitAperture: [number, number, number]; // Open exit collar (No F-Theta lens)
  bed: [number, number, number];          // Focused spot on powder bed
}

export class GalvoKinematics {
  public L: number; // Working distance from galvo head to powder bed (mm), default 600mm
  public d: number; // Distance between mirror X and mirror Y (mm), default 14mm
  public maxMirrorAngleDeg: number; // Rotary mechanical limit e.g. +/- 16 deg (+/- 32 deg optical)
  public maxLinearStrokeMm: number; // Voice-coil linear stroke e.g. +/- 18 mm
  public opticalMagnificationMz: number; // Longitudinal magnification factor M_z (e.g. 2.6)
  public nominalSpotDiameterUm: number; // Focused beam waist w0 (e.g. 60 µm)
  public wavelengthUm: number; // Laser wavelength (1.064 µm for fiber laser)
  public isLensless: boolean; // Lensless 3D scanning flag
  public scanFieldSizeMm: number; // Expanded printing area (e.g. 500mm)

  // Backward-compatible getter for f
  public get f(): number {
    return this.L;
  }

  constructor(
    workingDistanceMm = 600,
    scanFieldSizeMm = 500,
    mirrorSeparationMm = 14,
    maxMirrorAngleDeg = 16,
    maxLinearStrokeMm = 18,
    opticalMagnificationMz = 2.6,
    nominalSpotDiameterUm = 60,
    wavelengthUm = 1.064
  ) {
    this.L = workingDistanceMm;
    this.scanFieldSizeMm = scanFieldSizeMm;
    this.d = mirrorSeparationMm;
    this.maxMirrorAngleDeg = maxMirrorAngleDeg;
    this.maxLinearStrokeMm = maxLinearStrokeMm;
    this.opticalMagnificationMz = opticalMagnificationMz;
    this.nominalSpotDiameterUm = nominalSpotDiameterUm;
    this.wavelengthUm = wavelengthUm;
    this.isLensless = true; // Pure Lens-free 3D Scanner
  }

  /**
   * Convert target powder bed position (x, y, z) to 3-Axis state:
   * Axis 1: Mirror X angle (pure tangent geometry, no F-theta)
   * Axis 2: Mirror Y angle
   * Axis 3: Fiber-In linear pre-objective collimator position
   */
  public xyToMirrorAngles(x: number, y: number, z = 0): Galvo3DAxisState {
    const effectiveZ = Math.max(10, this.L - z);

    // 1. Lens-free Direct Trigonometric Deflection
    // Without F-theta distortion: x = (L - z) * tan(2*theta_x)
    const betaXRad = Math.atan2(x, effectiveZ);
    // Mirror Y is offset by inter-mirror separation d
    const betaYRad = Math.atan2(y, effectiveZ + this.d);

    const thetaXRad = betaXRad / 2;
    const thetaYRad = betaYRad / 2;

    const rad2deg = 180 / Math.PI;
    const thetaXDeg = thetaXRad * rad2deg;
    const thetaYDeg = thetaYRad * rad2deg;

    // 2. Axis 3: Spherical Field Curvature Correction (No F-Theta Lens)
    // Optical path from galvo mirrors to (x, y, z) on the flat bed
    const R = Math.sqrt(x * x + y * y + effectiveZ * effectiveZ);
    const deltaF = R - this.L; // Geometric defocus error without 3rd axis (mm)

    // Linear stage translation: delta_z_linear = -deltaF / (M_z^2)
    const mz2 = this.opticalMagnificationMz * this.opticalMagnificationMz;
    let zLinearMm = -(deltaF / mz2);

    const isWithinStrokeLimits = Math.abs(zLinearMm) <= this.maxLinearStrokeMm;
    zLinearMm = Math.max(-this.maxLinearStrokeMm, Math.min(this.maxLinearStrokeMm, zLinearMm));
    const zLinearNormalized = Number((zLinearMm / this.maxLinearStrokeMm).toFixed(3));

    // 3. Beam Waist & Rayleigh Range Optics
    const w0_mm = (this.nominalSpotDiameterUm / 2) / 1000;
    const lambda_mm = this.wavelengthUm / 1000;
    const rayleighMm = (Math.PI * w0_mm * w0_mm) / lambda_mm;
    const depthOfFieldMm = Number((2 * rayleighMm).toFixed(2));

    // Without 3rd-axis dynamic focus on a large 500mm lensless bed, the spot explodes:
    const blurRatio = Math.sqrt(1 + Math.pow(deltaF / Math.max(0.1, rayleighMm), 2));
    const spotDiameterUncompensatedUm = Math.round(this.nominalSpotDiameterUm * blurRatio);

    return {
      thetaXDeg: Number(thetaXDeg.toFixed(3)),
      thetaYDeg: Number(thetaYDeg.toFixed(3)),
      thetaXRad,
      thetaYRad,
      opticalAngleXDeg: Number((betaXRad * rad2deg).toFixed(3)),
      opticalAngleYDeg: Number((betaYRad * rad2deg).toFixed(3)),

      zLinearMm: Number(zLinearMm.toFixed(3)),
      zLinearNormalized,
      focalDistanceMm: Number(R.toFixed(2)),
      focalDeltaMm: Number(deltaF.toFixed(2)),
      spotDiameterUm: this.nominalSpotDiameterUm, // Maintained at 60 µm by the 3rd axis!
      spotDiameterUncompensatedUm,
      depthOfFieldMm,
      isWithinStrokeLimits,

      workingDistanceMm: this.L,
      scanFieldSizeMm: this.scanFieldSizeMm,
      isLensless: true,
    };
  }

  /**
   * Compute 3D ray trace points through the lens-free optical scan head down to the build plate
   */
  public computeRayPath(
    x: number,
    y: number,
    bedZ: number,
    headZ: number,
    zLinearMm = 0
  ): GalvoRayPath {
    const mirrorX_Z = headZ + 18;
    const mirrorY_Z = headZ + 7;
    const apertureZ = headZ; // Open exit aperture (NO LENS)

    // Linear fiber-in collimator shifts along -X axis
    const fiberX = -26 + zLinearMm * 0.8;

    return {
      fiberInput: [fiberX, 0, mirrorX_Z],
      mirrorX: [0, 0, mirrorX_Z],
      mirrorY: [0, 0, mirrorY_Z],
      exitAperture: [x * 0.05, y * 0.05, apertureZ], // Free beam transit through open collar
      bed: [x, y, bedZ],
    };
  }
}

// Default instance: L = 600mm working distance, 500mm expanded build area, lensless
export const defaultGalvoKinematics = new GalvoKinematics(600, 500, 14, 16, 18, 2.6, 60, 1.064);

/**
 * Calculates the instantaneous (x, y) coordinates and laser ON/OFF state along a toolpath at a given progress (0..1)
 */
export function getActiveLaserSpot(
  toolpath?: Toolpath,
  progress?: number | null
): { point: Point; isLaserOn: boolean } {
  if (!toolpath || progress === null || progress === undefined || toolpath.segments.length === 0) {
    return { point: { x: 0, y: 0 }, isLaserOn: false };
  }
  const total = toolpath.totalLengthMm;
  const limit = Math.max(0, Math.min(1, progress)) * total;
  let acc = 0;
  let lastPt: Point = { x: 0, y: 0 };
  let isLaserOn = false;

  for (const seg of toolpath.segments) {
    const pts = seg.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (acc + segLen < limit) {
        acc += segLen;
        lastPt = b;
        continue;
      }
      const t = segLen > 0 ? Math.max(0, Math.min(1, (limit - acc) / segLen)) : 0;
      lastPt = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      isLaserOn = !seg.isJump;
      return { point: lastPt, isLaserOn };
    }
  }
  return { point: lastPt, isLaserOn };
}
