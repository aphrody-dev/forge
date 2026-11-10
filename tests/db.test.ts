import { describe, expect, test } from "bun:test";
import {
  createReview,
  listReviews,
  updateReviewStatus,
  recordCIRun,
  listCIRuns,
  storeBundle,
  getBundle,
} from "../src/db.ts";

describe("Sovereign Forge SQLite Database", () => {
  test("creates and lists reviews", () => {
    const rev = createReview({
      repoName: "test-repo",
      title: "Add zero-copy parser",
      description: "Optimized with zerocopy",
      targetBranch: "main",
      sourceCommit: "c0ffee",
      author: "aphrody-dev",
    });

    expect(rev.id).toBeGreaterThan(0);
    expect(rev.status).toBe("pending");

    const list = listReviews("test-repo");
    expect(list.some((r) => r.id === rev.id)).toBe(true);

    const updated = updateReviewStatus(rev.id, "approved");
    expect(updated).toBe(true);
  });

  test("records and lists CI runs", () => {
    const run = recordCIRun({
      repoName: "test-repo",
      command: "bun test",
      status: "success",
      exitCode: 0,
      output: "10 pass, 0 fail",
      durationMs: 42,
    });

    expect(run.id).toBeGreaterThan(0);
    expect(run.status).toBe("success");

    const runs = listCIRuns("test-repo");
    expect(runs.some((r) => r.id === run.id)).toBe(true);
  });

  test("stores and retrieves bundle metadata", () => {
    const testBundle = {
      header: {
        version: 1,
        hash: "deadbeef00112233445566778899aabbccddeeff00112233445566778899aabb",
        repoName: "test/repo",
        baseCommit: "abc",
        headCommit: "def",
        timestamp: Date.now(),
        filesCount: 1,
        rawBytes: 120,
        compressedBytes: 45,
      },
      patchZstdBase64: Buffer.from("test patch").toString("base64"),
    };

    const stored = storeBundle(testBundle);
    expect(stored).toBe(true);

    const retrieved = getBundle(testBundle.header.hash);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.header.repoName).toBe("test/repo");
  });
});
