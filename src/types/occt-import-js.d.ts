declare module "occt-import-js" {
  export interface OcctMeshAttribute {
    name: string;
    array: number[];
  }

  export interface OcctMeshIndex {
    array: number[];
  }

  export interface OcctMesh {
    name: string;
    color?: [number, number, number];
    attributes: {
      position: OcctMeshAttribute;
      normal?: OcctMeshAttribute;
    };
    index: OcctMeshIndex;
  }

  export interface OcctResult {
    success: boolean;
    meshes: OcctMesh[];
    root?: any;
  }

  export interface OcctParams {
    linearUnit?: "millimeter" | "centimeter" | "meter" | "inch";
    linearDeflectionType?: "bounding_box_ratio" | "absolute";
    linearDeflection?: number;
    angularDeflection?: number;
  }

  export interface OcctModule {
    ReadStepFile: (content: Uint8Array, params?: OcctParams | null) => OcctResult;
    ReadIgesFile: (content: Uint8Array, params?: OcctParams | null) => OcctResult;
    ReadBrepFile: (content: Uint8Array, params?: OcctParams | null) => OcctResult;
  }

  export default function occtimportjs(moduleArg?: any): Promise<OcctModule>;
}
