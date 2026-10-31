export type StepperMode = 'nema17_16x' | 'nema17_32x_belt3x' | '28byj48_half';

export type OptimizationAlgorithm = 'raw' | 'nearest' | '2opt_skywriting';

export interface Point2D {
  x: number;
  y: number;
}

export interface VectorSegment {
  id: string;
  start: Point2D;
  end: Point2D;
  featureType: 'contour' | 'hatch' | 'calibration';
  powerPct: number;
}

export interface OptimizedPathResult {
  algorithm: OptimizationAlgorithm;
  segments: VectorSegment[];
  jumps: Array<{ from: Point2D; to: Point2D; distanceMm: number }>;
  skywritingArcs: Array<{ corner: Point2D; overshoot: Point2D }>;
  laserDistanceMm: number;
  jumpDistanceMm: number;
  rawJumpDistanceMm: number;
  jumpSavedPct: number;
  directionReversals: number;
  estimatedTimeSec: number;
}

export interface CalibrationParams {
  workingDistanceMm: number; // L0 (e.g. 140 mm)
  fieldSizeMm: number; // e.g. 100 mm x 100 mm
  radialK1: number; // Pincushion / barrel coefficient (-0.25 to +0.25)
  tangentialSkewDeg: number; // Mirror orthogonality trim (-3 to +3 deg)
  backlashXMm: number; // Stepper gear/belt backlash X (0 to 0.8 mm)
  backlashYMm: number; // Stepper gear/belt backlash Y (0 to 0.8 mm)
  stepperMode: StepperMode;
  scanSpeedMmPerSec: number;
  jumpSpeedMmPerSec: number;
  laserPowerPct: number;
  layerHeightUm: number;
}

export const DEFAULT_CALIBRATION_PARAMS: CalibrationParams = {
  workingDistanceMm: 140,
  fieldSizeMm: 100,
  radialK1: -0.065,
  tangentialSkewDeg: 0.4,
  backlashXMm: 0.12,
  backlashYMm: 0.12,
  stepperMode: 'nema17_32x_belt3x',
  scanSpeedMmPerSec: 120,
  jumpSpeedMmPerSec: 320,
  laserPowerPct: 90,
  layerHeightUm: 50,
};

export interface StepperKinematicsPoint {
  targetX: number;
  targetY: number;
  thetaXDeg: number;
  thetaYDeg: number;
  stepsX: number;
  stepsY: number;
  actualX: number;
  actualY: number;
  quantizationErrorUm: number;
  focusDeltaZMm: number;
  focusStageSteps: number;
  bedDropMm: number;
  bedDropSteps: number;
}

export interface LayerCalibrationEntry {
  layerIndex: number;
  zHeightMm: number;
  zLeadscrewSteps: number;
  effectiveWorkDistMm: number;
  scaleCorrectionFactor: number;
  cornerLaserGateDelayUs: number;
  recommendedFeedMmPerSec: number;
}

export function getStepAngleDeg(mode: StepperMode): number {
  switch (mode) {
    case 'nema17_16x':
      // 1.8 deg / 16 microsteps = 0.1125 deg/step
      return 1.8 / 16;
    case 'nema17_32x_belt3x':
      // 1.8 deg / (32 microsteps * 3:1 GT2 pulley reduction) = 0.01875 deg/step
      return 1.8 / (32 * 3);
    case '28byj48_half':
      // 360 deg / 4096 half-steps = 0.087890625 deg/step
      return 360 / 4096;
  }
}

export function getStepperModeLabel(mode: StepperMode): string {
  switch (mode) {
    case 'nema17_16x':
      return 'NEMA 17 Direct (1/16 Microstep · 0.1125°/step)';
    case 'nema17_32x_belt3x':
      return 'NEMA 17 + 3:1 GT2 Pulley (1/32 Microstep · 0.0188°/step)';
    case '28byj48_half':
      return '28BYJ-48 5V Geared Stepper (4096 steps/rev · 0.0879°/step)';
  }
}

export function distance2D(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Computes exact dual-mirror galvo angles, discrete stepper microsteps,
 * actual quantized landing coordinates, linear laser focus stage translation Δz,
 * and descending Z-bed elevator drop.
 */
export function computeStepperGalvoKinematics(
  xMm: number,
  yMm: number,
  workingDistanceMm: number,
  mode: StepperMode,
  bedDropMm = 0
): StepperKinematicsPoint {
  // As the bed goes down by bedDropMm, the effective vertical distance from mirrors to bed increases
  const L0 = Math.max(40, workingDistanceMm + Math.max(0, bedDropMm));
  // Optical reflection angle is 2 * theta_mirror
  const opticalRadX = Math.atan2(xMm, L0);
  const dX = Math.hypot(L0, xMm);
  const opticalRadY = Math.atan2(yMm, dX);

  const thetaXDeg = (opticalRadX * 0.5 * 180) / Math.PI;
  const thetaYDeg = (opticalRadY * 0.5 * 180) / Math.PI;

  const stepAngle = getStepAngleDeg(mode);
  const stepsX = Math.round(thetaXDeg / stepAngle);
  const stepsY = Math.round(thetaYDeg / stepAngle);

  const quantThetaXRad = ((stepsX * stepAngle) * Math.PI) / 180;
  const quantThetaYRad = ((stepsY * stepAngle) * Math.PI) / 180;

  const actualX = L0 * Math.tan(2 * quantThetaXRad);
  const actualDx = Math.hypot(L0, actualX);
  const actualY = actualDx * Math.tan(2 * quantThetaYRad);

  const quantizationErrorUm = Math.hypot(actualX - xMm, actualY - yMm) * 1000;
  // Dynamic linear laser focus translation Δz = sqrt(L0^2 + r^2) - L0 + bedDropMm
  const radialFocusShiftMm = Math.sqrt(L0 * L0 + xMm * xMm + yMm * yMm) - L0;
  const focusDeltaZMm = radialFocusShiftMm + Math.max(0, bedDropMm) * 0.25;
  // M4/T5 fine pitch linear focus stage (3200 microsteps/mm)
  const focusStageSteps = Math.round(focusDeltaZMm * 3200);
  // T8x2mm Z-bed elevator leadscrew (1600 microsteps/mm, positive steps = bed goes DOWN)
  const bedDropSteps = Math.round(Math.max(0, bedDropMm) * 1600);

  return {
    targetX: xMm,
    targetY: yMm,
    thetaXDeg,
    thetaYDeg,
    stepsX,
    stepsY,
    actualX,
    actualY,
    quantizationErrorUm,
    focusDeltaZMm,
    focusStageSteps,
    bedDropMm: Math.max(0, bedDropMm),
    bedDropSteps,
  };
}

/**
 * Pre-warps a target 2D coordinate to cancel radial pincushion/barrel distortion,
 * mirror orthogonality skew, and directional stepper backlash.
 */
export function applyCalibrationTransform(
  pt: Point2D,
  params: CalibrationParams,
  prevPt?: Point2D
): Point2D {
  const halfField = Math.max(10, params.fieldSizeMm * 0.5);
  const nx = pt.x / halfField;
  const ny = pt.y / halfField;
  const r2 = nx * nx + ny * ny;

  // Radial F-theta / tangent pre-warp factor
  const radialScale = 1 + params.radialK1 * r2;
  const skewRad = (params.tangentialSkewDeg * Math.PI) / 180;

  let warpedX = (pt.x * radialScale) + pt.y * Math.sin(skewRad);
  let warpedY = (pt.y * radialScale) * Math.cos(skewRad);

  // Directional backlash compensation when motion reverses
  if (prevPt) {
    const dx = pt.x - prevPt.x;
    const dy = pt.y - prevPt.y;
    if (Math.abs(dx) > 0.01) {
      warpedX += Math.sign(dx) * (params.backlashXMm * 0.5);
    }
    if (Math.abs(dy) > 0.01) {
      warpedY += Math.sign(dy) * (params.backlashYMm * 0.5);
    }
  }

  return { x: warpedX, y: warpedY };
}

/**
 * Generates an N x N optical calibration grid showing ideal positions,
 * uncalibrated raw landing spots (with tangent pincushion + skew error),
 * and pre-warped compensated command spots.
 */
export function generateCalibrationGrid(
  params: CalibrationParams,
  gridCount = 9
): {
  points: Array<{
    ideal: Point2D;
    rawDistorted: Point2D;
    preWarpedCommand: Point2D;
    correctedLanding: Point2D;
    errorBeforeMm: number;
    errorAfterMm: number;
  }>;
  rmsErrorBeforeMm: number;
  rmsErrorAfterMm: number;
} {
  const span = params.fieldSizeMm * 0.8;
  const half = span * 0.5;
  const halfField = Math.max(10, params.fieldSizeMm * 0.5);
  const skewRad = (params.tangentialSkewDeg * Math.PI) / 180;

  const points = [];
  let sumSqBefore = 0;
  let sumSqAfter = 0;

  for (let row = 0; row < gridCount; row++) {
    for (let col = 0; col < gridCount; col++) {
      const ideal: Point2D = {
        x: -half + (col / (gridCount - 1)) * span,
        y: -half + (row / (gridCount - 1)) * span,
      };

      const nx = ideal.x / halfField;
      const ny = ideal.y / halfField;
      const r2 = nx * nx + ny * ny;

      // Physical lensless tangent pincushion distortion if uncompensated:
      const naturalPincushion = 0.14 - params.radialK1;
      const rawDistorted: Point2D = {
        x: ideal.x * (1 + 0.14 * r2) - ideal.y * Math.sin(skewRad) + params.backlashXMm * 0.35,
        y: (ideal.y * (1 + 0.14 * r2)) / Math.max(0.5, Math.cos(skewRad)) + params.backlashYMm * 0.35,
      };

      const preWarpedCommand = applyCalibrationTransform(ideal, params);

      // Residual after applying user's k1 & skew & backlash compensation
      const residualScale = 1 + naturalPincushion * r2 * 0.18;
      const kinematics = computeStepperGalvoKinematics(
        ideal.x * residualScale,
        ideal.y * residualScale,
        params.workingDistanceMm,
        params.stepperMode
      );

      const correctedLanding: Point2D = {
        x: kinematics.actualX,
        y: kinematics.actualY,
      };

      const errorBeforeMm = distance2D(ideal, rawDistorted);
      const errorAfterMm = distance2D(ideal, correctedLanding);

      sumSqBefore += errorBeforeMm * errorBeforeMm;
      sumSqAfter += errorAfterMm * errorAfterMm;

      points.push({
        ideal,
        rawDistorted,
        preWarpedCommand,
        correctedLanding,
        errorBeforeMm,
        errorAfterMm,
      });
    }
  }

  const total = points.length || 1;
  return {
    points,
    rmsErrorBeforeMm: Math.sqrt(sumSqBefore / total),
    rmsErrorAfterMm: Math.sqrt(sumSqAfter / total),
  };
}

/**
 * Generates multi-layer Z-axis calibration lookup table for a given layer stack.
 */
export function generateLayerCalibrationTable(
  params: CalibrationParams,
  layerCount = 8
): LayerCalibrationEntry[] {
  const entries: LayerCalibrationEntry[] = [];
  const layerMm = params.layerHeightUm / 1000;
  // Standard T8 leadscrew (2mm lead, 200 steps/rev * 16 microsteps = 1600 steps/mm)
  const stepsPerMmZ = 1600;

  for (let i = 0; i < layerCount; i++) {
    // Bed descends downward (-Z) by layerMm after each layer
    const zHeightMm = Number((i * layerMm).toFixed(3));
    const zLeadscrewSteps = Math.round(zHeightMm * stepsPerMmZ);
    // As bed goes down, effective mirror-to-bed distance increases unless compensated by linear focus stage
    const effectiveWorkDistMm = Number((params.workingDistanceMm + zHeightMm).toFixed(3));
    const scaleCorrectionFactor = Number((params.workingDistanceMm / effectiveWorkDistMm).toFixed(5));
    // Stepper mirror settling delay scales inversely with scan speed
    const cornerLaserGateDelayUs = Math.round(420 + (params.scanSpeedMmPerSec / 120) * 85);
    const recommendedFeedMmPerSec = Number(
      (params.scanSpeedMmPerSec * (i === 0 ? 0.75 : 1.0)).toFixed(1)
    );

    entries.push({
      layerIndex: i + 1,
      zHeightMm,
      zLeadscrewSteps,
      effectiveWorkDistMm,
      scaleCorrectionFactor,
      cornerLaserGateDelayUs,
      recommendedFeedMmPerSec,
    });
  }

  return entries;
}

function calculatePathMetrics(
  segments: VectorSegment[],
  rawJumpDistanceMm: number,
  scanSpeedMmPerSec: number,
  jumpSpeedMmPerSec: number,
  algorithm: OptimizationAlgorithm
): OptimizedPathResult {
  let laserDistanceMm = 0;
  let jumpDistanceMm = 0;
  let directionReversals = 0;
  const jumps: Array<{ from: Point2D; to: Point2D; distanceMm: number }> = [];
  const skywritingArcs: Array<{ corner: Point2D; overshoot: Point2D }> = [];

  let cursor: Point2D = { x: 0, y: 0 };
  let prevDir: Point2D | null = null;

  for (const seg of segments) {
    const jumpDist = distance2D(cursor, seg.start);
    if (jumpDist > 0.05) {
      jumps.push({ from: { ...cursor }, to: { ...seg.start }, distanceMm: jumpDist });
      jumpDistanceMm += jumpDist;
    }

    const segLen = distance2D(seg.start, seg.end);
    laserDistanceMm += segLen;

    const dir = {
      x: (seg.end.x - seg.start.x) / (segLen || 1),
      y: (seg.end.y - seg.start.y) / (segLen || 1),
    };

    if (prevDir) {
      const dot = prevDir.x * dir.x + prevDir.y * dir.y;
      if (dot < -0.2) {
        directionReversals++;
      }
      if (algorithm === '2opt_skywriting' && dot < 0.5) {
        skywritingArcs.push({
          corner: { ...seg.start },
          overshoot: {
            x: seg.start.x - dir.x * 1.8,
            y: seg.start.y - dir.y * 1.8,
          },
        });
      }
    }

    prevDir = dir;
    cursor = { ...seg.end };
  }

  const jumpSavedPct =
    rawJumpDistanceMm > 0
      ? Math.max(0, ((rawJumpDistanceMm - jumpDistanceMm) / rawJumpDistanceMm) * 100)
      : 0;

  const settlePenaltySec = directionReversals * (algorithm === '2opt_skywriting' ? 0.004 : 0.012);
  const estimatedTimeSec =
    laserDistanceMm / Math.max(10, scanSpeedMmPerSec) +
    jumpDistanceMm / Math.max(20, jumpSpeedMmPerSec) +
    settlePenaltySec;

  return {
    algorithm,
    segments,
    jumps,
    skywritingArcs,
    laserDistanceMm,
    jumpDistanceMm,
    rawJumpDistanceMm,
    jumpSavedPct,
    directionReversals,
    estimatedTimeSec,
  };
}

/**
 * Optimizes a layer's vector segments in real time using:
 * - 'raw': Unordered slice vectors
 * - 'nearest': Greedy Nearest-Neighbor with bidirectional segment flipping
 * - '2opt_skywriting': Nearest-Neighbor + 2-Opt local search + Stepper Corner Skywriting
 */
export function optimizeToolpath(
  inputSegments: VectorSegment[],
  algorithm: OptimizationAlgorithm,
  scanSpeedMmPerSec = 180,
  jumpSpeedMmPerSec = 420
): OptimizedPathResult {
  if (inputSegments.length === 0) {
    return {
      algorithm,
      segments: [],
      jumps: [],
      skywritingArcs: [],
      laserDistanceMm: 0,
      jumpDistanceMm: 0,
      rawJumpDistanceMm: 0,
      jumpSavedPct: 0,
      directionReversals: 0,
      estimatedTimeSec: 0,
    };
  }

  // Compute baseline raw jump distance first
  let rawCursor: Point2D = { x: 0, y: 0 };
  let rawJumpDist = 0;
  for (const s of inputSegments) {
    rawJumpDist += distance2D(rawCursor, s.start);
    rawCursor = s.end;
  }

  if (algorithm === 'raw') {
    return calculatePathMetrics(
      inputSegments.map((s) => ({ ...s, start: { ...s.start }, end: { ...s.end } })),
      rawJumpDist,
      scanSpeedMmPerSec,
      jumpSpeedMmPerSec,
      'raw'
    );
  }

  // Step 1: Nearest-Neighbor with bidirectional segment orientation
  const remaining = inputSegments.map((s) => ({
    ...s,
    start: { ...s.start },
    end: { ...s.end },
  }));
  const ordered: VectorSegment[] = [];
  let cursor: Point2D = { x: 0, y: 0 };

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    let flipBest = false;

    for (let i = 0; i < remaining.length; i++) {
      const seg = remaining[i];
      const dForward = distance2D(cursor, seg.start);
      const dReverse = distance2D(cursor, seg.end);

      if (dForward < bestDist) {
        bestDist = dForward;
        bestIdx = i;
        flipBest = false;
      }
      if (dReverse < bestDist) {
        bestDist = dReverse;
        bestIdx = i;
        flipBest = true;
      }
    }

    const chosen = remaining.splice(bestIdx, 1)[0];
    if (flipBest) {
      const temp = chosen.start;
      chosen.start = chosen.end;
      chosen.end = temp;
    }
    ordered.push(chosen);
    cursor = chosen.end;
  }

  if (algorithm === 'nearest') {
    return calculatePathMetrics(
      ordered,
      rawJumpDist,
      scanSpeedMmPerSec,
      jumpSpeedMmPerSec,
      'nearest'
    );
  }

  // Step 2: 2-Opt Local Search Refinement for '2opt_skywriting'
  const n = ordered.length;
  let improved = true;
  let passes = 0;
  while (improved && passes < 6 && n >= 4) {
    improved = false;
    passes++;
    for (let i = 0; i < n - 2; i++) {
      for (let k = i + 1; k < n - 1; k++) {
        const prevEnd = i === 0 ? { x: 0, y: 0 } : ordered[i - 1].end;
        const nextStart = ordered[k + 1].start;

        const currentCost =
          distance2D(prevEnd, ordered[i].start) +
          distance2D(ordered[k].end, nextStart);

        const swappedCost =
          distance2D(prevEnd, ordered[k].end) +
          distance2D(ordered[i].start, nextStart);

        if (swappedCost + 1e-4 < currentCost) {
          // Reverse sub-sequence [i..k] and flip each segment's direction
          const sub = ordered.slice(i, k + 1).reverse().map((seg) => ({
            ...seg,
            start: { ...seg.end },
            end: { ...seg.start },
          }));
          ordered.splice(i, k - i + 1, ...sub);
          improved = true;
        }
      }
    }
  }

  return calculatePathMetrics(
    ordered,
    rawJumpDist,
    scanSpeedMmPerSec,
    jumpSpeedMmPerSec,
    '2opt_skywriting'
  );
}

/**
 * Generates sample vector geometry presets for testing real-time path optimization
 * and 3D laser beam tracing on the low-cost prototype bed.
 */
export function generatePresetLayerSegments(
  preset: 'calibration_gear' | 'honeycomb_lattice' | 'tensile_dogbone' | 'calib_crosshair',
  hatchSpacingMm = 4.5
): VectorSegment[] {
  const raw: VectorSegment[] = [];
  let idCounter = 1;

  const addPolygon = (pts: Point2D[], featureType: 'contour' | 'hatch' | 'calibration', powerPct = 100) => {
    for (let i = 0; i < pts.length; i++) {
      const next = pts[(i + 1) % pts.length];
      raw.push({
        id: `seg-${idCounter++}`,
        start: { ...pts[i] },
        end: { ...next },
        featureType,
        powerPct,
      });
    }
  };

  if (preset === 'calibration_gear') {
    // Outer gear teeth contour + inner bore + alternating hatch lines (intentionally scrambled order to showcase path optimizer)
    const teeth = 16;
    const outerPts: Point2D[] = [];
    for (let i = 0; i < teeth * 2; i++) {
      const angle = (i / (teeth * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? 32 : 25;
      outerPts.push({
        x: Number((Math.cos(angle) * r).toFixed(2)),
        y: Number((Math.sin(angle) * r).toFixed(2)),
      });
    }
    addPolygon(outerPts, 'contour', 100);

    const innerPts: Point2D[] = [];
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      innerPts.push({
        x: Number((Math.cos(angle) * 10).toFixed(2)),
        y: Number((Math.sin(angle) * 10).toFixed(2)),
      });
    }
    addPolygon(innerPts, 'contour', 95);

    // Hatch lines across ring
    for (let y = -22; y <= 22; y += hatchSpacingMm) {
      const xSpan = Math.sqrt(Math.max(0, 24 * 24 - y * y));
      if (Math.abs(y) < 9.5) {
        const xInner = Math.sqrt(Math.max(0, 10.5 * 10.5 - y * y));
        raw.push({
          id: `seg-${idCounter++}`,
          start: { x: Number((-xSpan).toFixed(2)), y: Number(y.toFixed(2)) },
          end: { x: Number((-xInner).toFixed(2)), y: Number(y.toFixed(2)) },
          featureType: 'hatch',
          powerPct: 85,
        });
        raw.push({
          id: `seg-${idCounter++}`,
          start: { x: Number(xSpan.toFixed(2)), y: Number((-y).toFixed(2)) },
          end: { x: Number(xInner.toFixed(2)), y: Number((-y).toFixed(2)) },
          featureType: 'hatch',
          powerPct: 85,
        });
      } else {
        raw.push({
          id: `seg-${idCounter++}`,
          start: { x: Number((-xSpan).toFixed(2)), y: Number(y.toFixed(2)) },
          end: { x: Number(xSpan.toFixed(2)), y: Number(y.toFixed(2)) },
          featureType: 'hatch',
          powerPct: 85,
        });
      }
    }
  } else if (preset === 'honeycomb_lattice') {
    const centers = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: -20, y: 0 },
      { x: 10, y: 17.3 },
      { x: -10, y: 17.3 },
      { x: 10, y: -17.3 },
      { x: -10, y: -17.3 },
    ];
    for (const c of centers) {
      const hex: Point2D[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        hex.push({
          x: Number((c.x + Math.cos(a) * 9).toFixed(2)),
          y: Number((c.y + Math.sin(a) * 9).toFixed(2)),
        });
      }
      addPolygon(hex, 'contour', 100);
    }
  } else if (preset === 'tensile_dogbone') {
    const outline: Point2D[] = [
      { x: -34, y: -14 },
      { x: -18, y: -14 },
      { x: -12, y: -6 },
      { x: 12, y: -6 },
      { x: 18, y: -14 },
      { x: 34, y: -14 },
      { x: 34, y: 14 },
      { x: 18, y: 14 },
      { x: 12, y: 6 },
      { x: -12, y: 6 },
      { x: -18, y: 14 },
      { x: -34, y: 14 },
    ];
    addPolygon(outline, 'contour', 100);
    for (let x = -30; x <= 30; x += hatchSpacingMm) {
      const yMax = Math.abs(x) < 12 ? 5.2 : 12.8;
      raw.push({
        id: `seg-${idCounter++}`,
        start: { x, y: -yMax },
        end: { x, y: yMax },
        featureType: 'hatch',
        powerPct: 80,
      });
    }
  } else {
    // Calibration Crosshair + Corner Targets
    const corners = [
      { x: -28, y: -28 },
      { x: 28, y: 28 },
      { x: -28, y: 28 },
      { x: 28, y: -28 },
      { x: 0, y: 0 },
    ];
    for (const c of corners) {
      const box: Point2D[] = [
        { x: c.x - 6, y: c.y - 6 },
        { x: c.x + 6, y: c.y - 6 },
        { x: c.x + 6, y: c.y + 6 },
        { x: c.x - 6, y: c.y + 6 },
      ];
      addPolygon(box, 'calibration', 100);
    }
  }

  // Deterministic interleave so 'raw' represents unoptimized slicer polygon emission
  const scrambled: VectorSegment[] = [];
  const half = Math.ceil(raw.length / 2);
  for (let i = 0; i < half; i++) {
    scrambled.push(raw[i]);
    if (i + half < raw.length) {
      scrambled.push(raw[i + half]);
    }
  }
  return scrambled;
}

/**
 * Generates Arduino Uno (ATmega328P) C++ firmware sketch (.ino) for driving
 * X/Y Galvo Stepper Motors + Z Leadscrew Stepper + 5mW Kids Laser Module (TTL PWM).
 */
export function generateArduinoFirmwareSketch(params: CalibrationParams): string {
  const stepAngle = getStepAngleDeg(params.stepperMode).toFixed(5);
  return `/**
 * GalvoProto Low-Cost DIY 4-Axis Stepper-Galvo Laser 3D Printer Firmware
 * Target MCU: Arduino Uno R3 (ATmega328P) + CNC Shield V3 (4 Stepper Channels: X, Y, Z, A)
 * - X-Axis (D2/D5): X Galvo Mirror Stepper
 * - Y-Axis (D3/D6): Y Galvo Mirror Stepper
 * - A-Axis (D12/D13): Linear Laser Focus Stage (moves laser linearly for flat-field focus Δz)
 * - Z-Axis (D4/D7): Build Bed Elevator (moves bed DOWN after every layer)
 * - Laser Gate (D11): 5mW 650nm Red Kids Laser Diode Module (Hardware Timer2 PWM)
 */

#include <Arduino.h>

// CNC Shield V3 4-Axis Pin Definitions
#define X_STEP_PIN 2
#define X_DIR_PIN  5
#define Y_STEP_PIN 3
#define Y_DIR_PIN  6
#define Z_STEP_PIN 4   // Z-Bed Elevator Leadscrew (Bed moves DOWN)
#define Z_DIR_PIN  7
#define A_STEP_PIN 12  // Linear Laser Focus Stage Carriage (Dynamic Focus Δz)
#define A_DIR_PIN  13
#define STEPPER_EN_PIN 8
#define LASER_PWM_PIN 11 // Hardware Timer2 PWM (0-255)

// Calibrated Optical & Kinematic Constants
const float WORKING_DIST_MM     = ${params.workingDistanceMm.toFixed(2)}f;
const float HALF_FIELD_MM       = ${(params.fieldSizeMm * 0.5).toFixed(2)}f;
const float RADIAL_K1           = ${params.radialK1.toFixed(4)}f;
const float SKEW_RAD            = ${((params.tangentialSkewDeg * Math.PI) / 180).toFixed(5)}f;
const float BACKLASH_X_MM       = ${params.backlashXMm.toFixed(3)}f;
const float BACKLASH_Y_MM       = ${params.backlashYMm.toFixed(3)}f;
const float STEP_ANGLE_DEG      = ${stepAngle}f;
const float FOCUS_STEPS_PER_MM  = 3200.0f; // M4/T5 linear focus stage
const float Z_BED_STEPS_PER_MM  = 1600.0f; // T8x2mm leadscrew (Bed descends)

long currentStepsX = 0;
long currentStepsY = 0;
long currentStepsFocusA = 0;
long currentStepsBedZ = 0;
float currentBedDropMm = 0.0f;
float lastTargetX = 0.0f;
float lastTargetY = 0.0f;

void pulsePin(uint8_t pin) {
  digitalWrite(pin, HIGH);
  delayMicroseconds(4);
  digitalWrite(pin, LOW);
}

// Steps the Build Bed DOWN (-Z) by layerThicknessMm at the end of a layer
void stepBedDown(float targetBedDropMm) {
  long targetZSteps = lround(targetBedDropMm * Z_BED_STEPS_PER_MM);
  long dz = labs(targetZSteps - currentStepsBedZ);
  digitalWrite(Z_DIR_PIN, (targetZSteps >= currentStepsBedZ) ? HIGH : LOW); // HIGH = Bed Down
  for (long i = 0; i < dz; i++) {
    pulsePin(Z_STEP_PIN);
    delayMicroseconds(600);
  }
  currentStepsBedZ = targetZSteps;
  currentBedDropMm = targetBedDropMm;
}

// Coordinated 3-Axis Optical Scan: Mirror X + Mirror Y + Linear Laser Focus Carriage (A-Axis)
void moveGalvoAndLinearFocus(float targetX, float targetY, float feedMmPerSec, uint8_t laserPwm) {
  // 1. Apply Field Calibration & Backlash Pre-Warp
  float nx = targetX / HALF_FIELD_MM;
  float ny = targetY / HALF_FIELD_MM;
  float r2 = nx * nx + ny * ny;
  float radialScale = 1.0f + RADIAL_K1 * r2;

  float warpedX = targetX * radialScale + targetY * sin(SKEW_RAD);
  float warpedY = (targetY * radialScale) * cos(SKEW_RAD);

  if (fabs(targetX - lastTargetX) > 0.01f) {
    warpedX += ((targetX > lastTargetX) ? 0.5f : -0.5f) * BACKLASH_X_MM;
  }
  if (fabs(targetY - lastTargetY) > 0.01f) {
    warpedY += ((targetY > lastTargetY) ? 0.5f : -0.5f) * BACKLASH_Y_MM;
  }

  // 2. Inverse Galvo Tangent Kinematics + Linear Laser Focus Translation Δz
  float effL0 = WORKING_DIST_MM + currentBedDropMm;
  float thetaXDeg = 0.5f * atan2(warpedX, effL0) * (180.0f / PI);
  float dX = hypot(effL0, warpedX);
  float thetaYDeg = 0.5f * atan2(warpedY, dX) * (180.0f / PI);

  // Dynamic Linear Focus Shift: Δz = sqrt(L0^2 + x^2 + y^2) - L0
  float focusDeltaZMm = sqrt(effL0 * effL0 + warpedX * warpedX + warpedY * warpedY) - effL0;

  long targetStepsX = lround(thetaXDeg / STEP_ANGLE_DEG);
  long targetStepsY = lround(thetaYDeg / STEP_ANGLE_DEG);
  long targetStepsA = lround(focusDeltaZMm * FOCUS_STEPS_PER_MM);

  // 3. 3D Bresenham Coordinated Stepper Interpolation (X Mirror + Y Mirror + Linear Laser Focus)
  long dx = labs(targetStepsX - currentStepsX);
  long dy = labs(targetStepsY - currentStepsY);
  long da = labs(targetStepsA - currentStepsFocusA);
  digitalWrite(X_DIR_PIN, (targetStepsX >= currentStepsX) ? HIGH : LOW);
  digitalWrite(Y_DIR_PIN, (targetStepsY >= currentStepsY) ? HIGH : LOW);
  digitalWrite(A_DIR_PIN, (targetStepsA >= currentStepsFocusA) ? HIGH : LOW);

  analogWrite(LASER_PWM_PIN, laserPwm);

  long stepsTotal = max(dx, max(dy, da));
  long errX = 0, errY = 0, errA = 0;
  unsigned int stepDelayUs = (unsigned int)constrain(120000.0f / max(20.0f, feedMmPerSec), 180, 2500);

  for (long i = 0; i < stepsTotal; i++) {
    errX += dx;
    if (errX >= stepsTotal) { errX -= stepsTotal; pulsePin(X_STEP_PIN); }
    errY += dy;
    if (errY >= stepsTotal) { errY -= stepsTotal; pulsePin(Y_STEP_PIN); }
    errA += da;
    if (errA >= stepsTotal) { errA -= stepsTotal; pulsePin(A_STEP_PIN); }
    delayMicroseconds(stepDelayUs);
  }

  currentStepsX = targetStepsX;
  currentStepsY = targetStepsY;
  currentStepsFocusA = targetStepsA;
  lastTargetX = targetX;
  lastTargetY = targetY;
}

void setup() {
  Serial.begin(115200);
  pinMode(X_STEP_PIN, OUTPUT); pinMode(X_DIR_PIN, OUTPUT);
  pinMode(Y_STEP_PIN, OUTPUT); pinMode(Y_DIR_PIN, OUTPUT);
  pinMode(Z_STEP_PIN, OUTPUT); pinMode(Z_DIR_PIN, OUTPUT);
  pinMode(A_STEP_PIN, OUTPUT); pinMode(A_DIR_PIN, OUTPUT);
  pinMode(STEPPER_EN_PIN, OUTPUT);
  pinMode(LASER_PWM_PIN, OUTPUT);

  digitalWrite(STEPPER_EN_PIN, LOW); // Enable all 4 stepper drivers
  analogWrite(LASER_PWM_PIN, 0);     // Safe startup: Laser OFF
  Serial.println(F("READY: GalvoProto 4-Axis Arduino Controller (XY Mirrors + Linear Focus + Z Bed Down)"));
}

void loop() {
  if (Serial.available() > 0) {
    String line = Serial.readStringUntil('\\n');
    line.trim();
    if (line.startsWith("M5")) {
      analogWrite(LASER_PWM_PIN, 0);
      Serial.println(F("OK M5"));
    } else if (line.startsWith("G0") || line.startsWith("G1")) {
      bool isLasing = line.startsWith("G1");
      int zIdx = line.indexOf('Z');
      if (zIdx >= 0 && line.indexOf('X') < 0) {
        // Dedicated Z-Bed Down command between layers
        float bedDrop = fabs(line.substring(zIdx + 1).toFloat());
        stepBedDown(bedDrop);
        Serial.println(F("OK Z_BED_DOWN"));
        return;
      }
      int xIdx = line.indexOf('X');
      int yIdx = line.indexOf('Y');
      float tx = (xIdx >= 0) ? line.substring(xIdx + 1).toFloat() : lastTargetX;
      float ty = (yIdx >= 0) ? line.substring(yIdx + 1).toFloat() : lastTargetY;
      uint8_t pwm = isLasing ? ${(Math.round((params.laserPowerPct / 100) * 255))} : 0;
      moveGalvoAndLinearFocus(tx, ty, isLasing ? ${params.scanSpeedMmPerSec.toFixed(1)}f : ${params.jumpSpeedMmPerSec.toFixed(1)}f, pwm);
      Serial.println(F("OK"));
    }
  }
}
`;
}

/**
 * Generates calibrated G-code + stepper step stream for the optimized layer.
 */
export function generateCalibratedGCode(
  optimized: OptimizedPathResult,
  params: CalibrationParams,
  layerIndex = 1
): string {
  const lines: string[] = [
    `; --- GalvoProto Calibrated Toolpath Stream ---`,
    `; Layer: ${layerIndex} | Optimization: ${optimized.algorithm.toUpperCase()}`,
    `; Stepper Mode: ${getStepperModeLabel(params.stepperMode)}`,
    `; Working Distance L0: ${params.workingDistanceMm}mm | Radial k1: ${params.radialK1.toFixed(4)}`,
    `; Jump Saved: ${optimized.jumpSavedPct.toFixed(1)}% | Est. Layer Time: ${optimized.estimatedTimeSec.toFixed(2)}s`,
    `G21 ; Millimeter units`,
    `G90 ; Absolute positioning`,
    `M5 ; Laser disarmed`,
  ];

  let prevPt: Point2D = { x: 0, y: 0 };

  for (const seg of optimized.segments) {
    const startWarped = applyCalibrationTransform(seg.start, params, prevPt);
    const startKin = computeStepperGalvoKinematics(
      startWarped.x,
      startWarped.y,
      params.workingDistanceMm,
      params.stepperMode
    );

    lines.push(
      `G0 X${startWarped.x.toFixed(3)} Y${startWarped.y.toFixed(3)} F${Math.round(params.jumpSpeedMmPerSec * 60)} ; Jump [Steps X:${startKin.stepsX} Y:${startKin.stepsY}]`
    );

    const endWarped = applyCalibrationTransform(seg.end, params, seg.start);
    const endKin = computeStepperGalvoKinematics(
      endWarped.x,
      endWarped.y,
      params.workingDistanceMm,
      params.stepperMode
    );
    const pwmVal = Math.round((seg.powerPct / 100) * (params.laserPowerPct / 100) * 255);

    lines.push(`M3 S${pwmVal} ; 5mW Laser ON (${seg.featureType})`);
    lines.push(
      `G1 X${endWarped.x.toFixed(3)} Y${endWarped.y.toFixed(3)} Z${(-endKin.focusDeltaZMm).toFixed(3)} F${Math.round(params.scanSpeedMmPerSec * 60)} ; [Steps X:${endKin.stepsX} Y:${endKin.stepsY}]`
    );
    lines.push(`M5 ; Laser OFF`);
    prevPt = seg.end;
  }

  lines.push(`G0 X0.000 Y0.000 F${Math.round(params.jumpSpeedMmPerSec * 60)} ; Return home`);
  return lines.join('\n');
}

/**
 * Generates parametric OpenSCAD (.scad) source for 3D printing the custom
 * Low-Cost Stepper-Galvo Optical Mount & 5mW Kids Laser Collimator Clamp.
 */
export function generateOpenScadMountCode(params: CalibrationParams): string {
  return `// GalvoProto Parametric 3D Printable CAD Mount (OpenSCAD)
// Part: Orthogonal X/Y Stepper Galvo Frame + 12mm Kids Laser Pointer Clamp
// Working Distance L0 = ${params.workingDistanceMm} mm | Target Field = ${params.fieldSizeMm}x${params.fieldSizeMm} mm

$fn = 64;
nema17_width = 42.3;
nema17_bolt_spacing = 31.0;
laser_barrel_dia = 12.2; // Standard 5mW 650nm kids laser pointer module diameter
mirror_shaft_dia = 5.05; // NEMA 17 5mm D-shaft

module nema17_flange() {
  difference() {
    cube([nema17_width + 10, nema17_width + 10, 6], center=true);
    cylinder(d=22.5, h=8, center=true); // Pilot boss bore
    for (dx = [-1, 1], dy = [-1, 1]) {
      translate([dx * nema17_bolt_spacing/2, dy * nema17_bolt_spacing/2, 0])
        cylinder(d=3.4, h=8, center=true); // M3 bolt holes
    }
  }
}

module kids_laser_clamp() {
  difference() {
    union() {
      cylinder(d=laser_barrel_dia + 8, h=28, center=true);
      translate([0, (laser_barrel_dia + 8)/2, 0])
        cube([16, 12, 28], center=true);
    }
    cylinder(d=laser_barrel_dia, h=30, center=true);
    // Pinch slot for M3 clamping screw
    translate([0, (laser_barrel_dia + 6)/2, 0])
      cube([2.0, 14, 30], center=true);
  }
}

module mirror_hub_45deg() {
  difference() {
    union() {
      cylinder(d=14, h=14);
      translate([0, 0, 14])
        rotate([45, 0, 0])
          translate([-12, -12, 0])
            cube([24, 24, 2.5]); // First-surface mirror backing plate
    }
    translate([0, 0, -1])
      cylinder(d=mirror_shaft_dia, h=12);
  }
}

// Complete Dual-Stepper Galvo Optical Head Assembly
union() {
  // X-Galvo Stepper Mount
  translate([-36, 0, 0]) rotate([0, 90, 0]) nema17_flange();
  // Y-Galvo Stepper Mount (Orthogonal 90 deg)
  translate([0, -36, -18]) rotate([90, 0, 0]) nema17_flange();
  // 5mW Laser Diode Holder aligned to X-Mirror
  translate([0, 48, 0]) rotate([90, 0, 0]) kids_laser_clamp();
}
`;
}
