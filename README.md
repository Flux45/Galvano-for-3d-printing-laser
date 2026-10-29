# GalvoForge — 3D Metal Laser Printing & Galvanometer Slicing Studio

An open-source, in-browser toolpath slicer, kinematics simulator, and 3D machine hardware explorer for **Large-Format Lensless 3D Galvanometer Metal Laser 3D Printers (SLM / LPBF / DMLS)**.

[![GitHub Pages Deployment](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-brightgreen?style=for-the-badge&logo=github)](https://flux45.github.io/Galvano-for-3d-printing-laser/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

---

## 🌐 Live Web App

Run directly in your browser without installation:
👉 **[https://flux45.github.io/Galvano-for-3d-printing-laser/](https://flux45.github.io/Galvano-for-3d-printing-laser/)**

---

## 🚀 Key Features

### 1. In-Browser CAD / STEP Slicing (OpenCascade WASM)
- Drag-and-drop support for **STEP (`.step`, `.stp`)**, **IGES (`.iges`)**, **BREP (`.brep`)**, **STL**, and **OBJ** files.
- Slicing engine executes client-side using WebAssembly in **$<5\,\text{ms}$** with zero UI thread locking.
- Pre-loaded sample models (**Basic Cube**, **Rounded Cube**) for instant testing.

### 2. Lensless 3D Galvo Kinematics (No F-Theta Lens)
- **Wide Scan Field**: Expands standard $150\,\text{mm}$ lens-limited fields to **$300\,\text{mm}$**, **$500\,\text{mm}$**, or **$1000\,\text{mm}$** fields.
- **Pre-Objective Dynamic Linear Focus**: Motorized linear stage shifts fiber input collimator ($Z_{\text{focus}}$) to dynamically cancel field curvature:
  $$\Delta z = \sqrt{L_0^2 + r^2} - L_0$$
- **Real-Time Mirror Simulation**: Live readout of optical mirror deflection angles ($\theta_x, \theta_y$) and angular velocities ($\omega_x, \omega_y$).

### 3. Industrial Metal SLM Process Engine
- High-power laser metrics ($10\,\text{kW}$ laser source, $5000\,\text{mm/s}$ scan speed).
- Real-time **Linear Energy Density** ($P/v = 2.0\,\text{J/mm}$) and **Volumetric Energy Density** ($P / (v \cdot h \cdot t)$) calculations.
- Rotating cross-hatch scan strategy ($67^\circ$ inter-layer rotation to minimize residual thermal stresses).

### 4. Interactive 3D Machine Assembly & Hardware BOM
- Full 3D model of the machine:
  - 3D Galvo Scanhead & Dual Mirror Servos
  - Dynamic Linear Focus Fiber-In Carriage (Voice Coil / Stepper)
  - Build Platform Piston Elevator (NEMA 23 + SFU1204 Ball Screw)
  - Recoater Wiper Spreader (NEMA 17 + Linear Rail)
  - Powder Feed Hopper
  - Aluminum Chassis Frame
- **Exploded View Slider (0% to 100%)**: Space out every assembly in 3D to inspect internal bearings, rails, and motors.
- **Electrical Pinout Reference**: Complete wiring assignments for BigTreeTech Octopus Pro, standard XY2-100/analog galvo drivers, and dual $\pm 15\,\text{V}$ / $+24\,\text{V}$ power supplies.

### 5. G-Code Generation & Web Serial Streaming
- Generates synchronized galvo motion G-code with dynamic $Z$-compensation commands.
- Direct hardware control via Chromium Web Serial API.

---

## 💻 Local Development

Clone and start the development server locally:

```bash
# Clone the repository
git clone https://github.com/Flux45/Galvano-for-3d-printing-laser.git
cd Galvano-for-3d-printing-laser

# Install dependencies
npm install

# Start development server
npm run dev
```

Open your browser at `http://localhost:5173/`.

To build the standalone bundle:

```bash
npm run build
```

---

## ⚡ Enabling GitHub Pages Hosting

1. Go to your repository on GitHub: `https://github.com/Flux45/Galvano-for-3d-printing-laser`
2. Navigate to **Settings** > **Pages**.
3. Under **Build and deployment** > **Source**, choose either:
   - **GitHub Actions** (recommended — uses `.github/workflows/deploy.yml` on every push to `main`), or
   - **Deploy from a branch** > select branch `gh-pages` > `/ (root)` > click **Save**.
4. Your site will be live at:
   `https://flux45.github.io/Galvano-for-3d-printing-laser/`
