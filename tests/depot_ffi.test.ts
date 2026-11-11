import { describe, it, expect } from "bun:test";
import {
  isFfiAvailable,
  getDepotAbiVersion,
  ffiGixStatus,
  ffiJustRecipes,
  ffiTreeSitterSymbols,
  ffiIngestCodebase,
  ffiGraphQuery,
  ffiReAuditBytes,
  ffiLuaTranscode,
} from "../src/depot_ffi.ts";

describe("Depot Native Rust FFI Bridge (depot_ffi.dll)", () => {
  it("verifies FFI availability and ABI version parity", () => {
    expect(isFfiAvailable()).toBe(true);
    expect(getDepotAbiVersion()).toBe(20261111);
  });

  it("calls ffiGixStatus to retrieve repository telemetry", () => {
    const status = ffiGixStatus("C:\\src\\crates\\depot");
    expect(status).not.toBeNull();
    expect(status.branch).toBe("main");
    expect(status.tracked_entry_count).toBeGreaterThan(0);
  });

  it("calls ffiJustRecipes to parse justfile via JustEngine", () => {
    const recipes = ffiJustRecipes("C:\\src\\crates\\depot\\justfile");
    expect(recipes).not.toBeNull();
    expect(Array.isArray(recipes.recipes)).toBe(true);
    expect(recipes.recipes.some((r: any) => r.name === "build")).toBe(true);
  });

  it("calls ffiTreeSitterSymbols to extract AST symbols", () => {
    const code = "pub struct SovereignEngine;\npub fn run_engine() {}\n";
    const ast = ffiTreeSitterSymbols("engine.rs", code);
    expect(ast).not.toBeNull();
    expect(ast.language).toBe("rust");
    expect(ast.symbols.some((s: any) => s.name === "SovereignEngine")).toBe(true);
    expect(ast.symbols.some((s: any) => s.name === "run_engine")).toBe(true);
  });

  it("calls ffiIngestCodebase to ingest code into JSON digest", () => {
    const res = ffiIngestCodebase("C:\\src\\crates\\depot\\crates\\depot-ffi", 1000, true);
    expect(res).not.toBeNull();
    expect(res.stats).toBeDefined();
    expect(res.stats.total_files).toBeGreaterThan(0);
  });

  it("calls ffiGraphQuery to query symbol knowledge graph", () => {
    const queryRes = ffiGraphQuery("C:\\src\\crates\\depot\\crates\\depot-core", "GixEngine", false, 500);
    expect(queryRes).not.toBeNull();
    expect(queryRes.term).toBe("GixEngine");
    expect(queryRes.context).toContain("GixEngine");
  });

  it("calls ffiReAuditBytes and ffiLuaTranscode for Lua 5.2 native bytecode", () => {
    const chunk = new Uint8Array([
      0x1b, 0x4c, 0x75, 0x61, 0x52, 0x00, 0x01, 0x04, 0x08, 0x04, 0x08, 0x00,
      0x19, 0x93, 0x0d, 0x0a, 0x1a, 0x0a,
      0, 0, 0, 0, // line
      0, 0, 0, 0, // last line
      0, 1, 2, // params, vararg, stack
      1, 0, 0, 0, // 1 instruction
      31, 0, 0, 1, // RETURN
      0, 0, 0, 0, // 0 constants
      0, 0, 0, 0, // 0 protos
      1, 0, 0, 0, // 1 upvalue
      1, 0,
      0, 0, 0, 0, 0, 0, 0, 0, // 0-len source
      0, 0, 0, 0, // 0 lineinfo
      0, 0, 0, 0, // 0 locvars
      0, 0, 0, 0, // 0 upval names
    ]);

    const audit = ffiReAuditBytes("test.luac", chunk);
    expect(audit).not.toBeNull();
    expect(audit.is_lua_bytecode).toBe(true);
    expect(audit.lua_bytecode?.header?.version).toBe("5.2");

    const transcoded = ffiLuaTranscode(chunk, 4, 4);
    expect(transcoded).not.toBeNull();
    expect(transcoded.ok).toBe(true);
    expect(transcoded.target_size_size_t).toBe(4);
  });
});
