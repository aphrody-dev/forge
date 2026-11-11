// @aphrody/forge: Zero-copy FFI bridge to depot_ffi.dll (pure Rust 2024 C-ABI)
import { dlopen, FFIType, CString, ptr } from "bun:ffi";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface DepotGixTelemetry {
  workdir: string;
  git_dir: string;
  branch: string;
  head_commit: string | null;
  head_subject: string | null;
  tracked_entry_count: number;
  has_jujutsu: boolean;
  remotes: Record<string, string>;
}

export interface DepotTreeSitterSymbol {
  kind: string;
  name: string;
  span: {
    start_line: number;
    end_line: number;
  };
}

export interface DepotTreeSitterSummary {
  language: string;
  line_count: number;
  symbols: DepotTreeSitterSymbol[];
  imports: Array<{ source_module: string }>;
  calls: Array<{ callee: string }>;
}

let ffiLib: any = null;

function loadDepotFfi() {
  if (ffiLib !== null) return ffiLib;

  const candidates = [
    join(process.env.USERPROFILE || "C:/Users/aphro", ".local/bin/depot_ffi.dll"),
    "C:/src/crates/depot/target/release/depot_ffi.dll",
    "C:/src/crates/depot/target/debug/depot_ffi.dll",
  ];

  let dllPath = "";
  for (const c of candidates) {
    if (existsSync(c)) {
      dllPath = c;
      break;
    }
  }

  if (!dllPath) {
    ffiLib = false;
    return false;
  }

  try {
    ffiLib = dlopen(dllPath, {
      depot_abi_version: {
        args: [],
        returns: FFIType.u32,
      },
      depot_free_string: {
        args: [FFIType.ptr],
        returns: FFIType.void,
      },
      depot_gix_status_json: {
        args: [FFIType.ptr],
        returns: FFIType.ptr,
      },
      depot_just_recipes_json: {
        args: [FFIType.ptr],
        returns: FFIType.ptr,
      },
      depot_treesitter_symbols_json: {
        args: [FFIType.ptr, FFIType.ptr],
        returns: FFIType.ptr,
      },
      depot_ingest_json: {
        args: [FFIType.ptr, FFIType.u32, FFIType.bool],
        returns: FFIType.ptr,
      },
      depot_graph_query_json: {
        args: [FFIType.ptr, FFIType.ptr, FFIType.bool, FFIType.u32],
        returns: FFIType.ptr,
      },
      depot_forge_repo_json: {
        args: [FFIType.ptr, FFIType.ptr],
        returns: FFIType.ptr,
      },
    });
    return ffiLib;
  } catch (e) {
    console.error(`[depot-bridge] Failed to dlopen ${dllPath}:`, e);
    ffiLib = false;
    return false;
  }
}

function callFfiString(fn: (...args: any[]) => any, ...args: any[]): any {
  const lib = loadDepotFfi();
  if (!lib) return null;

  const resPtr = fn(...args);
  if (!resPtr) return null;

  const str = new CString(resPtr).toString();
  lib.symbols.depot_free_string(resPtr);

  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

export function isDepotFfiAvailable(): boolean {
  const lib = loadDepotFfi();
  return Boolean(lib && lib.symbols);
}

export function getDepotAbiVersion(): number | null {
  const lib = loadDepotFfi();
  if (!lib) return null;
  return lib.symbols.depot_abi_version();
}

export function depotGixStatus(path: string = "."): DepotGixTelemetry | null {
  const lib = loadDepotFfi();
  if (!lib) return null;
  const pBuf = Buffer.from(`${path}\0`, "utf8");
  return callFfiString(lib.symbols.depot_gix_status_json, ptr(pBuf));
}

export function depotJustRecipes(path: string = "justfile"): any {
  const lib = loadDepotFfi();
  if (!lib) return null;
  const pBuf = Buffer.from(`${path}\0`, "utf8");
  return callFfiString(lib.symbols.depot_just_recipes_json, ptr(pBuf));
}

export function depotTreeSitterSymbols(filePath: string, content: string): DepotTreeSitterSummary | null {
  const lib = loadDepotFfi();
  if (!lib) return null;
  const fBuf = Buffer.from(`${filePath}\0`, "utf8");
  const cBuf = Buffer.from(`${content}\0`, "utf8");
  return callFfiString(lib.symbols.depot_treesitter_symbols_json, ptr(fBuf), ptr(cBuf));
}

export function depotGraphQuery(graphDir: string, term: string, dfs: boolean = false, maxTokens: number = 2000): any {
  const lib = loadDepotFfi();
  if (!lib) return null;
  const gBuf = Buffer.from(`${graphDir}\0`, "utf8");
  const tBuf = Buffer.from(`${term}\0`, "utf8");
  return callFfiString(lib.symbols.depot_graph_query_json, ptr(gBuf), ptr(tBuf), dfs, maxTokens);
}
