// Bun FFI bridge to depot_ffi.dll (Native Rust 2024 Engine)
import { dlopen, FFIType, CString } from "bun:ffi";
import { existsSync } from "node:fs";

const candidatePaths = [
  "C:\\src\\crates\\depot\\target\\release\\depot_ffi.dll",
  "C:\\Users\\aphro\\.local\\bin\\depot_ffi.dll",
  "depot_ffi.dll",
];

const libPath = candidatePaths.find((p) => existsSync(p)) || candidatePaths[0];

let lib: any = null;

function getLib() {
  if (!lib) {
    lib = dlopen(libPath, {
      depot_abi_version: {
        args: [],
        returns: FFIType.u32,
      },
      depot_free_string: {
        args: [FFIType.ptr],
        returns: FFIType.void,
      },
      depot_gix_status_json: {
        args: [FFIType.cstring],
        returns: FFIType.ptr,
      },
      depot_just_recipes_json: {
        args: [FFIType.cstring],
        returns: FFIType.ptr,
      },
      depot_treesitter_symbols_json: {
        args: [FFIType.cstring, FFIType.cstring],
        returns: FFIType.ptr,
      },
      depot_ingest_json: {
        args: [FFIType.cstring, FFIType.u32, FFIType.bool],
        returns: FFIType.ptr,
      },
      depot_graph_query_json: {
        args: [FFIType.cstring, FFIType.cstring, FFIType.bool, FFIType.u32],
        returns: FFIType.ptr,
      },
      depot_forge_repo_json: {
        args: [FFIType.cstring, FFIType.cstring],
        returns: FFIType.ptr,
      },
      depot_re_audit_json: {
        args: [FFIType.cstring],
        returns: FFIType.ptr,
      },
      depot_re_audit_bytes_json: {
        args: [FFIType.cstring, FFIType.ptr, FFIType.usize],
        returns: FFIType.ptr,
      },
      depot_lua52_transcode_hex: {
        args: [FFIType.ptr, FFIType.usize, FFIType.u8, FFIType.u8],
        returns: FFIType.ptr,
      },
    });
  }
  return lib;
}

function callJson(ptrVal: any): any {
  if (!ptrVal) return null;
  const l = getLib();
  const cstr = new CString(ptrVal);
  const text = cstr.toString();
  l.symbols.depot_free_string(ptrVal);
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function toBuffer(str: string): Buffer {
  return Buffer.from(str + "\0", "utf8");
}

export function isFfiAvailable(): boolean {
  try {
    getLib();
    return true;
  } catch {
    return false;
  }
}

export function getDepotAbiVersion(): number {
  return getLib().symbols.depot_abi_version();
}

export function ffiGixStatus(path: string = ".") {
  const l = getLib();
  const raw = l.symbols.depot_gix_status_json(toBuffer(path));
  return callJson(raw);
}

export function ffiJustRecipes(justfilePath: string = "justfile") {
  const l = getLib();
  const raw = l.symbols.depot_just_recipes_json(toBuffer(justfilePath));
  return callJson(raw);
}

export function ffiTreeSitterSymbols(filePath: string, content: string) {
  const l = getLib();
  const raw = l.symbols.depot_treesitter_symbols_json(toBuffer(filePath), toBuffer(content));
  return callJson(raw);
}

export function ffiIngestCodebase(rootDir: string = ".", maxTokens: number = 0, outlineOnly: boolean = false) {
  const l = getLib();
  const raw = l.symbols.depot_ingest_json(toBuffer(rootDir), maxTokens, outlineOnly);
  return callJson(raw);
}

export function ffiGraphQuery(graphDir: string = ".", term: string, dfs: boolean = false, maxTokens: number = 2000) {
  const l = getLib();
  const raw = l.symbols.depot_graph_query_json(toBuffer(graphDir), toBuffer(term), dfs, maxTokens);
  return callJson(raw);
}

export function ffiForgeRepo(owner: string, repo: string) {
  const l = getLib();
  const raw = l.symbols.depot_forge_repo_json(toBuffer(owner), toBuffer(repo));
  return callJson(raw);
}

export function ffiReAudit(path: string) {
  const l = getLib();
  const raw = l.symbols.depot_re_audit_json(toBuffer(path));
  return callJson(raw);
}

export function ffiReAuditBytes(label: string, bytes: Uint8Array) {
  const l = getLib();
  const raw = l.symbols.depot_re_audit_bytes_json(toBuffer(label), bytes, bytes.length);
  return callJson(raw);
}

export function ffiLuaTranscode(bytes: Uint8Array, targetInt: number = 4, targetSizeT: number = 4) {
  const l = getLib();
  const raw = l.symbols.depot_lua52_transcode_hex(bytes, bytes.length, targetInt, targetSizeT);
  return callJson(raw);
}
