// Sovereign VCS Adapter: Jujutsu (jj), Gitoxide (gix), and Git integration
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { RepoInfo, StackCommit, PatchBundle } from "./types.ts";
import { blake3, zstdCompress, zstdDecompress } from "./crypto.ts";

function safeExec(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10000,
    }).trim();
  } catch {
    return "";
  }
}

function getDirectorySize(dirPath: string): number {
  let total = 0;
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += getDirectorySize(full);
      } else if (entry.isFile()) {
        try {
          total += statSync(full).size;
        } catch {
          // Ignore transient/locked files
        }
      }
    }
  } catch {
    // Ignore unreadable dirs
  }
  return total;
}

export function isVcsRepo(dir: string): boolean {
  return existsSync(join(dir, ".git")) || existsSync(join(dir, ".jj"));
}

export function inspectRepo(dir: string, name?: string): RepoInfo | null {
  if (!isVcsRepo(dir)) return null;
  const repoName = name || dir.split(/[\\/]/).pop() || "unknown";
  const hasJj = existsSync(join(dir, ".jj"));

  // Combined status command: gets branch and changed files in a single process spawn
  const statusOutput = safeExec("git status --porcelain=v1 -b", dir);
  let branch = "main";
  let modifiedFiles = 0;
  let untrackedFiles = 0;

  if (statusOutput) {
    const lines = statusOutput.split(/\r?\n/).filter(Boolean);
    const branchLine = lines[0] || "";
    if (branchLine.startsWith("##")) {
      const match = branchLine.match(/^##\s+([^.\s]+)/);
      if (match && match[1]) {
        branch = match[1];
      } else if (branchLine.includes("No commits yet on")) {
        branch = branchLine.split("No commits yet on").pop()?.trim() || "main";
      }
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("??")) {
        untrackedFiles++;
      } else {
        modifiedFiles++;
      }
    }
  }

  // Combined commit info: gets HEAD SHA and message in a single process spawn
  const logOutput = safeExec('git log -1 --pretty=format:"%H||%s"', dir);
  let headCommit = "0000000000000000000000000000000000000000";
  let headMessage = "Initial commit";

  if (logOutput) {
    const [sha, msg] = logOutput.split("||");
    if (sha) headCommit = sha;
    if (msg) headMessage = msg;
  }

  return {
    name: repoName,
    path: dir,
    branch,
    headCommit,
    headMessage,
    isClean: modifiedFiles === 0 && untrackedFiles === 0,
    hasJj,
    modifiedFiles,
    untrackedFiles,
    lastChecked: new Date().toISOString(),
  };
}

export function scanMonorepoRepos(srcRoot: string = "C:\\src"): RepoInfo[] {
  const repos: RepoInfo[] = [];
  const knownNested = ["vcs", "vercel", "cloudflare", "microsoft"];
  try {
    const topLevel = readdirSync(srcRoot, { withFileTypes: true });
    for (const entry of topLevel) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

      const fullPath = join(srcRoot, entry.name);
      if (knownNested.includes(entry.name)) {
        try {
          const subDirs = readdirSync(fullPath, { withFileTypes: true });
          for (const sub of subDirs) {
            if (!sub.isDirectory() || sub.name.startsWith(".")) continue;
            const subPath = join(fullPath, sub.name);
            if (isVcsRepo(subPath)) {
              const info = inspectRepo(subPath, `${entry.name}/${sub.name}`);
              if (info) repos.push(info);
            }
          }
        } catch {
          // Skip inaccessible subfolders
        }
      } else if (isVcsRepo(fullPath)) {
        const info = inspectRepo(fullPath, entry.name);
        if (info) repos.push(info);
      }
    }
  } catch {
    // Return empty on failure
  }
  return repos;
}

export function getRepoStacks(repoPath: string): StackCommit[] {
  const hasJj = existsSync(join(repoPath, ".jj"));

  if (hasJj) {
    try {
      const template =
        'commit_id ++ "||" ++ change_id ++ "||" ++ author.name() ++ "||" ++ committer.timestamp() ++ "||" ++ description.first_line() ++ "||" ++ current_working_copy ++ "||" ++ immutable ++ "||" ++ conflict ++ "\\n"';
      const out = safeExec(
        `jj log -r "ancestors(@, 8)" --no-graph -T '${template}'`,
        repoPath,
      );
      if (out) {
        const rows = out.split(/\r?\n/).filter(Boolean);
        const commits: StackCommit[] = [];
        for (const row of rows) {
          const parts = row.split("||");
          if (parts.length >= 8) {
            commits.push({
              commitSha: parts[0] || "",
              changeId: parts[1] || "",
              author: parts[2] || "aphrody-dev",
              timestamp: parts[3] || new Date().toISOString(),
              description: parts[4] || "(no description)",
              isWorkingCopy: parts[5] === "true",
              isImmutable: parts[6] === "true",
              hasConflict: parts[7] === "true",
            });
          }
        }
        if (commits.length > 0) return commits;
      }
    } catch {
      // Fallback to git
    }
  }

  // Git log fallback
  const gitLog = safeExec(
    'git log -n 8 --pretty=format:"%H||%an||%ad||%s"',
    repoPath,
  );
  if (!gitLog) return [];

  return gitLog
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, idx) => {
      const parts = line.split("||");
      const sha = parts[0] || "";
      return {
        commitSha: sha,
        changeId: sha.substring(0, 12),
        author: parts[1] || "developer",
        timestamp: parts[2] || new Date().toISOString(),
        description: parts[3] || "(no message)",
        isWorkingCopy: idx === 0,
        isImmutable: false,
        hasConflict: false,
      };
    });
}

export function getRepoDiff(repoPath: string, commit?: string): string {
  if (commit) {
    return safeExec(`git show ${commit} --stat -p`, repoPath);
  }
  return safeExec("git diff HEAD", repoPath) || safeExec("git diff", repoPath);
}

export function slimRepo(repoPath: string): {
  bytesBefore: number;
  bytesAfter: number;
  savedBytes: number;
} {
  const gitDir = join(repoPath, ".git");
  if (!existsSync(gitDir)) {
    return { bytesBefore: 0, bytesAfter: 0, savedBytes: 0 };
  }

  const bytesBefore = getDirectorySize(gitDir);
  safeExec("git reflog expire --expire=now --all", repoPath);
  safeExec("git commit-graph write --reachable", repoPath);
  safeExec("git multi-pack-index write", repoPath);
  safeExec("git prune --expire=now", repoPath);
  const bytesAfter = getDirectorySize(gitDir);
  const savedBytes = Math.max(0, bytesBefore - bytesAfter);

  return { bytesBefore, bytesAfter, savedBytes };
}

export function createPatchBundle(
  repoPath: string,
  repoName: string,
  baseRef: string = "HEAD~1",
): PatchBundle {
  const headSha = safeExec("git rev-parse HEAD", repoPath) || "HEAD";
  let baseSha = safeExec(`git rev-parse ${baseRef}`, repoPath);
  if (!baseSha || baseSha === headSha) {
    baseSha = headSha;
  }

  let patchRaw = safeExec(`git diff ${baseSha}..${headSha}`, repoPath);
  if (!patchRaw) {
    patchRaw = safeExec("git diff HEAD", repoPath);
  }
  if (!patchRaw) {
    patchRaw = `# Forge Empty Patch for ${repoName}\n`;
  }

  const rawBytes = Buffer.byteLength(patchRaw, "utf-8");
  const compressed = zstdCompress(patchRaw);
  const hash = blake3(compressed);

  const status = safeExec("git status --porcelain", repoPath);
  const filesCount = status ? status.split(/\r?\n/).filter(Boolean).length : 1;

  return {
    header: {
      version: 1,
      hash,
      repoName,
      baseCommit: baseSha,
      headCommit: headSha,
      timestamp: Date.now(),
      filesCount,
      rawBytes,
      compressedBytes: compressed.length,
    },
    patchZstdBase64: compressed.toString("base64"),
  };
}

export function applyPatchBundle(
  repoPath: string,
  bundle: PatchBundle,
): { success: boolean; message: string } {
  const compressed = Buffer.from(bundle.patchZstdBase64, "base64");
  const computedHash = blake3(compressed);

  if (computedHash !== bundle.header.hash) {
    return {
      success: false,
      message: `Integrity check failed: Blake3 mismatch (${computedHash} vs ${bundle.header.hash})`,
    };
  }

  const patchBuf = zstdDecompress(compressed);
  const patchText = patchBuf.toString("utf-8");

  if (!patchText.trim() || patchText.startsWith("# Forge Empty Patch")) {
    return {
      success: true,
      message: "Empty patch bundle applied cleanly (no changes).",
    };
  }

  const tmpPatch = join(repoPath, `.forge_patch_${Date.now()}.patch`);
  try {
    Bun.write(tmpPatch, patchText);
    const applyOut = safeExec(
      `git apply --whitespace=fix "${tmpPatch}"`,
      repoPath,
    );
    return {
      success: true,
      message: `Patch applied successfully: ${applyOut || "Clean"}`,
    };
  } catch (err: any) {
    return { success: false, message: `git apply failed: ${err.message}` };
  } finally {
    try {
      if (existsSync(tmpPatch)) {
        execSync(`powershell -Command "Remove-Item -Force '${tmpPatch}'"`, {
          stdio: "ignore",
        });
      }
    } catch {
      // Ignore cleanup error
    }
  }
}
