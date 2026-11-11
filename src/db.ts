// Sovereign SQLite Store for Forge Reviews, CI & Bundles
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Review, CIRun, PatchBundle } from "./types.ts";

function resolveDbPath(): string {
  if (process.env.FORGE_DB_PATH) {
    return process.env.FORGE_DB_PATH;
  }
  const metaDir = import.meta.dir || "";
  if (
    metaDir.startsWith("B:\\~BUN") ||
    metaDir.startsWith("B:/~BUN") ||
    metaDir.includes("/$bunfs/") ||
    metaDir.includes("\\$bunfs\\")
  ) {
    if (existsSync("C:\\src\\packages\\forge")) {
      return "C:\\src\\packages\\forge\\forge.sqlite";
    }
    const fallbackDir = join(homedir(), ".local", "share", "aphrody-forge");
    mkdirSync(fallbackDir, { recursive: true });
    return join(fallbackDir, "forge.sqlite");
  }
  const candidate = join(metaDir, "..", "forge.sqlite");
  mkdirSync(dirname(candidate), { recursive: true });
  return candidate;
}

const DB_PATH = resolveDbPath();
const db = new Database(DB_PATH, { create: true });

// WAL mode for maximum concurrent read/write throughput
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = NORMAL;");

// Initialize Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    target_branch TEXT NOT NULL,
    source_commit TEXT NOT NULL,
    status TEXT NOT NULL,
    author TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ci_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_name TEXT NOT NULL,
    command TEXT NOT NULL,
    status TEXT NOT NULL,
    exit_code INTEGER NOT NULL,
    output TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bundles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT UNIQUE NOT NULL,
    repo_name TEXT NOT NULL,
    base_commit TEXT NOT NULL,
    head_commit TEXT NOT NULL,
    raw_bytes INTEGER NOT NULL,
    compressed_bytes INTEGER NOT NULL,
    payload_base64 TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

export function createReview(params: {
  repoName: string;
  title: string;
  description: string;
  targetBranch: string;
  sourceCommit: string;
  author: string;
}): Review {
  const now = new Date().toISOString();
  const query = db.prepare(`
    INSERT INTO reviews (repo_name, title, description, target_branch, source_commit, status, author, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `);
  const result = query.run(
    params.repoName,
    params.title,
    params.description,
    params.targetBranch,
    params.sourceCommit,
    params.author,
    now,
    now,
  );

  return {
    id: Number(result.lastInsertRowid),
    repoName: params.repoName,
    title: params.title,
    description: params.description,
    targetBranch: params.targetBranch,
    sourceCommit: params.sourceCommit,
    status: "pending",
    author: params.author,
    createdAt: now,
    updatedAt: now,
  };
}

export function listReviews(repoName?: string): Review[] {
  if (repoName) {
    const stmt = db.prepare(
      "SELECT * FROM reviews WHERE repo_name = ? ORDER BY id DESC",
    );
    return stmt.all(repoName) as Review[];
  }
  const stmt = db.prepare("SELECT * FROM reviews ORDER BY id DESC LIMIT 50");
  return stmt.all() as Review[];
}

export function updateReviewStatus(
  id: number,
  status: Review["status"],
): boolean {
  const now = new Date().toISOString();
  const stmt = db.prepare(
    "UPDATE reviews SET status = ?, updated_at = ? WHERE id = ?",
  );
  const result = stmt.run(status, now, id);
  return result.changes > 0;
}

export function recordCIRun(run: Omit<CIRun, "id" | "createdAt">): CIRun {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO ci_runs (repo_name, command, status, exit_code, output, duration_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    run.repoName,
    run.command,
    run.status,
    run.exitCode,
    run.output,
    run.durationMs,
    now,
  );

  return {
    id: Number(result.lastInsertRowid),
    ...run,
    createdAt: now,
  };
}

export function listCIRuns(repoName?: string, limit: number = 30): CIRun[] {
  if (repoName) {
    const stmt = db.prepare(
      "SELECT * FROM ci_runs WHERE repo_name = ? ORDER BY id DESC LIMIT ?",
    );
    return stmt.all(repoName, limit) as CIRun[];
  }
  const stmt = db.prepare("SELECT * FROM ci_runs ORDER BY id DESC LIMIT ?");
  return stmt.all(limit) as CIRun[];
}

export function storeBundle(bundle: PatchBundle): boolean {
  try {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO bundles (hash, repo_name, base_commit, head_commit, raw_bytes, compressed_bytes, payload_base64, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      bundle.header.hash,
      bundle.header.repoName,
      bundle.header.baseCommit,
      bundle.header.headCommit,
      bundle.header.rawBytes,
      bundle.header.compressedBytes,
      bundle.patchZstdBase64,
      now,
    );
    return true;
  } catch {
    return false;
  }
}

export function getBundle(hash: string): PatchBundle | null {
  const stmt = db.prepare("SELECT * FROM bundles WHERE hash = ?");
  const row = stmt.get(hash) as any;
  if (!row) return null;

  return {
    header: {
      version: 1,
      hash: row.hash,
      repoName: row.repo_name,
      baseCommit: row.base_commit,
      headCommit: row.head_commit,
      timestamp: new Date(row.created_at).getTime(),
      filesCount: 1,
      rawBytes: row.raw_bytes,
      compressedBytes: row.compressed_bytes,
    },
    patchZstdBase64: row.payload_base64,
  };
}

export function listBundles(limit: number = 20): any[] {
  const stmt = db.prepare(
    "SELECT id, hash, repo_name, base_commit, head_commit, raw_bytes, compressed_bytes, created_at FROM bundles ORDER BY id DESC LIMIT ?",
  );
  return stmt.all(limit);
}
