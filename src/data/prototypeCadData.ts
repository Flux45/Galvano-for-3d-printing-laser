export type SubsystemCategory = 'all' | 'optics' | 'motion' | 'electronics' | 'frame';

export interface CadPartSpec {
  id: string;
  name: string;
  subsystem: Exclude<SubsystemCategory, 'all'>;
  costUsd: number;
  industrialEquivalentCostUsd: number;
  summary: string;
  materialAndPrintSpec: string;
  specs: Array<{ label: string; value: string }>;
  arduinoPinout: Array<{ signal: string; pin: string; notes: string }>;
  explodeVector: [number, number, number];
}

export const PROTOTYPE_CAD_PARTS: CadPartSpec[] = [
  {
    id: 'laser-module',
    name: '5mW 650nm Kids Laser + Dynamic Linear Focus Stage',
    subsystem: 'optics',
    costUsd: 8.5,
    industrialEquivalentCostUsd: 450,
    summary:
      'Eye-safe 5mW 650nm red laser diode mounted on a motorized Linear Focus Stage (M4 leadscrew + dual Ø4mm chrome guide rails). Moves the laser & collimator linearly (Δz = √(L₀²+r²) - L₀) in real time to keep the spot sharply focused across the flat bed without an F-Theta lens.',
    materialAndPrintSpec: 'PETG Sliding Focus Carriage + Mini Stepper Linear Actuator (±15mm stroke)',
    specs: [
      { label: 'Linear Focus Travel', value: '±15.0 mm Dynamic Axial Stroke (Δz Focus Shift)' },
      { label: 'Focus Drive Actuator', value: 'Mini Stepper + M4×0.5mm Leadscrew (3200 steps/mm)' },
      { label: 'Wavelength & Gate', value: '650 nm Red 5 mW · 0–5 kHz TTL PWM (Pin D11)' },
      { label: 'Flat-Field Law', value: 'Δz = √(L₀² + x² + y²) - L₀ real-time tracking' },
    ],
    arduinoPinout: [
      { signal: 'A_STEP (Focus Linear)', pin: 'Arduino D12 (CNC Shield A-Axis)', notes: 'Steps laser carriage linearly along beam axis' },
      { signal: 'A_DIR (Focus Dir)', pin: 'Arduino D13 (CNC Shield A-Axis)', notes: 'Forward/backward focal waist translation' },
      { signal: 'LASER_TTL_PWM', pin: 'Arduino D11 (Timer2 PWM)', notes: '5V PWM -> 2N2222 Base via 1kΩ resistor' },
    ],
    explodeVector: [0, 1.8, 2.2],
  },
  {
    id: 'stepper-x',
    name: 'X-Axis Stepper Galvo Actuator & First-Surface Mirror X',
    subsystem: 'optics',
    costUsd: 9.5,
    industrialEquivalentCostUsd: 680,
    summary:
      'NEMA 17 (17HS4023 pancake) or 28BYJ-48 stepper motor driving a lightweight 3D-printed 45° mirror hub with a 15×15×1.5 mm front-surface aluminized mirror to deflect the beam across the X-axis.',
    materialAndPrintSpec: 'PLA+ Mirror Hub (< 2.4g rotor inertia) + 15×15mm First-Surface Mirror',
    specs: [
      { label: 'Motor Type', value: 'NEMA 17 Pancake (17HS4023) / 28BYJ-48 5V option' },
      { label: 'Angular Resolution', value: '0.1125° (1/16 step) or 0.0188° (1/32 + 3:1 belt)' },
      { label: 'Mechanical Scan Range', value: '±14.0° shaft (±28.0° optical beam deflection)' },
      { label: 'Mirror Substrate', value: '15 × 15 × 1.5 mm Front-Surface Float Glass (R > 92%)' },
    ],
    arduinoPinout: [
      { signal: 'X_STEP', pin: 'Arduino D2', notes: 'CNC Shield X-Axis Step Pulse (min 4 µs high)' },
      { signal: 'X_DIR', pin: 'Arduino D5', notes: 'CNC Shield X-Axis Direction' },
      { signal: 'MS1 / MS2 / MS3', pin: 'HIGH / HIGH / HIGH', notes: 'Jumper capped for 1/16 or 1/32 microstepping' },
    ],
    explodeVector: [-2.4, 1.4, 0.5],
  },
  {
    id: 'stepper-y',
    name: 'Y-Axis Orthogonal Stepper Galvo & Mirror Y',
    subsystem: 'optics',
    costUsd: 9.5,
    industrialEquivalentCostUsd: 680,
    summary:
      'Mounted orthogonally (90°) below and forward of the X-mirror. Receives the X-deflected laser sheet and steers it along the Y-axis onto the horizontal calibration/resin bed.',
    materialAndPrintSpec: 'PLA+ Low-Inertia Mirror Mount + Precision 5mm D-Shaft Press Fit',
    specs: [
      { label: 'Mounting Orientation', value: '90° Orthogonal to X-Axis Stepper Shaft' },
      { label: 'Inter-Mirror Separation', value: '22.0 mm center-to-center optical path' },
      { label: 'Mirror Aperture', value: '20 × 15 mm (wider to catch X-axis beam sweep)' },
      { label: 'Corner Settling Time', value: '~3.8 ms with 2-Opt Skywriting lookahead' },
    ],
    arduinoPinout: [
      { signal: 'Y_STEP', pin: 'Arduino D3', notes: 'CNC Shield Y-Axis Step Pulse' },
      { signal: 'Y_DIR', pin: 'Arduino D6', notes: 'CNC Shield Y-Axis Direction' },
      { signal: 'STEPPER_EN', pin: 'Arduino D8 (Active LOW)', notes: 'Shared driver enable across X/Y/Z' },
    ],
    explodeVector: [2.4, 1.4, -0.5],
  },
  {
    id: 'arduino-controller',
    name: 'Arduino Uno R3 + CNC Shield V3 + A4988/DRV8825 Drivers',
    subsystem: 'electronics',
    costUsd: 11.0,
    industrialEquivalentCostUsd: 890,
    summary:
      'Replaces expensive XY2-100 FPGA galvo controllers with an off-the-shelf ATmega328P Arduino Uno R3 and CNC Shield V3. Runs real-time Bresenham microstep interpolation, backlash compensation, and tangent pre-warping.',
    materialAndPrintSpec: '3D-Printed Snap-In DIN Baseplate with 40mm Cooling Fan Shroud',
    specs: [
      { label: 'Microcontroller', value: 'ATmega328P @ 16 MHz (32 KB Flash, 2 KB SRAM)' },
      { label: 'Stepper Drivers', value: '3× A4988 / DRV8825 (Vref set to 0.55V for cool running)' },
      { label: 'Serial Protocol', value: '115200 baud ASCII G-Code (G0/G1/M3/M5/G4)' },
      { label: 'Power Input', value: '12V 5A DC Barrel / Screw Terminal into CNC Shield' },
    ],
    arduinoPinout: [
      { signal: 'USB Serial RX/TX', pin: 'D0 / D1 (CH340G / ATmega16U2)', notes: '115200 baud stream from GalvoProto Studio' },
      { signal: 'X/Y/Z STEP', pin: 'D2, D3, D4', notes: 'Port D fast register stepping' },
      { signal: 'X/Y/Z DIR', pin: 'D5, D6, D7', notes: 'Direction inversion + backlash injection' },
    ],
    explodeVector: [-2.8, -0.8, 1.8],
  },
  {
    id: 'z-stage-bed',
    name: 'Z-Axis T8 Leadscrew Elevator & Calibration Target Bed',
    subsystem: 'motion',
    costUsd: 12.5,
    industrialEquivalentCostUsd: 520,
    summary:
      'Driven by the 3rd stepper channel on the CNC Shield. In prototype validation mode, holds a grid-printed photo-reactive/cardstock target plate; in resin SLA mode, dips the perforated build plate into a mini vat.',
    materialAndPrintSpec: '2× Ø8mm Linear Rods + LM8UU Bearings + T8×2mm Brass Nut Carriage',
    specs: [
      { label: 'Leadscrew Pitch', value: 'T8 × 2 mm Lead (1600 microsteps/mm at 1/16)' },
      { label: 'Z Layer Resolution', value: '0.625 µm per microstep (50–100 µm layer slices)' },
      { label: 'Calibration Target Area', value: '100 × 100 mm Matte Grid / UV Photo-Paper Plate' },
      { label: 'Working Distance L0', value: '140 mm from Y-Mirror pivot to Z=0 bed plane' },
    ],
    arduinoPinout: [
      { signal: 'Z_STEP', pin: 'Arduino D4', notes: 'CNC Shield Z-Axis Step Pulse' },
      { signal: 'Z_DIR', pin: 'Arduino D7', notes: 'CNC Shield Z-Axis Direction' },
      { signal: 'Z_MIN_ENDSTOP', pin: 'Arduino D11 / Z-', notes: 'Optical or microswitch homing sensor' },
    ],
    explodeVector: [0, -1.6, 0],
  },
  {
    id: 'frame-gantry',
    name: '2020 Aluminum Extrusion Frame & 3D-Printed Optical Bridge',
    subsystem: 'frame',
    costUsd: 14.0,
    industrialEquivalentCostUsd: 650,
    summary:
      'Desktop-sized rigid 2020 V-slot aluminum extrusion portal with 3D-printed corner gussets and upper optical bridge. Keeps the laser diode and X/Y stepper mirrors locked in fixed geometric alignment.',
    materialAndPrintSpec: '4× 250mm 2020 Extrusions + PLA+/PETG Printed Optical Head Bridge',
    specs: [
      { label: 'Outer Footprint', value: '220 × 220 × 260 mm Desktop Benchtop Rig' },
      { label: 'Printed Filament Needed', value: '~185 g PLA+ or PETG (approx. 5.5 hours print time)' },
      { label: 'Fasteners', value: 'M3 × 10mm Socket Head Cap Screws + M5 T-Nuts' },
      { label: 'Optical Alignment', value: 'Slotted ±3° yaw/pitch adjustment on laser & mirror mounts' },
    ],
    arduinoPinout: [
      { signal: 'CHASSIS_GND', pin: 'PSU Earth / Frame Bond', notes: 'Prevents static buildup on stepper frames' },
    ],
    explodeVector: [0, 2.2, -1.8],
  },
];
