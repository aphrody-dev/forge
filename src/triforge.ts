// Sovereign Tri-Forge (GitHub + GitLab + Google Git) & Arch/CachyOS/Omarchy Upstream Engine
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type {
  ForgeTarget,
  RemoteAuditEntry,
  TriForgeRepoSpec,
  TriSyncRepoResult,
  UpstreamDistroRepo,
  UpstreamSyncStatus,
} from "./types.ts";

export interface TriForgeConfig {
  srcRoot: string;
  githubOrg: string;
  gitlabBaseUrl: string;
  gitlabGroup: string;
  gitlabSelfBaseUrl: string;
  gitlabSelfGroup: string;
  orgOwnerEmail: string;
  gcpProjectId: string;
  gcpProjectNumber: string;
  gcpRegion: string;
  developerConnectId: string;
}

export function getDefaultTriForgeConfig(
  srcRoot: string = "C:\\src",
): TriForgeConfig {
  const gitlabBaseUrl = (
    process.env.GITLAB_BASE_URL || "https://gitlab.com"
  ).replace(/\/+$/, "");
  const gitlabGroup = process.env.GITLAB_GROUP || "aphrody-dev";
  const gitlabSelfBaseUrl = (
    process.env.GITLAB_SELF_BASE_URL || "https://git.aphrody.com"
  ).replace(/\/+$/, "");
  const gitlabSelfGroup = process.env.GITLAB_SELF_GROUP || "aphrody";
  const githubOrg = process.env.GITHUB_ORG || "aphrody-dev";
  const orgOwnerEmail = process.env.APHRODY_ORG_EMAIL || "contact@aphrody.com";
  const gcpProjectId = process.env.GCP_PROJECT_ID || "aphrody";
  const gcpProjectNumber = process.env.GCP_PROJECT_NUMBER || "468000409790";
  const gcpRegion = process.env.GCP_REGION || "europe-west1";
  const developerConnectId =
    process.env.GCP_DEVELOPER_CONNECT_ID || "aphrody-triforge";

  return {
    srcRoot,
    githubOrg,
    gitlabBaseUrl,
    gitlabGroup,
    gitlabSelfBaseUrl,
    gitlabSelfGroup,
    orgOwnerEmail,
    gcpProjectId,
    gcpProjectNumber,
    gcpRegion,
    developerConnectId,
  };
}

/**
 * Canonical 26-repository inventory for C:\src (root `src` + 25 submodules).
 * All repositories use clean unprefixed names under `aphrody-dev/<name>`.
 */
export const CANONICAL_MONOREPO_SUBMODULES: ReadonlyArray<{
  name: string;
  relPath: string;
  tier: TriForgeRepoSpec["tier"];
}> = [
  { name: "src", relPath: ".", tier: "root" },
  { name: "aphrody", relPath: "apps/aphrody", tier: "apps" },
  { name: "aphrody-app", relPath: "apps/aphrody-app", tier: "apps" },
  { name: "shenron", relPath: "apps/shenron", tier: "apps" },
  { name: "rosegriffon", relPath: "apps/rosegriffon", tier: "apps" },
  { name: "ai-os", relPath: "packages/ai-os", tier: "packages" },
  { name: "ai-triad", relPath: "packages/ai-triad", tier: "packages" },
  { name: "brain", relPath: "packages/brain", tier: "packages" },
  { name: "bun-parity", relPath: "packages/bun-parity", tier: "packages" },
  { name: "bun-plugins", relPath: "packages/bun-plugins", tier: "packages" },
  { name: "chromium-bun", relPath: "packages/chromium-bun", tier: "packages" },
  { name: "env-kit", relPath: "packages/env-kit", tier: "packages" },
  { name: "forge", relPath: "packages/forge", tier: "packages" },
  {
    name: "google-design",
    relPath: "packages/google-design",
    tier: "packages",
  },
  {
    name: "knowledge-engine",
    relPath: "packages/knowledge-engine",
    tier: "packages",
  },
  { name: "pi-opencode", relPath: "packages/pi-opencode", tier: "packages" },
  { name: "wck", relPath: "packages/wck", tier: "packages" },
  { name: "bench", relPath: "crates/bench", tier: "crates" },
  { name: "depot", relPath: "crates/depot", tier: "crates" },
  { name: "gamescope-rs", relPath: "crates/gamescope-rs", tier: "crates" },
  { name: "ring3-agent", relPath: "crates/ring3-agent", tier: "crates" },
  { name: "rust-stack", relPath: "crates/rust-stack", tier: "crates" },
  { name: "unix", relPath: "crates/unix", tier: "crates" },
  { name: "wayland", relPath: "crates/wayland", tier: "crates" },
  { name: "xtask", relPath: "crates/xtask", tier: "crates" },
  { name: "infra", relPath: "infra", tier: "infra" },
];

/**
 * Upstream Linux Distro Forge Registry tracking Arch Linux GitLab, CachyOS, and Omacom/Omarchy.
 */
export const ARCH_CACHY_OMARCHY_UPSTREAMS: ReadonlyArray<UpstreamDistroRepo> = [
  {
    id: "archlinux/devtools",
    ecosystem: "archlinux",
    upstreamPath: "archlinux/devtools",
    upstreamUrl: "https://gitlab.archlinux.org/archlinux/devtools.git",
    localRelPath: "third_party/archlinux/devtools",
    description: "Arch Linux clean-chroot package build tools (pkgctl)",
  },
  {
    id: "archlinux/mkinitcpio",
    ecosystem: "archlinux",
    upstreamPath: "archlinux/mkinitcpio/mkinitcpio",
    upstreamUrl:
      "https://gitlab.archlinux.org/archlinux/mkinitcpio/mkinitcpio.git",
    localRelPath: "third_party/archlinux/mkinitcpio",
    description: "Modular initramfs image creation utility",
  },
  {
    id: "archlinux/archinstall",
    ecosystem: "archlinux",
    upstreamPath: "archlinux/archinstall",
    upstreamUrl: "https://gitlab.archlinux.org/archlinux/archinstall.git",
    localRelPath: "third_party/archlinux/archinstall",
    description: "Automated Arch Linux installer library and profiles",
  },
  {
    id: "archlinux/archlinux-wsl",
    ecosystem: "archlinux",
    upstreamPath: "archlinux/archlinux-wsl",
    upstreamUrl: "https://gitlab.archlinux.org/archlinux/archlinux-wsl.git",
    localRelPath: "third_party/archlinux/archlinux-wsl",
    description: "Official Arch Linux WSL2 rootfs image builder",
  },
  {
    id: "archlinux/pacman",
    ecosystem: "archlinux",
    upstreamPath: "pacman/pacman",
    upstreamUrl: "https://gitlab.archlinux.org/pacman/pacman.git",
    localRelPath: "third_party/archlinux/pacman",
    description: "Pacman package manager and makepkg build engine",
  },
  {
    id: "archlinux/packaging/packages/linux",
    ecosystem: "archlinux",
    upstreamPath: "archlinux/packaging/packages/linux",
    upstreamUrl:
      "https://gitlab.archlinux.org/archlinux/packaging/packages/linux.git",
    localRelPath: "third_party/archlinux/pkg-linux",
    description: "Arch Linux mainline kernel PKGBUILD",
  },
  {
    id: "archlinux/packaging/packages/hyprland",
    ecosystem: "archlinux",
    upstreamPath: "archlinux/packaging/packages/hyprland",
    upstreamUrl:
      "https://gitlab.archlinux.org/archlinux/packaging/packages/hyprland.git",
    localRelPath: "third_party/archlinux/pkg-hyprland",
    description: "Arch Linux Hyprland Wayland compositor packaging",
  },
  {
    id: "archlinux/packaging/packages/cosmic-session",
    ecosystem: "archlinux",
    upstreamPath: "archlinux/packaging/packages/cosmic-session",
    upstreamUrl:
      "https://gitlab.archlinux.org/archlinux/packaging/packages/cosmic-session.git",
    localRelPath: "third_party/archlinux/pkg-cosmic-session",
    description: "Arch Linux COSMIC desktop session packaging",
  },
  {
    id: "cachyos/cachyos-wsl",
    ecosystem: "cachyos",
    upstreamPath: "CachyOS/cachyos-wsl",
    upstreamUrl: "https://github.com/CachyOS/cachyos-wsl.git",
    localRelPath: "third_party/cachyos/cachyos-wsl",
    description: "CachyOS x86-64-v3/v4 optimized WSL2 distribution",
  },
  {
    id: "cachyos/kernel-patches",
    ecosystem: "cachyos",
    upstreamPath: "CachyOS/kernel-patches",
    upstreamUrl: "https://github.com/CachyOS/kernel-patches.git",
    localRelPath: "third_party/cachyos/kernel-patches",
    description: "CachyOS BORE/sched-ext Linux kernel patchset",
  },
  {
    id: "cachyos/CachyOS-PKGBUILDS",
    ecosystem: "cachyos",
    upstreamPath: "CachyOS/CachyOS-PKGBUILDS",
    upstreamUrl: "https://github.com/CachyOS/CachyOS-PKGBUILDS.git",
    localRelPath: "third_party/cachyos/CachyOS-PKGBUILDS",
    description: "CachyOS optimized PKGBUILD tree (LTO, PGO, v3/v4)",
  },
  {
    id: "cachyos/cachyos-hyprland-settings",
    ecosystem: "cachyos",
    upstreamPath: "CachyOS/cachyos-hyprland-settings",
    upstreamUrl: "https://github.com/CachyOS/cachyos-hyprland-settings.git",
    localRelPath: "third_party/cachyos/cachyos-hyprland-settings",
    description: "CachyOS Hyprland configuration & dotfiles",
  },
  {
    id: "omacom/omarchy",
    ecosystem: "omacom",
    upstreamPath: "omacom/omarchy",
    upstreamUrl: "https://github.com/omacom/omarchy.git",
    localRelPath: "third_party/omacom/omarchy",
    description: "Omarchy opinionated Arch + Hyprland developer workstation",
  },
  {
    id: "omacom/try-omarchy-windows",
    ecosystem: "omacom",
    upstreamPath: "omacom/try-omarchy-windows",
    upstreamUrl: "https://github.com/omacom/try-omarchy-windows.git",
    localRelPath: "third_party/omacom/try-omarchy-windows",
    description: "Omarchy Windows WSL2 provisioning & host integration",
  },
  {
    id: "omacom/aether",
    ecosystem: "omacom",
    upstreamPath: "omacom/aether",
    upstreamUrl: "https://github.com/omacom/aether.git",
    localRelPath: "third_party/omacom/aether",
    description: "Omacom Aether theme and desktop shell utilities",
  },
  {
    id: "omacom/omarchy-pkgs",
    ecosystem: "omacom",
    upstreamPath: "omacom/omarchy-pkgs",
    upstreamUrl: "https://github.com/omacom/omarchy-pkgs.git",
    localRelPath: "third_party/omacom/omarchy-pkgs",
    description: "Omarchy custom Arch Linux PKGBUILD repository",
  },
  {
    id: "omacom/omarchy-plugin-marketplace",
    ecosystem: "omacom",
    upstreamPath: "omacom/omarchy-plugin-marketplace",
    upstreamUrl: "https://github.com/omacom/omarchy-plugin-marketplace.git",
    localRelPath: "third_party/omacom/omarchy-plugin-marketplace",
    description: "Omarchy plugin index and extension registry",
  },
];

function inferTier(relPath: string): TriForgeRepoSpec["tier"] {
  if (relPath === "." || relPath === "") return "root";
  if (relPath.startsWith("apps/")) return "apps";
  if (relPath.startsWith("packages/")) return "packages";
  if (relPath.startsWith("crates/")) return "crates";
  return "infra";
}

export function synthesizeRepoUrls(
  repoName: string,
  relPath: string,
  config: TriForgeConfig = getDefaultTriForgeConfig(),
): TriForgeRepoSpec {
  const cleanName =
    repoName
      .replace(/\.git$/, "")
      .split("/")
      .pop() || repoName;
  const absPath =
    relPath === "."
      ? resolve(config.srcRoot)
      : resolve(config.srcRoot, relPath);

  return {
    name: cleanName,
    relPath,
    absPath,
    tier: inferTier(relPath),
    githubUrl: `https://github.com/${config.githubOrg}/${cleanName}.git`,
    gitlabUrl: `${config.gitlabBaseUrl}/${config.gitlabGroup}/${cleanName}.git`,
    gitlabSelfUrl: `${config.gitlabSelfBaseUrl}/${config.gitlabSelfGroup}/${cleanName}.git`,
    googleUrl: `https://source.developers.google.com/p/${config.gcpProjectId}/r/${cleanName}`,
    developerConnectUri: `projects/${config.gcpProjectId}/locations/${config.gcpRegion}/connections/${config.developerConnectId}/gitRepositoryLinks/${cleanName}`,
    defaultBranch: "main",
  };
}

export function parseGitmodules(gitmodulesContent: string): Array<{
  submoduleKey: string;
  relPath: string;
  url: string;
  branch: string;
  cleanName: string;
}> {
  const entries: Array<{
    submoduleKey: string;
    relPath: string;
    url: string;
    branch: string;
    cleanName: string;
  }> = [];

  let currentKey = "";
  let currentPath = "";
  let currentUrl = "";
  let currentBranch = "main";

  const flush = () => {
    if (currentKey && currentPath) {
      const cleanName =
        currentPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() ||
        currentPath;
      entries.push({
        submoduleKey: currentKey,
        relPath: currentPath.replace(/\\/g, "/"),
        url: currentUrl,
        branch: currentBranch || "main",
        cleanName,
      });
    }
  };

  for (const rawLine of gitmodulesContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    const headerMatch = line.match(/^\[submodule\s+"([^"]+)"\]$/);
    if (headerMatch) {
      flush();
      currentKey = headerMatch[1] || "";
      currentPath = "";
      currentUrl = "";
      currentBranch = "main";
      continue;
    }
    const kvMatch = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      const val = (kvMatch[2] || "").trim();
      if (key === "path") currentPath = val;
      else if (key === "url") currentUrl = val;
      else if (key === "branch") currentBranch = val;
    }
  }
  flush();
  return entries;
}

export function discoverTriForgeInventory(
  config: TriForgeConfig = getDefaultTriForgeConfig(),
): TriForgeRepoSpec[] {
  const specs: TriForgeRepoSpec[] = [];
  const seenNames = new Set<string>();

  // 1. Root repository (`src`)
  const rootSpec = synthesizeRepoUrls("src", ".", config);
  specs.push(rootSpec);
  seenNames.add(rootSpec.name);

  // 2. Discover from .gitmodules if present, otherwise fallback to canonical table
  const gitmodulesPath = join(config.srcRoot, ".gitmodules");
  if (existsSync(gitmodulesPath)) {
    const raw = readFileSync(gitmodulesPath, "utf-8");
    const parsed = parseGitmodules(raw);
    for (const sub of parsed) {
      if (seenNames.has(sub.cleanName)) continue;
      const spec = synthesizeRepoUrls(sub.cleanName, sub.relPath, config);
      spec.defaultBranch = sub.branch || "main";
      specs.push(spec);
      seenNames.add(spec.name);
    }
  } else {
    for (const item of CANONICAL_MONOREPO_SUBMODULES) {
      if (seenNames.has(item.name)) continue;
      specs.push(synthesizeRepoUrls(item.name, item.relPath, config));
      seenNames.add(item.name);
    }
  }

  return specs;
}

function runGit(
  args: string[],
  cwd: string,
  timeoutMs: number = 15000,
): { ok: boolean; stdout: string; stderr: string; status: number } {
  const res = spawnSync("git", args, {
    cwd,
    encoding: "utf-8",
    timeout: timeoutMs,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GCM_INTERACTIVE: "never",
    },
  });
  return {
    ok: res.status === 0,
    stdout: (res.stdout || "").trim(),
    stderr: (res.stderr || "").trim(),
    status: res.status ?? 1,
  };
}

export function getGitRemotes(repoPath: string): {
  fetchRemotes: Record<string, string>;
  pushUrlsByRemote: Record<string, string[]>;
} {
  const fetchRemotes: Record<string, string> = {};
  const pushUrlsByRemote: Record<string, string[]> = {};

  if (!existsSync(repoPath)) {
    return { fetchRemotes, pushUrlsByRemote };
  }

  const out = runGit(["remote", "-v"], repoPath);
  if (!out.ok || !out.stdout) {
    return { fetchRemotes, pushUrlsByRemote };
  }

  for (const line of out.stdout.split(/\r?\n/)) {
    const m = line.trim().match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (!m) continue;
    const name = m[1] || "";
    const url = m[2] || "";
    const kind = m[3] || "";
    if (kind === "fetch") {
      fetchRemotes[name] = url;
    } else if (kind === "push") {
      if (!pushUrlsByRemote[name]) pushUrlsByRemote[name] = [];
      if (!pushUrlsByRemote[name].includes(url)) {
        pushUrlsByRemote[name].push(url);
      }
    }
  }
  return { fetchRemotes, pushUrlsByRemote };
}

function ensureRemoteUrl(
  repoPath: string,
  remoteName: string,
  targetUrl: string,
  existingFetchRemotes: Record<string, string>,
): string | null {
  const current = existingFetchRemotes[remoteName];
  if (!current) {
    const res = runGit(["remote", "add", remoteName, targetUrl], repoPath);
    return res.ok
      ? `added ${remoteName} -> ${targetUrl}`
      : `failed adding ${remoteName}: ${res.stderr}`;
  }
  if (current !== targetUrl) {
    const res = runGit(["remote", "set-url", remoteName, targetUrl], repoPath);
    return res.ok
      ? `updated ${remoteName} -> ${targetUrl}`
      : `failed updating ${remoteName}: ${res.stderr}`;
  }
  return null;
}

function ensureAllAggregateRemote(
  repoPath: string,
  urls: string[],
  existingFetchRemotes: Record<string, string>,
  existingPushUrls: string[],
): string | null {
  const primary = urls[0];
  if (!primary) return null;

  const sameSet =
    existingPushUrls.length === urls.length &&
    urls.every((u) => existingPushUrls.includes(u)) &&
    existingFetchRemotes["all"] === primary;

  if (sameSet) return null;

  if (!existingFetchRemotes["all"]) {
    const addRes = runGit(["remote", "add", "all", primary], repoPath);
    if (!addRes.ok) return `failed adding all remote: ${addRes.stderr}`;
  } else {
    runGit(["remote", "set-url", "all", primary], repoPath);
  }

  // Reset push URLs deterministically
  const currentOut = runGit(
    ["config", "--unset-all", "remote.all.pushurl"],
    repoPath,
  );
  void currentOut;

  for (const u of urls) {
    runGit(["remote", "set-url", "--add", "--push", "all", u], repoPath);
  }

  return `configured all pushurl fanout (${urls.length} targets)`;
}

export function auditAndConfigureRemotes(options?: {
  apply?: boolean;
  includeSelfHostedGitlab?: boolean;
  includeAllFanout?: boolean;
  config?: TriForgeConfig;
}): RemoteAuditEntry[] {
  const apply = options?.apply ?? false;
  const includeSelf = options?.includeSelfHostedGitlab ?? true;
  const includeAll = options?.includeAllFanout ?? true;
  const cfg = options?.config ?? getDefaultTriForgeConfig();
  const specs = discoverTriForgeInventory(cfg);

  const results: RemoteAuditEntry[] = [];

  for (const spec of specs) {
    const exists =
      existsSync(spec.absPath) && existsSync(join(spec.absPath, ".git"));
    const appliedActions: string[] = [];

    if (!exists) {
      results.push({
        name: spec.name,
        relPath: spec.relPath,
        absPath: spec.absPath,
        exists: false,
        configuredRemotes: {},
        expectedRemotes: {
          origin: spec.githubUrl,
          gitlab: spec.gitlabUrl,
          gitlabSelf: spec.gitlabSelfUrl,
          google: spec.googleUrl,
        },
        originAligned: false,
        gitlabAligned: false,
        gitlabSelfAligned: false,
        googleAligned: false,
        allPushUrls: [],
        appliedActions,
      });
      continue;
    }

    let { fetchRemotes, pushUrlsByRemote } = getGitRemotes(spec.absPath);

    if (apply) {
      // Never disturb `origin` on existing repos; only add if missing
      if (!fetchRemotes["origin"]) {
        const act = ensureRemoteUrl(
          spec.absPath,
          "origin",
          spec.githubUrl,
          fetchRemotes,
        );
        if (act) appliedActions.push(act);
      }

      const glAct = ensureRemoteUrl(
        spec.absPath,
        "gitlab",
        spec.gitlabUrl,
        fetchRemotes,
      );
      if (glAct) appliedActions.push(glAct);

      if (includeSelf) {
        const glSelfAct = ensureRemoteUrl(
          spec.absPath,
          "gitlab-self",
          spec.gitlabSelfUrl,
          fetchRemotes,
        );
        if (glSelfAct) appliedActions.push(glSelfAct);
      }

      const gcpAct = ensureRemoteUrl(
        spec.absPath,
        "google",
        spec.googleUrl,
        fetchRemotes,
      );
      if (gcpAct) appliedActions.push(gcpAct);

      if (includeAll) {
        const originUrl = fetchRemotes["origin"] || spec.githubUrl;
        const fanoutUrls = [originUrl, spec.gitlabUrl, spec.googleUrl];
        const allAct = ensureAllAggregateRemote(
          spec.absPath,
          fanoutUrls,
          fetchRemotes,
          pushUrlsByRemote["all"] || [],
        );
        if (allAct) appliedActions.push(allAct);
      }

      if (appliedActions.length > 0) {
        const refreshed = getGitRemotes(spec.absPath);
        fetchRemotes = refreshed.fetchRemotes;
        pushUrlsByRemote = refreshed.pushUrlsByRemote;
      }
    }

    const originUrl = fetchRemotes["origin"] || "";
    const originAligned = Boolean(originUrl);
    const gitlabAligned = fetchRemotes["gitlab"] === spec.gitlabUrl;
    const gitlabSelfAligned =
      fetchRemotes["gitlab-self"] === spec.gitlabSelfUrl;
    const googleAligned = fetchRemotes["google"] === spec.googleUrl;

    results.push({
      name: spec.name,
      relPath: spec.relPath,
      absPath: spec.absPath,
      exists: true,
      configuredRemotes: fetchRemotes,
      expectedRemotes: {
        origin: spec.githubUrl,
        gitlab: spec.gitlabUrl,
        gitlabSelf: spec.gitlabSelfUrl,
        google: spec.googleUrl,
      },
      originAligned,
      gitlabAligned,
      gitlabSelfAligned,
      googleAligned,
      allPushUrls: pushUrlsByRemote["all"] || [],
      appliedActions,
    });
  }

  return results;
}

export interface GitLabInitResult {
  mode: "live-api" | "provisioning-plan";
  baseUrl: string;
  group: string;
  selfHostedBaseUrl: string;
  orgOwnerEmail: string;
  tokenPresent: boolean;
  protectedBranches: string[];
  registriesEnabled: string[];
  projectsPlanned: number;
  projectsProvisioned: number;
  actions: string[];
}

export async function initializeGitLabForge(options?: {
  dryRun?: boolean;
  config?: TriForgeConfig;
}): Promise<GitLabInitResult> {
  const dryRun = options?.dryRun ?? false;
  const cfg = options?.config ?? getDefaultTriForgeConfig();
  const specs = discoverTriForgeInventory(cfg);
  const token =
    process.env.GITLAB_TOKEN || process.env.GITLAB_PRIVATE_TOKEN || "";
  const tokenPresent = token.trim().length > 0;
  const actions: string[] = [];

  const protectedBranches = ["main", "dev"];
  const registriesEnabled = ["container_registry", "package_registry_pacman"];

  if (!tokenPresent || dryRun) {
    actions.push(
      `Plan group '${cfg.gitlabGroup}' on ${cfg.gitlabBaseUrl} (owner: ${cfg.orgOwnerEmail})`,
    );
    actions.push(
      `Plan sovereign instance '${cfg.gitlabSelfGroup}' on ${cfg.gitlabSelfBaseUrl}`,
    );
    for (const spec of specs) {
      actions.push(
        `Plan project ${cfg.gitlabGroup}/${spec.name} [visibility=private, container_registry=enabled, packages=enabled, protected_branches=main,dev]`,
      );
    }
    return {
      mode: "provisioning-plan",
      baseUrl: cfg.gitlabBaseUrl,
      group: cfg.gitlabGroup,
      selfHostedBaseUrl: cfg.gitlabSelfBaseUrl,
      orgOwnerEmail: cfg.orgOwnerEmail,
      tokenPresent,
      protectedBranches,
      registriesEnabled,
      projectsPlanned: specs.length,
      projectsProvisioned: 0,
      actions,
    };
  }

  const apiBase = `${cfg.gitlabBaseUrl}/api/v4`;
  const headers = {
    "PRIVATE-TOKEN": token,
    "Content-Type": "application/json",
  };

  let namespaceId: number | null = null;
  try {
    const groupRes = await fetch(
      `${apiBase}/groups/${encodeURIComponent(cfg.gitlabGroup)}`,
      { headers },
    );
    if (groupRes.ok) {
      const groupJson = (await groupRes.json()) as { id?: number };
      namespaceId = groupJson.id ?? null;
      actions.push(
        `Verified GitLab group ${cfg.gitlabGroup} (id=${namespaceId})`,
      );
    } else if (groupRes.status === 404) {
      const createGroupRes = await fetch(`${apiBase}/groups`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: cfg.gitlabGroup,
          path: cfg.gitlabGroup,
          visibility: "private",
          description: "Aphrody Sovereign Monorepo Tri-Forge",
        }),
      });
      if (createGroupRes.ok) {
        const created = (await createGroupRes.json()) as { id?: number };
        namespaceId = created.id ?? null;
        actions.push(
          `Created GitLab group ${cfg.gitlabGroup} (id=${namespaceId})`,
        );
      } else {
        actions.push(
          `Group lookup/create returned HTTP ${createGroupRes.status}; using user namespace fallback if needed`,
        );
      }
    }
  } catch (err: any) {
    actions.push(
      `GitLab API unreachable (${err?.message || "network error"}); generated deterministic plan`,
    );
    return {
      mode: "provisioning-plan",
      baseUrl: cfg.gitlabBaseUrl,
      group: cfg.gitlabGroup,
      selfHostedBaseUrl: cfg.gitlabSelfBaseUrl,
      orgOwnerEmail: cfg.orgOwnerEmail,
      tokenPresent,
      protectedBranches,
      registriesEnabled,
      projectsPlanned: specs.length,
      projectsProvisioned: 0,
      actions,
    };
  }

  let provisioned = 0;
  for (const spec of specs) {
    const encodedPath = encodeURIComponent(`${cfg.gitlabGroup}/${spec.name}`);
    const checkRes = await fetch(`${apiBase}/projects/${encodedPath}`, {
      headers,
    });
    let projectId: number | null = null;

    if (checkRes.ok) {
      const existing = (await checkRes.json()) as { id?: number };
      projectId = existing.id ?? null;
      provisioned++;
      actions.push(`Verified project ${cfg.gitlabGroup}/${spec.name}`);
    } else if (checkRes.status === 404) {
      const bodyPayload: Record<string, unknown> = {
        name: spec.name,
        path: spec.name,
        visibility: "private",
        container_registry_access_level: "enabled",
        packages_enabled: true,
        default_branch: "main",
      };
      if (namespaceId !== null) {
        bodyPayload.namespace_id = namespaceId;
      }
      const createRes = await fetch(`${apiBase}/projects`, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyPayload),
      });
      if (createRes.ok) {
        const created = (await createRes.json()) as { id?: number };
        projectId = created.id ?? null;
        provisioned++;
        actions.push(`Created project ${cfg.gitlabGroup}/${spec.name}`);
      } else {
        actions.push(
          `Failed creating ${cfg.gitlabGroup}/${spec.name} (HTTP ${createRes.status})`,
        );
      }
    }

    if (projectId !== null) {
      for (const branch of protectedBranches) {
        await fetch(
          `${apiBase}/projects/${projectId}/protected_branches?name=${encodeURIComponent(branch)}&push_access_level=40&merge_access_level=40`,
          { method: "POST", headers },
        ).catch(() => null);
      }
    }
  }

  return {
    mode: "live-api",
    baseUrl: cfg.gitlabBaseUrl,
    group: cfg.gitlabGroup,
    selfHostedBaseUrl: cfg.gitlabSelfBaseUrl,
    orgOwnerEmail: cfg.orgOwnerEmail,
    tokenPresent,
    protectedBranches,
    registriesEnabled,
    projectsPlanned: specs.length,
    projectsProvisioned: provisioned,
    actions,
  };
}

export interface GoogleGitInitResult {
  mode: "configured" | "dry-run";
  gcpProjectId: string;
  gcpProjectNumber: string;
  gcpRegion: string;
  developerConnectConnection: string;
  credentialHelperConfigured: boolean;
  gcloudConfigsChecked: string[];
  repositoriesPlanned: number;
  commands: string[];
  notes: string[];
}

export function initializeGoogleGitForge(options?: {
  dryRun?: boolean;
  config?: TriForgeConfig;
}): GoogleGitInitResult {
  const dryRun = options?.dryRun ?? false;
  const cfg = options?.config ?? getDefaultTriForgeConfig();
  const specs = discoverTriForgeInventory(cfg);
  const connectionPath = `projects/${cfg.gcpProjectId}/locations/${cfg.gcpRegion}/connections/${cfg.developerConnectId}`;
  const helperCmd = process.platform === "win32" ? "gcloud.cmd" : "gcloud.sh";

  const commands: string[] = [
    `git config --global credential.https://source.developers.google.com.helper ${helperCmd}`,
    `gcloud services enable sourcerepo.googleapis.com developerconnect.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project=${cfg.gcpProjectId}`,
    `gcloud developer-connect connections create ${cfg.developerConnectId} --location=${cfg.gcpRegion} --project=${cfg.gcpProjectId}`,
  ];

  for (const spec of specs) {
    commands.push(
      `gcloud source repos create ${spec.name} --project=${cfg.gcpProjectId}`,
    );
  }

  const notes: string[] = [];
  let credentialHelperConfigured = false;
  const gcloudConfigsChecked = ["org-contact", "owner-yohan", "ai-yoyo"];

  if (!dryRun) {
    const credRes = runGit(
      [
        "config",
        "--global",
        "credential.https://source.developers.google.com.helper",
        helperCmd,
      ],
      cfg.srcRoot,
    );
    credentialHelperConfigured = credRes.ok;
    if (credRes.ok) {
      notes.push(
        `Configured global git credential helper for source.developers.google.com -> ${helperCmd}`,
      );
    } else {
      notes.push(
        `Could not update global git config (${credRes.stderr || "permission denied"}); local repo config can be used`,
      );
    }

    const gcloudCheck = spawnSync(
      process.platform === "win32" ? "gcloud.cmd" : "gcloud",
      ["config", "configurations", "list", "--format=value(name)"],
      { encoding: "utf-8", timeout: 10000 },
    );
    if (gcloudCheck.status === 0 && gcloudCheck.stdout) {
      const found = gcloudCheck.stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      notes.push(`Detected gcloud named configurations: ${found.join(", ")}`);
    } else {
      notes.push(
        "gcloud CLI configurations not active in current shell; run setup-triforge script with org-contact or owner-yohan",
      );
    }
  } else {
    notes.push(
      "Dry-run mode: generated deterministic GCP Developer Connect & Source Repositories plan",
    );
  }

  return {
    mode: dryRun ? "dry-run" : "configured",
    gcpProjectId: cfg.gcpProjectId,
    gcpProjectNumber: cfg.gcpProjectNumber,
    gcpRegion: cfg.gcpRegion,
    developerConnectConnection: connectionPath,
    credentialHelperConfigured,
    gcloudConfigsChecked,
    repositoriesPlanned: specs.length,
    commands,
    notes,
  };
}

function getLocalBranchesToPush(repoPath: string): string[] {
  const branches: string[] = [];
  for (const candidate of ["main", "dev"]) {
    const check = runGit(
      ["show-ref", "--verify", "--quiet", `refs/heads/${candidate}`],
      repoPath,
    );
    if (check.ok) branches.push(candidate);
  }
  if (branches.length === 0) {
    const headBranch = runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoPath);
    if (headBranch.ok && headBranch.stdout && headBranch.stdout !== "HEAD") {
      branches.push(headBranch.stdout);
    }
  }
  return branches;
}

export function executeTriSync(options?: {
  dryRun?: boolean;
  forge?: ForgeTarget;
  repoFilter?: string;
  config?: TriForgeConfig;
}): TriSyncRepoResult[] {
  const dryRun = options?.dryRun ?? false;
  const forge: ForgeTarget = options?.forge ?? "all";
  const cfg = options?.config ?? getDefaultTriForgeConfig();
  const specs = discoverTriForgeInventory(cfg);

  const forgeToRemote: Array<{
    key: "github" | "gitlab" | "google";
    remote: string;
  }> =
    forge === "all"
      ? [
          { key: "github", remote: "origin" },
          { key: "gitlab", remote: "gitlab" },
          { key: "google", remote: "google" },
        ]
      : forge === "github"
        ? [{ key: "github", remote: "origin" }]
        : forge === "gitlab"
          ? [{ key: "gitlab", remote: "gitlab" }]
          : [{ key: "google", remote: "google" }];

  const results: TriSyncRepoResult[] = [];

  for (const spec of specs) {
    if (
      options?.repoFilter &&
      spec.name !== options.repoFilter &&
      spec.relPath !== options.repoFilter
    ) {
      continue;
    }

    const exists =
      existsSync(spec.absPath) && existsSync(join(spec.absPath, ".git"));
    if (!exists) {
      results.push({
        repo: spec.name,
        relPath: spec.relPath,
        branches: [],
        perForge: {
          [forge]: {
            remote: forge,
            url: "",
            status: "skipped",
            message: "Local repository checkout not present",
          },
        },
      });
      continue;
    }

    const { fetchRemotes } = getGitRemotes(spec.absPath);
    const branches = getLocalBranchesToPush(spec.absPath);
    const perForge: TriSyncRepoResult["perForge"] = {};

    for (const target of forgeToRemote) {
      const url = fetchRemotes[target.remote] || "";
      if (!url) {
        perForge[target.key] = {
          remote: target.remote,
          url: "",
          status: "skipped",
          message: `Remote '${target.remote}' not configured (run 'frg remotes --apply')`,
        };
        continue;
      }

      if (branches.length === 0) {
        perForge[target.key] = {
          remote: target.remote,
          url,
          status: "skipped",
          message:
            "Detached HEAD and neither main nor dev local branches exist",
        };
        continue;
      }

      if (dryRun) {
        perForge[target.key] = {
          remote: target.remote,
          url,
          status: "dry-run",
          message: `Would push [${branches.join(", ")}] -> ${target.remote} (${url})`,
        };
        continue;
      }

      const pushRes = runGit(
        ["push", target.remote, ...branches],
        spec.absPath,
        45000,
      );
      if (pushRes.ok) {
        perForge[target.key] = {
          remote: target.remote,
          url,
          status: "pushed",
          message: `Pushed [${branches.join(", ")}]`,
        };
      } else {
        const sanitizedErr =
          (pushRes.stderr || "push rejected or unreachable")
            .replace(/https:\/\/[^@\s]+@/g, "https://***@")
            .split(/\r?\n/)[0] || "push failed";
        perForge[target.key] = {
          remote: target.remote,
          url,
          status: "failed",
          message: sanitizedErr,
        };
      }
    }

    results.push({
      repo: spec.name,
      relPath: spec.relPath,
      branches,
      perForge,
    });
  }

  return results;
}

export function checkAndSyncArchUpstreams(options?: {
  sync?: boolean;
  srcRoot?: string;
}): UpstreamSyncStatus[] {
  const sync = options?.sync ?? false;
  const srcRoot = options?.srcRoot ?? "C:\\src";
  const statuses: UpstreamSyncStatus[] = [];

  for (const upstream of ARCH_CACHY_OMARCHY_UPSTREAMS) {
    const localPath = resolve(srcRoot, upstream.localRelPath);
    const cloned = existsSync(localPath) && existsSync(join(localPath, ".git"));

    if (!cloned) {
      if (!sync) {
        statuses.push({
          id: upstream.id,
          ecosystem: upstream.ecosystem,
          upstreamUrl: upstream.upstreamUrl,
          localPath,
          cloned: false,
          headCommit: "",
          branch: "",
          fetched: false,
          statusMessage: "Not cloned locally (pass --sync to clone shallow)",
        });
        continue;
      }

      const cloneRes = runGit(
        ["clone", "--depth=1", upstream.upstreamUrl, localPath],
        srcRoot,
        60000,
      );
      if (!cloneRes.ok) {
        statuses.push({
          id: upstream.id,
          ecosystem: upstream.ecosystem,
          upstreamUrl: upstream.upstreamUrl,
          localPath,
          cloned: false,
          headCommit: "",
          branch: "",
          fetched: false,
          statusMessage: `Clone failed: ${cloneRes.stderr.split(/\r?\n/)[0] || "error"}`,
        });
        continue;
      }
    }

    let fetched = false;
    let statusMessage = "Local clone verified";

    if (sync) {
      const fetchRes = runGit(
        ["fetch", "--prune", "--no-tags", "origin"],
        localPath,
        45000,
      );
      fetched = fetchRes.ok;
      statusMessage = fetchRes.ok
        ? "Fetched upstream origin cleanly"
        : `Fetch warning: ${fetchRes.stderr.split(/\r?\n/)[0] || "offline"}`;
    }

    const headOut = runGit(["rev-parse", "--short=12", "HEAD"], localPath);
    const branchOut = runGit(["rev-parse", "--abbrev-ref", "HEAD"], localPath);

    statuses.push({
      id: upstream.id,
      ecosystem: upstream.ecosystem,
      upstreamUrl: upstream.upstreamUrl,
      localPath,
      cloned: true,
      headCommit: headOut.ok ? headOut.stdout : "unknown",
      branch: branchOut.ok ? branchOut.stdout : "HEAD",
      fetched,
      statusMessage,
    });
  }

  return statuses;
}
