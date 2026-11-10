import { describe, expect, test } from "bun:test";
import { blake3, blake2b, zstdCompress, zstdDecompress } from "../src/crypto.ts";

describe("Sovereign Forge Crypto & Compression", () => {
  test("blake3 produces deterministic 64-char hex digest", () => {
    const d1 = blake3("hello sovereign world");
    const d2 = blake3("hello sovereign world");
    expect(d1).toBe(d2);
    expect(d1.length).toBe(64);
  });

  test("blake3 produces different digests for different inputs", () => {
    const d1 = blake3("alpha");
    const d2 = blake3("beta");
    expect(d1).not.toBe(d2);
  });

  test("blake2b produces valid digest", () => {
    const h = blake2b("canonical native");
    expect(h.length).toBe(64);
  });

  test("zstd compress and decompress roundtrip", () => {
    const original = "The quick brown fox jumps over the lazy dog repeatedly ".repeat(20);
    const compressed = zstdCompress(original);
    expect(compressed.length).toBeLessThan(Buffer.byteLength(original));

    const decompressed = zstdDecompress(compressed).toString("utf-8");
    expect(decompressed).toBe(original);
  });
});
