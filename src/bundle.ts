// Sovereign Content-Addressed Patch Bundle Engine
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { PatchBundle } from "./types.ts";
import { createPatchBundle, applyPatchBundle } from "./vcs.ts";
import { storeBundle, getBundle } from "./db.ts";
import { blake3, zstdDecompress } from "./crypto.ts";

export function exportBundleToFile(
  repoPath: string,
  repoName: string,
  outPath?: string
): { bundle: PatchBundle; filePath: string } {
  const bundle = createPatchBundle(repoPath, repoName);
  storeBundle(bundle);

  const dest = outPath
    ? resolve(outPath)
    : join(repoPath, `${bundle.header.repoName.replace(/[\/\\]/g, "_")}_${bundle.header.hash.substring(0, 10)}.frg.json`);

  writeFileSync(dest, JSON.stringify(bundle, null, 2), "utf-8");
  return { bundle, filePath: dest };
}

export function importBundleFromFile(
  bundleFilePathOrHash: string,
  targetRepoPath: string
): { success: boolean; message: string } {
  let bundle: PatchBundle | null = null;

  if (existsSync(bundleFilePathOrHash)) {
    try {
      const raw = readFileSync(bundleFilePathOrHash, "utf-8");
      bundle = JSON.parse(raw);
    } catch (e: any) {
      return { success: false, message: `Failed to parse bundle file: ${e.message}` };
    }
  } else {
    // Try looking up by hash in SQLite
    bundle = getBundle(bundleFilePathOrHash);
  }

  if (!bundle) {
    return { success: false, message: `Bundle not found: ${bundleFilePathOrHash}` };
  }

  return applyPatchBundle(targetRepoPath, bundle);
}

export function verifyBundleFile(filePath: string): {
  valid: boolean;
  hash: string;
  repoName: string;
  rawBytes: number;
  compressedBytes: number;
} {
  const raw = readFileSync(filePath, "utf-8");
  const bundle: PatchBundle = JSON.parse(raw);
  const compressed = Buffer.from(bundle.patchZstdBase64, "base64");
  const computedHash = blake3(compressed);

  const valid = computedHash === bundle.header.hash;
  return {
    valid,
    hash: computedHash,
    repoName: bundle.header.repoName,
    rawBytes: bundle.header.rawBytes,
    compressedBytes: bundle.header.compressedBytes,
  };
}
