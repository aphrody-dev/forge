import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ARCH_CACHY_OMARCHY_UPSTREAMS,
  CANONICAL_MONOREPO_SUBMODULES,
  auditAndConfigureRemotes,
  checkAndSyncArchUpstreams,
  discoverTriForgeInventory,
  executeTriSync,
  getDefaultTriForgeConfig,
  initializeGitLabForge,
  initializeGoogleGitForge,
  parseGitmodules,
  synthesizeRepoUrls,
} from "../src/triforge.ts";

describe("Tri-Forge Repository Inventory & URL Synthesis", () => {
  test("discovers all 26 canonical repositories (root src + 25 submodules)", () => {
    const specs = discoverTriForgeInventory();
    expect(specs.length).toBe(26);
    expect(CANONICAL_MONOREPO_SUBMODULES.length).toBe(26);

    const names = specs.map((s) => s.name);
    expect(names[0]).toBe("src");
    expect(names).toContain("aphrody");
    expect(names).toContain("aphrody-app");
    expect(names).toContain("shenron");
    expect(names).toContain("rosegriffon");
    expect(names).toContain("ai-os");
    expect(names).toContain("forge");
    expect(names).toContain("google-design");
    expect(names).toContain("unix");
    expect(names).toContain("wayland");
    expect(names).toContain("infra");

    // Clean unprefixed names (no slashes)
    for (const s of specs) {
      expect(s.name.includes("/")).toBe(false);
    }
  });

  test("synthesizes exact GitHub, GitLab, Self-Hosted GitLab, and Google Cloud Git URLs", () => {
    const cfg = getDefaultTriForgeConfig("C:\\src");
    const spec = synthesizeRepoUrls("forge", "packages/forge", cfg);

    expect(spec.name).toBe("forge");
    expect(spec.tier).toBe("packages");
    expect(spec.githubUrl).toBe("https://github.com/aphrody-dev/forge.git");
    expect(spec.gitlabUrl).toBe("https://gitlab.com/aphrody-dev/forge.git");
    expect(spec.gitlabSelfUrl).toBe(
      "https://git.aphrody.com/aphrody/forge.git",
    );
    expect(spec.googleUrl).toBe(
      "https://source.developers.google.com/p/aphrody/r/forge",
    );
    expect(spec.developerConnectUri).toBe(
      "projects/aphrody/locations/europe-west1/connections/aphrody-triforge/gitRepositoryLinks/forge",
    );
  });

  test("parses .gitmodules cleanly", () => {
    const raw = readFileSync("C:\\src\\.gitmodules", "utf-8");
    const parsed = parseGitmodules(raw);
    expect(parsed.length).toBe(25);
    expect(parsed.some((p) => p.cleanName === "forge")).toBe(true);
    expect(parsed.some((p) => p.cleanName === "unix")).toBe(true);
    expect(parsed.some((p) => p.cleanName === "infra")).toBe(true);
  });

  test("audits remotes across all 26 repositories without mutating in read-only mode", () => {
    const audit = auditAndConfigureRemotes({ apply: false });
    expect(audit.length).toBe(26);
    const forgeEntry = audit.find((e) => e.name === "forge");
    expect(forgeEntry).toBeDefined();
    expect(forgeEntry?.exists).toBe(true);
    expect(forgeEntry?.originAligned).toBe(true);
  });

  test("gitlab-init dry-run produces deterministic provisioning plan", async () => {
    const plan = await initializeGitLabForge({ dryRun: true });
    expect(plan.mode).toBe("provisioning-plan");
    expect(plan.projectsPlanned).toBe(26);
    expect(plan.protectedBranches).toEqual(["main", "dev"]);
    expect(plan.orgOwnerEmail).toBe("contact@aphrody.com");
  });

  test("google-git-init dry-run produces Developer Connect & Source Repo commands", () => {
    const plan = initializeGoogleGitForge({ dryRun: true });
    expect(plan.mode).toBe("dry-run");
    expect(plan.gcpProjectId).toBe("aphrody");
    expect(plan.gcpProjectNumber).toBe("468000409790");
    expect(plan.repositoriesPlanned).toBe(26);
    expect(plan.commands.length).toBeGreaterThanOrEqual(29);
  });

  test("tri-sync dry-run validates forge targets cleanly", () => {
    const syncRes = executeTriSync({
      dryRun: true,
      forge: "github",
      repoFilter: "forge",
    });
    expect(syncRes.length).toBe(1);
    expect(syncRes[0]?.repo).toBe("forge");
    expect(syncRes[0]?.perForge["github"]?.status).toBe("dry-run");
  });
});

describe("Arch Linux, CachyOS & Omarchy Upstream Registry", () => {
  test("tracks all required Arch GitLab, CachyOS, and Omacom upstreams", () => {
    expect(ARCH_CACHY_OMARCHY_UPSTREAMS.length).toBe(17);

    const ids = ARCH_CACHY_OMARCHY_UPSTREAMS.map((u) => u.id);
    expect(ids).toContain("archlinux/devtools");
    expect(ids).toContain("archlinux/mkinitcpio");
    expect(ids).toContain("archlinux/archinstall");
    expect(ids).toContain("archlinux/archlinux-wsl");
    expect(ids).toContain("archlinux/pacman");
    expect(ids).toContain("archlinux/packaging/packages/linux");
    expect(ids).toContain("archlinux/packaging/packages/hyprland");
    expect(ids).toContain("archlinux/packaging/packages/cosmic-session");
    expect(ids).toContain("cachyos/cachyos-wsl");
    expect(ids).toContain("cachyos/kernel-patches");
    expect(ids).toContain("cachyos/CachyOS-PKGBUILDS");
    expect(ids).toContain("cachyos/cachyos-hyprland-settings");
    expect(ids).toContain("omacom/omarchy");
    expect(ids).toContain("omacom/try-omarchy-windows");
    expect(ids).toContain("omacom/aether");
    expect(ids).toContain("omacom/omarchy-pkgs");
    expect(ids).toContain("omacom/omarchy-plugin-marketplace");

    const statuses = checkAndSyncArchUpstreams({ sync: false });
    expect(statuses.length).toBe(17);
  });
});

describe("Sovereign GitLab Infra, .gitlab-ci.yml & cloudbuild.yaml Validation", () => {
  test("validates package.json zero-dependency contract", () => {
    const pkgRaw = readFileSync(
      resolve("C:\\src\\packages\\forge\\package.json"),
      "utf-8",
    );
    const pkg = JSON.parse(pkgRaw);
    expect(Object.keys(pkg.dependencies || {}).length).toBe(0);
    expect(Object.keys(pkg.devDependencies || {}).length).toBe(0);
    expect(pkgRaw.includes("bunx")).toBe(false);
  });

  test("validates C:\\src\\infra\\gitlab sovereign artifacts exist and obey zero-bunx", () => {
    const files = [
      "C:\\src\\infra\\gitlab\\docker-compose.gitlab.yml",
      "C:\\src\\infra\\gitlab\\gitlab.rb",
      "C:\\src\\infra\\gitlab\\arch-ci\\Dockerfile.arch-builder",
      "C:\\src\\infra\\gitlab\\setup-triforge.ps1",
      "C:\\src\\infra\\gitlab\\setup-triforge.sh",
      "C:\\src\\infra\\gitlab\\README.md",
      "C:\\src\\.gitlab-ci.yml",
      "C:\\src\\cloudbuild.yaml",
    ];

    for (const file of files) {
      expect(existsSync(file)).toBe(true);
      const text = readFileSync(file, "utf-8");
      expect(text.includes("bunx")).toBe(false);
    }

    const compose = readFileSync(
      "C:\\src\\infra\\gitlab\\docker-compose.gitlab.yml",
      "utf-8",
    );
    expect(compose).toContain("git.aphrody.com");
    expect(compose).toContain("contact@aphrody.com");
    expect(compose).toContain("2224:22");
    expect(compose).toContain("archlinux-pkgctl");

    const gitlabCi = readFileSync("C:\\src\\.gitlab-ci.yml", "utf-8");
    expect(gitlabCi).toContain("lint-anti-slop");
    expect(gitlabCi).toContain("build-bun-rust-go");
    expect(gitlabCi).toContain("test-gate");
    expect(gitlabCi).toContain("arch-cachy-omarchy-wsl");
    expect(gitlabCi).toContain("wck-seo-100");
    expect(gitlabCi).toContain("triforge-mirror");

    const cloudbuild = readFileSync("C:\\src\\cloudbuild.yaml", "utf-8");
    expect(cloudbuild).toContain("europe-west1");
    expect(cloudbuild).toContain("us-central1");
    expect(cloudbuild).toContain("bunos");
  });
});
