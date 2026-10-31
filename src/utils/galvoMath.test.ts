import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeStepperGalvoKinematics,
  optimizeToolpath,
  generatePresetLayerSegments,
  generateCalibrationGrid,
  generateLayerCalibrationTable,
  generateArduinoFirmwareSketch,
  type CalibrationParams,
} from './galvoMath';

const defaultParams: CalibrationParams = {
  workingDistanceMm: 140,
  fieldSizeMm: 100,
  radialK1: 0.12,
  tangentialSkewDeg: 0.5,
  backlashXMm: 0.15,
  backlashYMm: 0.15,
  stepperMode: 'nema17_32x_belt3x',
  scanSpeedMmPerSec: 180,
  jumpSpeedMmPerSec: 420,
  laserPowerPct: 90,
  layerHeightUm: 100,
};

test('stepper galvo kinematics computes center, off-axis linear focus, and descending bed drop accurately', () => {
  const center = computeStepperGalvoKinematics(0, 0, 140, 'nema17_32x_belt3x', 0);
  assert.equal(center.stepsX, 0);
  assert.equal(center.stepsY, 0);
  assert.equal(center.focusDeltaZMm, 0);
  assert.equal(center.focusStageSteps, 0);
  assert.equal(center.bedDropSteps, 0);

  const cornerWithBedDrop = computeStepperGalvoKinematics(35, -25, 140, 'nema17_32x_belt3x', 1.2);
  assert.ok(cornerWithBedDrop.thetaXDeg > 6.5 && cornerWithBedDrop.thetaXDeg < 7.5);
  assert.ok(cornerWithBedDrop.thetaYDeg < -4.5 && cornerWithBedDrop.thetaYDeg > -5.5);
  assert.ok(cornerWithBedDrop.stepsX > 300);
  assert.ok(cornerWithBedDrop.focusDeltaZMm > 5.0);
  assert.ok(cornerWithBedDrop.focusStageSteps > 16000);
  assert.equal(cornerWithBedDrop.bedDropMm, 1.2);
  assert.equal(cornerWithBedDrop.bedDropSteps, 1920);
  assert.ok(cornerWithBedDrop.quantizationErrorUm < 150);
});

test('real-time path optimization significantly reduces non-lasing jump travel', () => {
  const segments = generatePresetLayerSegments('calibration_gear', 4.5);
  assert.ok(segments.length > 20);

  const rawResult = optimizeToolpath(segments, 'raw', 180, 420);
  const nnResult = optimizeToolpath(segments, 'nearest', 180, 420);
  const opt2Result = optimizeToolpath(segments, '2opt_skywriting', 180, 420);

  assert.equal(rawResult.segments.length, segments.length);
  assert.equal(nnResult.segments.length, segments.length);
  assert.equal(opt2Result.segments.length, segments.length);

  // Nearest neighbor and 2-Opt must reduce jump distance compared to raw
  assert.ok(
    nnResult.jumpDistanceMm < rawResult.jumpDistanceMm,
    `Expected NN jump (${nnResult.jumpDistanceMm}) < raw jump (${rawResult.jumpDistanceMm})`
  );
  assert.ok(
    opt2Result.jumpDistanceMm <= nnResult.jumpDistanceMm + 0.01,
    `Expected 2-Opt jump (${opt2Result.jumpDistanceMm}) <= NN jump (${nnResult.jumpDistanceMm})`
  );
  assert.ok(opt2Result.jumpSavedPct > 25);
  assert.ok(opt2Result.skywritingArcs.length > 0);
});

test('calibration grid reduces RMS optical distortion error', () => {
  const grid = generateCalibrationGrid(defaultParams, 9);
  assert.equal(grid.points.length, 81);
  assert.ok(
    grid.rmsErrorAfterMm < grid.rmsErrorBeforeMm,
    `Expected calibrated RMS error (${grid.rmsErrorAfterMm}) < raw error (${grid.rmsErrorBeforeMm})`
  );
});

test('layer calibration table and Arduino firmware generator produce valid 4-axis outputs', () => {
  const table = generateLayerCalibrationTable(defaultParams, 6);
  assert.equal(table.length, 6);
  assert.equal(table[0].zHeightMm, 0);
  assert.equal(table[5].zHeightMm, 0.5);
  assert.equal(table[5].effectiveWorkDistMm, 140.5);

  const sketch = generateArduinoFirmwareSketch(defaultParams);
  assert.ok(sketch.includes('#define LASER_PWM_PIN 11'));
  assert.ok(sketch.includes('#define A_STEP_PIN 12'));
  assert.ok(sketch.includes('moveGalvoAndLinearFocus'));
  assert.ok(sketch.includes('stepBedDown'));
});
