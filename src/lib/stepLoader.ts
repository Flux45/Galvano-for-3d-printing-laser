import occtimportjs from "occt-import-js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type { MeshGeometry, MeshBounds } from "./types";

let occtPromise: ReturnType<typeof occtimportjs> | null = null;

async function getOcct() {
  if (!occtPromise) {
    const occtFn = typeof occtimportjs === "function" ? occtimportjs : (occtimportjs as any).default;
    occtPromise = occtFn({
      locateFile: (name: string) => {
        if (name.endsWith(".wasm")) {
          return "/occt-import-js.wasm";
        }
        return name;
      },
    });
  }
  return occtPromise;
}

export async function loadCadFile(file: File): Promise<MeshGeometry> {
  const filename = file.name;
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  if (ext === "stl") {
    const buf = await file.arrayBuffer();
    return parseStl(buf, filename);
  }

  if (ext === "obj") {
    const text = await file.text();
    return parseObj(text, filename);
  }

  // STEP / STP / IGES / BREP via OpenCascade WASM
  const wasm = await getOcct();
  const buf = await file.arrayBuffer();
  const uint8 = new Uint8Array(buf);

  let result: any;
  if (ext === "iges" || ext === "igs") {
    result = wasm.ReadIgesFile(uint8, {
      linearUnit: "millimeter",
      linearDeflectionType: "bounding_box_ratio",
      linearDeflection: 0.005,
      angularDeflection: 0.5,
    });
  } else if (ext === "brep") {
    result = wasm.ReadBrepFile(uint8, {
      linearUnit: "millimeter",
      linearDeflectionType: "bounding_box_ratio",
      linearDeflection: 0.005,
      angularDeflection: 0.5,
    });
  } else {
    // Default to STEP / STP
    result = wasm.ReadStepFile(uint8, {
      linearUnit: "millimeter",
      linearDeflectionType: "bounding_box_ratio",
      linearDeflection: 0.005,
      angularDeflection: 0.5,
    });
  }

  if (!result || !result.success || !result.meshes?.length) {
    throw new Error(`Failed to parse ${ext.toUpperCase()} file: ${file.name}`);
  }

  const positions: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  for (const m of result.meshes) {
    const posArr = m.attributes.position.array;
    for (let i = 0; i < posArr.length; i++) {
      positions.push(posArr[i]);
    }

    const idxArr = m.index.array;
    for (let i = 0; i < idxArr.length; i++) {
      indices.push(idxArr[i] + vertexOffset);
    }
    vertexOffset += posArr.length / 3;
  }

  return normalizeAndBuildMesh(new Float32Array(positions), new Uint32Array(indices), filename);
}

function parseStl(buffer: ArrayBuffer, filename: string): MeshGeometry {
  const loader = new STLLoader();
  const geom = loader.parse(buffer);
  const posAttr = geom.getAttribute("position");
  if (!posAttr) throw new Error("Invalid STL: missing position data");

  const positions = posAttr.array as Float32Array;
  let indices: Uint32Array;
  if (geom.index) {
    indices = new Uint32Array(geom.index.array);
  } else {
    const n = posAttr.count;
    indices = new Uint32Array(n);
    for (let i = 0; i < n; i++) indices[i] = i;
  }
  return normalizeAndBuildMesh(positions, indices, filename);
}

function parseObj(text: string, filename: string): MeshGeometry {
  const loader = new OBJLoader();
  const obj = loader.parse(text);
  const positions: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  obj.traverse((child: any) => {
    if (child.isMesh && child.geometry) {
      const geom = child.geometry;
      const pos = geom.getAttribute("position");
      if (pos) {
        const arr = pos.array;
        for (let i = 0; i < arr.length; i++) positions.push(arr[i]);

        if (geom.index) {
          const idxArr = geom.index.array;
          for (let i = 0; i < idxArr.length; i++) indices.push(idxArr[i] + vertexOffset);
        } else {
          for (let i = 0; i < pos.count; i++) indices.push(vertexOffset + i);
        }
        vertexOffset += pos.count;
      }
    }
  });

  if (positions.length === 0) {
    throw new Error("No mesh data found in OBJ file");
  }

  return normalizeAndBuildMesh(new Float32Array(positions), new Uint32Array(indices), filename);
}

function normalizeAndBuildMesh(positions: Float32Array, indices: Uint32Array, filename: string): MeshGeometry {
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;
  let minZ = Infinity,
    maxZ = -Infinity;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  // Auto-scale if unit is in meters (< 1mm) or if part is too large for the 150mm field (> 120mm)
  let scale = 1;
  const rawSizeX = maxX - minX;
  const rawSizeY = maxY - minY;
  const rawSizeZ = maxZ - minZ;
  const maxDim = Math.max(rawSizeX, rawSizeY, rawSizeZ);

  if (maxDim > 0 && maxDim < 1) {
    // File likely authored in meters -> convert to mm
    scale = 1000;
  } else if (maxDim > 45) {
    // Normalize model to ~35mm max dimension for instant interactive slicing and smooth 60fps rendering
    scale = 35 / maxDim;
  }

  // Center XY around origin (0, 0) and place minZ at 0 (build plate)
  const cx = ((minX + maxX) / 2) * scale;
  const cy = ((minY + maxY) / 2) * scale;
  const shiftZ = minZ * scale;

  const centeredPositions = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    centeredPositions[i] = positions[i] * scale - cx;
    centeredPositions[i + 1] = positions[i + 1] * scale - cy;
    centeredPositions[i + 2] = positions[i + 2] * scale - shiftZ;
  }

  const bounds: MeshBounds = {
    minX: (minX * scale) - cx,
    maxX: (maxX * scale) - cx,
    minY: (minY * scale) - cy,
    maxY: (maxY * scale) - cy,
    minZ: 0,
    maxZ: (maxZ * scale) - shiftZ,
    sizeX: rawSizeX * scale,
    sizeY: rawSizeY * scale,
    sizeZ: rawSizeZ * scale,
  };

  return {
    positions: centeredPositions,
    indices,
    bounds,
    filename,
    triangleCount: indices.length / 3,
  };
}
