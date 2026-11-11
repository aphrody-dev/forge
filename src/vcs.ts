// Sovereign VCS Adapter: Jujutsu (jj), Gitoxide (gix), and Git integration
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
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

function resolveGitDir(repoDir: string): string | null {
  const dotGit = join(repoDir, ".git");
  if (!existsSync(dotGit)) return null;
  try {
    const st = statSync(dotGit);
    if (st.isDirectory()) return dotGit;
    if (st.isFile()) {
      const content = readFileSync(dotGit, "utf-8").trim();
      const m = content.match(/^gitdir:\s*(.+)$/);
      if (m && m[1]) {
        return join(repoDir, m[1].trim());
      }
    }
  } catch {
    // Ignore
  }
  return null;
}

function readHeadFast(repoDir: string): { branch: string; sha: string } | null {
  const gitDir = resolveGitDir(repoDir);
  if (!gitDir) return null;
  try {
    const headRaw = readFileSync(join(gitDir, "HEAD"), "utf-8").trim();
    if (headRaw.startsWith("ref:")) {
      const refPath = headRaw.replace(/^ref:\s*/, "").trim();
      const branch = refPath.replace(/^refs\/heads\//, "");
      const looseRef = join(gitDir, refPath);
      if (existsSync(looseRef)) {
        const sha = readFileSync(looseRef, "utf-8").trim();
        if (/^[0-9a-f]{40}$/i.test(sha)) return { branch, sha };
      }
      const packedRefs = join(gitDir, "packed-refs");
      if (existsSync(packedRefs)) {
        for (const line of readFileSync(packedRefs, "utf-8").split(/\r?\n/)) {
          if (line.endsWith(` ${refPath}`)) {
            const sha = line.split(/\s+/)[0] || "";
            if (/^[0-9a-f]{40}$/i.test(sha)) return { branch, sha };
          }
        }
      }
      return { branch, sha: "" };
    }
    if (/^[0-9a-f]{40}$/i.test(headRaw)) {
      return { branch: "detached", sha: headRaw };
    }
  } catch {
    // Fallback to git CLI
  }
  return null;
}

export function inspectRepo(
  dir: string,
  name?: string,
  options?: { fast?: boolean },
): RepoInfo | null {
  if (!isVcsRepo(dir)) return null;
  const repoName = name || dir.split(/[\\/]/).pop() || "unknown";
  const hasJj = existsSync(join(dir, ".jj"));
  const fastHead = readHeadFast(dir);

  if (options?.fast && fastHead && fastHead.sha) {
    return {
      name: repoName,
      path: dir,
      branch: fastHead.branch,
      headCommit: fastHead.sha,
      headMessage: "HEAD",
      isClean: true,
      hasJj,
      modifiedFiles: 0,
      untrackedFiles: 0,
      lastChecked: new Date().toISOString(),
    };
  }

  // Combined status command (`--ignore-submodules=all` avoids O(N) nested submodule walks on root superproject)
  const statusOutput = safeExec(
    "git --no-optional-locks status --porcelain=v1 -b --ignore-submodules=all",
    dir,
  );
  let branch = fastHead?.branch || "main";
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
      if (line && line.startsWith("??")) {
        untrackedFiles++;
      } else {
        modifiedFiles++;
      }
    }
  }

  let headCommit = fastHead?.sha || "0000000000000000000000000000000000000000";
  let headMessage = "Initial commit";

  const logOutput = safeExec('git --no-optional-locks log -1 --pretty=format:"%H||%s"', dir);
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

function isReparseOrSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

export function scanMonorepoRepos(
  srcRoot: string = "C:\\src",
  options?: { includeThirdParty?: boolean; fast?: boolean },
): RepoInfo[] {
  const repos: RepoInfo[] = [];
  const seenPaths = new Set<string>();
  const fast = options?.fast;

  if (isVcsRepo(srcRoot)) {
    const rootInfo = inspectRepo(srcRoot, "src", { fast });
    if (rootInfo) {
      repos.push(rootInfo);
      seenPaths.add(srcRoot.toLowerCase());
    }
  }

  const canonicalTiers = ["apps", "packages", "crates", "tools"];
  for (const tier of canonicalTiers) {
    const tierPath = join(srcRoot, tier);
    if (!existsSync(tierPath) || isReparseOrSymlink(tierPath)) continue;
    try {
      const subDirs = readdirSync(tierPath, { withFileTypes: true });
      for (const sub of subDirs) {
        if (sub.name.startsWith(".")) continue;
        const subPath = join(tierPath, sub.name);
        if (isReparseOrSymlink(subPath) || !sub.isDirectory()) continue;
        if (isVcsRepo(subPath) && !seenPaths.has(subPath.toLowerCase())) {
          const info = inspectRepo(subPath, `${tier}/${sub.name}`, { fast });
          if (info) {
            repos.push(info);
            seenPaths.add(subPath.toLowerCase());
          }
        }
      }
    } catch {
      // Skip inaccessible subfolders
    }
  }

  const infraPath = join(srcRoot, "infra");
  if (existsSync(infraPath) && !isReparseOrSymlink(infraPath)) {
    if (isVcsRepo(infraPath) && !seenPaths.has(infraPath.toLowerCase())) {
      const info = inspectRepo(infraPath, "infra", { fast });
      if (info) {
        repos.push(info);
        seenPaths.add(infraPath.toLowerCase());
      }
    }
    const meshVnPath = join(infraPath, "mesh-vn");
    if (
      existsSync(meshVnPath) &&
      !isReparseOrSymlink(meshVnPath) &&
      isVcsRepo(meshVnPath) &&
      !seenPaths.has(meshVnPath.toLowerCase())
    ) {
      const info = inspectRepo(meshVnPath, "infra/mesh-vn", { fast });
      if (info) {
        repos.push(info);
        seenPaths.add(meshVnPath.toLowerCase());
      }
    }
  }

  if (options?.includeThirdParty) {
    const tpRoot = join(srcRoot, "third_party");
    const walkTp = (dir: string, depth: number) => {
      if (depth > 3 || !existsSync(dir) || isReparseOrSymlink(dir)) return;
      try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (
            entry.name.startsWith(".") ||
            entry.name === "node_modules" ||
            entry.name === "target" ||
            entry.name === "yolo-archive"
          ) {
            continue;
          }
          const p = join(dir, entry.name);
          if (isReparseOrSymlink(p) || !entry.isDirectory()) continue;
          if (isVcsRepo(p)) {
            if (!seenPaths.has(p.toLowerCase())) {
              const rel = p
                .substring(srcRoot.length)
                .replace(/^[\\/]+/, "")
                .replace(/\\/g, "/");
              const info = inspectRepo(p, rel, { fast: true });
              if (info) {
                repos.push(info);
                seenPaths.add(p.toLowerCase());
              }
            }
          } else {
            walkTp(p, depth + 1);
          }
        }
      } catch {
        // Ignore
      }
    };
    walkTp(tpRoot, 1);
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
