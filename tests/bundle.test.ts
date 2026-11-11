import { describe, expect, test } from "bun:test";
import { createPatchBundle, applyPatchBundle } from "../src/vcs.ts";
import { blake3, zstdDecompress } from "../src/crypto.ts";
import { resolve } from "node:path";

const FORGE_REPO_PATH = resolve(import.meta.dir, "..");

describe("Sovereign Patch Bundle Engine", () => {
  test("createPatchBundle produces Blake3 verified bundle", () => {
    const bundle = createPatchBundle(FORGE_REPO_PATH, "packages/forge");

    expect(bundle.header.repoName).toBe("packages/forge");
    expect(bundle.header.version).toBe(1);
    expect(bundle.header.hash.length).toBe(64);

    const compressed = Buffer.from(bundle.patchZstdBase64, "base64");
    const computedHash = blake3(compressed);
    expect(computedHash).toBe(bundle.header.hash);

    const decompressed = zstdDecompress(compressed);
    expect(decompressed.length).toBe(bundle.header.rawBytes);
  });

  test("applyPatchBundle handles empty/clean patches", () => {
    const bundle = createPatchBundle(FORGE_REPO_PATH, "packages/forge");
    const res = applyPatchBundle(FORGE_REPO_PATH, bundle);
    expect(res.success).toBe(true);
  });
});
