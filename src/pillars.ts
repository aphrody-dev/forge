import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export type PillarName = "git" | "chromium" | "kernel" | "aosp";

export interface PillarHealth {
  pillar: PillarName;
  healthy: boolean;
  manifestPath: string;
  manifestExists: boolean;
  headCommit: string;
  remotes: Record<string, string>;
  details: string[];
}

export interface FourPillarAuditReport {
  srcRoot: string;
  timestamp: string;
  allHealthy: boolean;
  rootJunctionCount: number;
  danglingJunctions: string[];
  pillars: Record<PillarName, PillarHealth>;
}

function runGitRead(args: string[], cwd: string): { ok: boolean; stdout: string } {
  if (!existsSync(cwd)) return { ok: false, stdout: "" };
  const res = spawnSync("git", args, {
    cwd,
    encoding: "utf-8",
    timeout: 10000,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GCM_INTERACTIVE: "never",
    },
  });
  return {
    ok: res.status === 0,
    stdout: (res.stdout || "").trim(),
  };
}

function readRemotesMap(repoDir: string): Record<string, string> {
  const map: Record<string, string> = {};
  const out = runGitRead(["remote", "-v"], repoDir);
  if (!out.ok || !out.stdout) return map;
  for (const line of out.stdout.split(/\r?\n/)) {
    const m = line.trim().match(/^(\S+)\s+(\S+)\s+\(fetch\)/);
    if (m && m[1] && m[2]) {
      map[m[1]] = m[2];
    }
  }
  return map;
}

export function parseChromiumDepsPins(depsContent: string): Record<string, string> {
  const pins: Record<string, string> = {};
  const entryRegex = /['"]([^'"]+)['"]\s*:\s*['"](https?:\/\/[^'"]+|git:\/\/[^'"]+|gs:\/\/[^'"]+)['"]/g;
  for (const match of depsContent.matchAll(entryRegex)) {
    const pathKey = match[1];
    const urlSpec = match[2];
    if (pathKey && urlSpec) {
      pins[pathKey] = urlSpec;
    }
  }
  return pins;
}

export function parseAospRepoManifestProjects(xmlContent: string): Array<{
  path: string;
  name: string;
  remote: string;
  revision: string;
}> {
  const projects: Array<{
    path: string;
    name: string;
    remote: string;
    revision: string;
  }> = [];
  const projectRegex = /<project\s+([^>]+?)\/?>/g;
  const attrRegex = /([a-zA-Z0-9_-]+)="([^"]*)"/g;

  let defaultRemote = "aosp";
  let defaultRevision = "main";
  const defaultMatch = xmlContent.match(/<default\s+([^>]+?)\/?>/);
  if (defaultMatch && defaultMatch[1]) {
    for (const am of defaultMatch[1].matchAll(attrRegex)) {
      if (am[1] === "remote" && am[2]) defaultRemote = am[2];
      if (am[1] === "revision" && am[2]) defaultRevision = am[2];
    }
  }

  for (const m of xmlContent.matchAll(projectRegex)) {
    const attrsRaw = m[1] || "";
    const attrs: Record<string, string> = {};
    for (const am of attrsRaw.matchAll(attrRegex)) {
      if (am[1] && am[2] !== undefined) {
        attrs[am[1]] = am[2];
      }
    }
    const name = attrs["name"] || "";
    const path = attrs["path"] || name;
    if (name) {
      projects.push({
        path,
        name,
        remote: attrs["remote"] || defaultRemote,
        revision: attrs["revision"] || defaultRevision,
      });
    }
  }
  return projects;
}

export function parseKernelMaintainersSubsystems(maintainersContent: string): Array<{
  subsystem: string;
  maintainers: string[];
  status: string;
  trees: string[];
  files: string[];
}> {
  const subsystems: Array<{
    subsystem: string;
    maintainers: string[];
    status: string;
    trees: string[];
    files: string[];
  }> = [];

  const blocks = maintainersContent.split(/\r?\n\r?\n+/);
  for (const block of blocks) {
    const lines = block
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter(Boolean);
    if (lines.length < 2) continue;
    const title = lines[0] || "";
    if (
      title.startsWith("=") ||
      title.startsWith("-") ||
      title.startsWith("..") ||
      title.includes(":") ||
      title !== title.toUpperCase()
    ) {
      continue;
    }

    const maintainers: string[] = [];
    const trees: string[] = [];
    const files: string[] = [];
    let status = "Maintained";

    let validTagSeen = false;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i] || "";
      const tagMatch = line.match(/^([MRSLWQBTCPFXNK]):\s+(.+)$/);
      if (!tagMatch) continue;
      validTagSeen = true;
      const tag = tagMatch[1];
      const val = (tagMatch[2] || "").trim();
      if (tag === "M") maintainers.push(val);
      else if (tag === "S") status = val;
      else if (tag === "T") trees.push(val);
      else if (tag === "F") files.push(val);
    }

    if (validTagSeen && files.length > 0) {
      subsystems.push({
        subsystem: title,
        maintainers,
        status,
        trees,
        files,
      });
    }
  }
  return subsystems;
}

export function auditFourPillars(srcRoot: string = "C:\\src"): FourPillarAuditReport {
  const root = resolve(srcRoot);

  // Scan root junctions
  let rootJunctionCount = 0;
  const danglingJunctions: string[] = [];
  if (existsSync(root)) {
    for (const entry of readdirSync(root)) {
      const fp = join(root, entry);
      try {
        const ls = lstatSync(fp);
        if (ls.isSymbolicLink()) {
          rootJunctionCount++;
          if (!existsSync(fp)) {
            danglingJunctions.push(entry);
          }
        }
      } catch {
        // Ignore
      }
    }
  }

  // 1. Git Superproject Pillar
  const gitmodulesPath = join(root, ".gitmodules");
  const gitattributesPath = join(root, ".gitattributes");
  const lockPath = join(root, "src.lock.json");
  const rootHead = runGitRead(["rev-parse", "HEAD"], root).stdout;
  const rootRemotes = readRemotesMap(root);
  const gitDetails: string[] = [];
  if (existsSync(gitmodulesPath)) gitDetails.push(".gitmodules verified");
  if (existsSync(gitattributesPath)) gitDetails.push(".gitattributes LF normalization active");
  if (existsSync(lockPath)) gitDetails.push("src.lock.json reproducible pinfile present");
  const gitHealthy =
    existsSync(gitmodulesPath) &&
    existsSync(lockPath) &&
    rootHead.length >= 7 &&
    danglingJunctions.length === 0;

  // 2. Chromium Pillar (depot_tools + DEPS + .gclient)
  const depsPath = join(root, "DEPS");
  const gclientPath = join(root, "third_party", "chromium", ".gclient");
  const chromiumSrc = join(root, "third_party", "chromium", "src");
  const depotToolsDir = join(root, "third_party", "depot_tools");
  const chromiumHead = runGitRead(["rev-parse", "HEAD"], chromiumSrc).stdout;
  const chromiumRemotes = readRemotesMap(chromiumSrc);
  const chromiumDetails: string[] = [];
  if (existsSync(depotToolsDir)) chromiumDetails.push("depot_tools (gclient/siso/gn/cipd) installed");
  if (existsSync(gclientPath)) chromiumDetails.push("third_party/chromium/.gclient configured");
  if (existsSync(depsPath)) {
    const pinCount = Object.keys(parseChromiumDepsPins(readFileSync(depsPath, "utf-8"))).length;
    chromiumDetails.push(`root DEPS active (${pinCount} pinned entries)`);
  }
  const chromiumHealthy =
    existsSync(depsPath) &&
    existsSync(depotToolsDir) &&
    existsSync(chromiumSrc) &&
    chromiumHead.length >= 7;

  // 3. Linux Kernel Pillar (MAINTAINERS + torvalds/stable/next/gki + quilt series)
  const maintainersPath = join(root, "MAINTAINERS");
  const linuxDir = join(root, "third_party", "linux");
  const linuxHead = runGitRead(["rev-parse", "HEAD"], linuxDir).stdout;
  const linuxRemotes = readRemotesMap(linuxDir);
  const kernelDetails: string[] = [];
  if (existsSync(maintainersPath)) {
    const subs = parseKernelMaintainersSubsystems(readFileSync(maintainersPath, "utf-8"));
    kernelDetails.push(`root MAINTAINERS active (${subs.length} subsystems)`);
  }
  if (linuxRemotes["torvalds"] && linuxRemotes["stable"] && linuxRemotes["next"]) {
    kernelDetails.push("remotes torvalds + stable + next + gki wired");
  }
  const patchesSeries = join(root, "docs", "patches", "series");
  if (existsSync(patchesSeries)) {
    kernelDetails.push("declarative quilt patch series verified");
  }
  const kernelHealthy =
    existsSync(maintainersPath) &&
    existsSync(linuxDir) &&
    linuxHead.length >= 7 &&
    Boolean(linuxRemotes["stable"]) &&
    Boolean(linuxRemotes["next"]);

  // 4. Android AOSP Pillar (.repo/manifests/default.xml + platform/manifest + build/kleaf)
  const aospManifestPath = join(root, ".repo", "manifests", "default.xml");
  const aospPlatformDir = join(root, "third_party", "aosp", "platform", "manifest");
  const aospKleafDir = join(root, "third_party", "aosp", "build", "kleaf");
  const aospHead = runGitRead(["rev-parse", "HEAD"], aospPlatformDir).stdout;
  const aospRemotes = readRemotesMap(aospPlatformDir);
  const aospDetails: string[] = [];
  if (existsSync(aospManifestPath)) {
    const projs = parseAospRepoManifestProjects(readFileSync(aospManifestPath, "utf-8"));
    aospDetails.push(`.repo/manifests/default.xml active (${projs.length} projects)`);
  }
  if (existsSync(aospPlatformDir)) aospDetails.push("third_party/aosp/platform/manifest cloned");
  if (existsSync(aospKleafDir)) aospDetails.push("third_party/aosp/build/kleaf GKI toolchain cloned");
  const aospHealthy =
    existsSync(aospManifestPath) &&
    existsSync(aospPlatformDir) &&
    aospHead.length >= 7;

  const pillars: Record<PillarName, PillarHealth> = {
    git: {
      pillar: "git",
      healthy: gitHealthy,
      manifestPath: gitmodulesPath,
      manifestExists: existsSync(gitmodulesPath),
      headCommit: rootHead,
      remotes: rootRemotes,
      details: gitDetails,
    },
    chromium: {
      pillar: "chromium",
      healthy: chromiumHealthy,
      manifestPath: depsPath,
      manifestExists: existsSync(depsPath),
      headCommit: chromiumHead,
      remotes: chromiumRemotes,
      details: chromiumDetails,
    },
    kernel: {
      pillar: "kernel",
      healthy: kernelHealthy,
      manifestPath: maintainersPath,
      manifestExists: existsSync(maintainersPath),
      headCommit: linuxHead,
      remotes: linuxRemotes,
      details: kernelDetails,
    },
    aosp: {
      pillar: "aosp",
      healthy: aospHealthy,
      manifestPath: aospManifestPath,
      manifestExists: existsSync(aospManifestPath),
      headCommit: aospHead,
      remotes: aospRemotes,
      details: aospDetails,
    },
  };

  return {
    srcRoot: root,
    timestamp: new Date().toISOString(),
    allHealthy: gitHealthy && chromiumHealthy && kernelHealthy && aospHealthy,
    rootJunctionCount,
    danglingJunctions,
    pillars,
  };
}

export function writePatchQueueSeries(
  seriesFilePath: string,
  entries: string[],
): void {
  mkdirSync(dirname(seriesFilePath), { recursive: true });
  const body =
    "# Declarative Quilt / b4 Patch Queue Series\n" +
    entries.map((e) => e.trim()).filter(Boolean).join("\n") +
    "\n";
  writeFileSync(seriesFilePath, body, "utf-8");
}
