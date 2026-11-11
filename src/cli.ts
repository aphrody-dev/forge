#!/usr/bin/env bun
// Sovereign Local Forge CLI: frg
import {
  scanMonorepoRepos,
  inspectRepo,
  getRepoStacks,
  slimRepo,
} from "./vcs.ts";
import {
  exportBundleToFile,
  importBundleFromFile,
  verifyBundleFile,
} from "./bundle.ts";
import {
  listReviews,
  createReview,
  updateReviewStatus,
  listCIRuns,
} from "./db.ts";
import { executeCIRun } from "./ci.ts";
import { startForgeServer } from "./server.ts";
import {
  auditAndConfigureRemotes,
  initializeGitLabForge,
  initializeGoogleGitForge,
  executeTriSync,
  checkAndSyncArchUpstreams,
} from "./triforge.ts";
import { auditFourPillars } from "./pillars.ts";
import {
  isFfiAvailable,
  getDepotAbiVersion,
  ffiGixStatus,
  ffiJustRecipes,
  ffiTreeSitterSymbols,
  ffiIngestCodebase,
  ffiGraphQuery,
  ffiForgeRepo,
} from "./depot_ffi.ts";
import type { ForgeTarget } from "./types.ts";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const command = args[0] || "help";

function printHelp() {
  console.log(`
FRG // Sovereign Monorepo Tri-Forge CLI (v1.1.0)
Architecture: Jujutsu (jj) + Gitoxide (gix) + Tri-Forge (GitHub + GitLab + Google Git) + Pure Bun 1.4.4

USAGE:
  frg <command> [arguments]

COMMANDS:
  status [repo] [--all]      Inspect all canonical C:\\src repositories (or --all incl. third_party)
  pillars [--json]           Audit 4-pillar VCS governance (Git + Chromium DEPS + Kernel MAINTAINERS + AOSP repo)
  remotes [--apply] [--json] Audit or idempotently apply origin/gitlab/google remotes on all 26 repos
  gitlab-init [--dry-run]    Provision aphrody-dev GitLab group/projects, protections & Pacman/OCI registries
  google-git-init [--dry-run] Configure GCP 'aphrody' Developer Connect, Source Repos & credential helper
  tri-sync [flags]           Push main & dev across forges (--dry-run, --forge github|gitlab|google|all)
  arch-upstreams [--sync]    Audit & fetch Arch Linux GitLab, CachyOS & Omacom/Omarchy upstreams
  bundle <repo> [out]        Export content-addressed Blake3 + Zstd patch bundle
  sync <bundle> [repo]       Verify & apply patch bundle to target repo
  verify <bundle_file>       Verify Blake3 hash integrity of a bundle file
  slim [repo]                Byte-level repository optimization (commit-graph, reflog, pack)
  depot <subcmd>             Call Native Rust Depot FFI (version, status, just, symbols, ingest, graph, repo)
  serve [--port <port>]      Launch local Forge web dashboard & REST API (default: 4000)
  ci <repo> <command>        Execute a local CI task and record run in forge.sqlite
  review list                List all active sovereign reviews
  review create <repo> <msg> Create a new stacked change review request
  review approve <id>        Approve a pending review request
  help                       Show this help message
`);
}

async function main() {
  switch (command) {
    case "depot": {
      const sub = args[1] || "status";
      if (!isFfiAvailable()) {
        console.error("Error: depot_ffi.dll not found or failed to load");
        process.exit(1);
      }
      switch (sub) {
        case "version": {
          console.log(`Depot FFI ABI Version: ${getDepotAbiVersion()}`);
          break;
        }
        case "status":
        case "gix": {
          const target = args[2] || ".";
          console.log(JSON.stringify(ffiGixStatus(target), null, 2));
          break;
        }
        case "just": {
          const target = args[2] || "justfile";
          console.log(JSON.stringify(ffiJustRecipes(target), null, 2));
          break;
        }
        case "symbols": {
          const target = args[2];
          if (!target) {
            console.error("Usage: frg depot symbols <file>");
            process.exit(1);
          }
          const content = await Bun.file(target).text();
          console.log(JSON.stringify(ffiTreeSitterSymbols(target, content), null, 2));
          break;
        }
        case "ingest": {
          const target = args[2] || ".";
          const maxTokens = parseInt(args.slice(3).find((a) => a.startsWith("--tokens="))?.split("=")[1] || "0", 10);
          const outline = args.includes("--outline");
          console.log(JSON.stringify(ffiIngestCodebase(target, maxTokens, outline), null, 2));
          break;
        }
        case "graph": {
          const term = args[2];
          if (!term) {
            console.error("Usage: frg depot graph <term> [path]");
            process.exit(1);
          }
          const target = args[3] || ".";
          const dfs = args.includes("--dfs");
          console.log(JSON.stringify(ffiGraphQuery(target, term, dfs), null, 2));
          break;
        }
        case "repo": {
          const owner = args[2] || "tree-sitter";
          const repo = args[3] || "tree-sitter";
          console.log(JSON.stringify(ffiForgeRepo(owner, repo), null, 2));
          break;
        }
        default:
          console.error(`Unknown depot subcommand: ${sub}`);
          process.exit(1);
      }
      break;
    }
    case "status": {
      const includeThirdParty = args.includes("--all") || args.includes("--third-party");
      const target = args.slice(1).find((a) => !a.startsWith("-"));
      if (target) {
        const repoPath = resolve(target);
        const info = inspectRepo(repoPath);
        if (!info) {
          console.error(`Error: Not a valid repository: ${repoPath}`);
          process.exit(1);
        }
        console.log(`\nRepository: ${info.name} (${info.path})`);
        console.log(`Branch:     ${info.branch}`);
        console.log(
          `Head:       ${info.headCommit.substring(0, 10)} - ${info.headMessage}`,
        );
        console.log(
          `Status:     ${info.isClean ? "Clean" : `${info.modifiedFiles} modified, ${info.untrackedFiles} untracked`}`,
        );
        console.log(`Jujutsu:    ${info.hasJj ? "Enabled (.jj)" : "Git only"}`);

        const stacks = getRepoStacks(repoPath);
        console.log(`\nStacked Changes (${stacks.length}):`);
        stacks.forEach((s) => {
          const marker = s.isWorkingCopy ? "@" : "*";
          console.log(
            `  ${marker} ${s.changeId.padEnd(12)} [${s.commitSha.substring(0, 7)}] ${s.description} (${s.author})`,
          );
        });
      } else {
        console.log("Scanning C:\\src monorepo repositories...\n");
        const repos = scanMonorepoRepos("C:\\src", { includeThirdParty });
        console.log(
          "REPO                      BRANCH             HEAD         STATUS         ENGINE",
        );
        console.log(
          "--------------------------------------------------------------------------------",
        );
        repos.forEach((r) => {
          const nameCol = r.name.padEnd(25).substring(0, 25);
          const branchCol = r.branch.padEnd(18).substring(0, 18);
          const headCol = r.headCommit.substring(0, 8).padEnd(12);
          const statusCol = (
            r.isClean ? "Clean" : `${r.modifiedFiles}m / ${r.untrackedFiles}u`
          ).padEnd(14);
          const engineCol = r.hasJj ? "jj" : "git";
          console.log(
            `${nameCol} ${branchCol} ${headCol} ${statusCol} ${engineCol}`,
          );
        });
        console.log(`\nTotal: ${repos.length} repositories scanned.`);
      }
      break;
    }

    case "bundle": {
      const repoArg = args[1];
      if (!repoArg) {
        console.error("Usage: frg bundle <repo_path> [out_file]");
        process.exit(1);
      }
      const repoPath = resolve(repoArg);
      const repoName = repoPath.split(/[\\/]/).pop() || "repo";
      const outPath = args[2];
      const { bundle, filePath } = exportBundleToFile(
        repoPath,
        repoName,
        outPath,
      );
      console.log(`Bundle created successfully:`);
      console.log(`  File:        ${filePath}`);
      console.log(`  Blake3 Hash: ${bundle.header.hash}`);
      console.log(`  Raw Bytes:   ${bundle.header.rawBytes} bytes`);
      console.log(
        `  Zstd Bytes:  ${bundle.header.compressedBytes} bytes (Ratio: ${((bundle.header.compressedBytes / Math.max(1, bundle.header.rawBytes)) * 100).toFixed(1)}%)`,
      );
      break;
    }

    case "sync": {
      const bundleArg = args[1];
      const repoArg = args[2] || process.cwd();
      if (!bundleArg) {
        console.error("Usage: frg sync <bundle_file_or_hash> [target_repo]");
        process.exit(1);
      }
      const repoPath = resolve(repoArg);
      const res = importBundleFromFile(bundleArg, repoPath);
      if (res.success) {
        console.log(`[Success] ${res.message}`);
      } else {
        console.error(`[Error] ${res.message}`);
        process.exit(1);
      }
      break;
    }

    case "verify": {
      const bundleArg = args[1];
      if (!bundleArg) {
        console.error("Usage: frg verify <bundle_file>");
        process.exit(1);
      }
      const info = verifyBundleFile(bundleArg);
      if (info.valid) {
        console.log(`[Valid Bundle] Integrity Verified!`);
        console.log(`  Repo:        ${info.repoName}`);
        console.log(`  Blake3:      ${info.hash}`);
        console.log(
          `  Size:        ${info.compressedBytes} bytes compressed / ${info.rawBytes} bytes raw`,
        );
      } else {
        console.error(`[CORRUPT BUNDLE] Blake3 digest does not match header!`);
        process.exit(1);
      }
      break;
    }

    case "slim": {
      const repoArg = args[1] || process.cwd();
      const repoPath = resolve(repoArg);
      console.log(`Slimming repository: ${repoPath}...`);
      const { bytesBefore, bytesAfter, savedBytes } = slimRepo(repoPath);
      console.log(`  Before: ${bytesBefore.toLocaleString()} bytes`);
      console.log(`  After:  ${bytesAfter.toLocaleString()} bytes`);
      console.log(`  Saved:  ${savedBytes.toLocaleString()} bytes!`);
      break;
    }

    case "serve": {
      let port = 4000;
      const portIdx = args.indexOf("--port");
      if (portIdx !== -1 && args[portIdx + 1]) {
        port = parseInt(args[portIdx + 1], 10) || 4000;
      }
      startForgeServer(port);
      // Keep process alive
      await new Promise(() => {});
      break;
    }

    case "ci": {
      const repoArg = args[1];
      const cmdArg = args.slice(2).join(" ");
      if (!repoArg || !cmdArg) {
        console.error("Usage: frg ci <repo_path> <command>");
        process.exit(1);
      }
      const repoPath = resolve(repoArg);
      const repoName = repoPath.split(/[\\/]/).pop() || "repo";
      console.log(`[CI] Running '${cmdArg}' in ${repoName}...`);
      const run = await executeCIRun(repoName, repoPath, cmdArg);
      console.log(
        `[CI] Finished with status: ${run.status.toUpperCase()} (Exit: ${run.exitCode}) in ${run.durationMs}ms`,
      );
      if (run.exitCode !== 0) {
        console.error(run.output);
        process.exit(run.exitCode);
      }
      break;
    }

    case "review": {
      const sub = args[1] || "list";
      if (sub === "list") {
        const revs = listReviews();
        console.log(`\nActive Sovereign Reviews (${revs.length}):`);
        revs.forEach((r) => {
          console.log(
            `  #${r.id} [${r.status.toUpperCase()}] ${r.repoName} - ${r.title} (author: ${r.author})`,
          );
        });
      } else if (sub === "create") {
        const repo = args[2] || "monorepo";
        const title = args.slice(3).join(" ") || "Stacked commit review";
        const rev = createReview({
          repoName: repo,
          title,
          description: "Created via frg review CLI",
          targetBranch: "main",
          sourceCommit: "HEAD",
          author: "aphrody-dev",
        });
        console.log(`Created review #${rev.id}: ${rev.title}`);
      } else if (sub === "approve") {
        const id = parseInt(args[2] || "0", 10);
        const ok = updateReviewStatus(id, "approved");
        console.log(
          ok ? `Review #${id} approved!` : `Review #${id} not found.`,
        );
      }
      break;
    }

    case "remotes": {
      const apply = args.includes("--apply");
      const asJson = args.includes("--json");
      const entries = auditAndConfigureRemotes({ apply });

      if (asJson) {
        console.log(JSON.stringify(entries, null, 2));
        break;
      }

      console.log(
        `Tri-Forge Remote Topology (${apply ? "APPLIED" : "AUDIT"}) across ${entries.length} canonical repositories:\n`,
      );
      console.log(
        "REPO                 PATH                      ORIGIN   GITLAB   GOOGLE   FANOUT(all)",
      );
      console.log(
        "--------------------------------------------------------------------------------------",
      );
      for (const e of entries) {
        const repoCol = e.name.padEnd(20).substring(0, 20);
        const pathCol = e.relPath.padEnd(25).substring(0, 25);
        const origCol = (e.originAligned ? "OK" : "MISS").padEnd(8);
        const glCol = (e.gitlabAligned ? "OK" : "MISS").padEnd(8);
        const gcpCol = (e.googleAligned ? "OK" : "MISS").padEnd(8);
        const allCol =
          e.allPushUrls.length > 0 ? `${e.allPushUrls.length} urls` : "MISS";
        console.log(
          `${repoCol} ${pathCol} ${origCol} ${glCol} ${gcpCol} ${allCol}`,
        );
        for (const act of e.appliedActions) {
          console.log(`  -> ${act}`);
        }
      }
      const alignedCount = entries.filter(
        (e) => e.originAligned && e.gitlabAligned && e.googleAligned,
      ).length;
      console.log(
        `\nSummary: ${alignedCount}/${entries.length} repositories aligned across GitHub (origin), GitLab (gitlab), and Google Git (google).`,
      );
      break;
    }

    case "gitlab-init": {
      const dryRun = args.includes("--dry-run");
      const asJson = args.includes("--json");
      const res = await initializeGitLabForge({ dryRun });
      if (asJson) {
        console.log(JSON.stringify(res, null, 2));
        break;
      }
      console.log(
        `[GitLab Tri-Forge Init] Mode: ${res.mode} | Base: ${res.baseUrl}/${res.group}`,
      );
      console.log(
        `  Sovereign Self-Hosted: ${res.selfHostedBaseUrl} (Owner: ${res.orgOwnerEmail})`,
      );
      console.log(
        `  Token Configured:      ${res.tokenPresent ? "yes (GITLAB_TOKEN)" : "no (deterministic plan generated)"}`,
      );
      console.log(
        `  Protected Branches:    ${res.protectedBranches.join(", ")}`,
      );
      console.log(
        `  Registries:            ${res.registriesEnabled.join(", ")}`,
      );
      console.log(
        `  Projects:              ${res.projectsProvisioned}/${res.projectsPlanned} provisioned`,
      );
      console.log("\nActions:");
      for (const act of res.actions) {
        console.log(`  - ${act}`);
      }
      break;
    }

    case "google-git-init": {
      const dryRun = args.includes("--dry-run");
      const asJson = args.includes("--json");
      const res = initializeGoogleGitForge({ dryRun });
      if (asJson) {
        console.log(JSON.stringify(res, null, 2));
        break;
      }
      console.log(
        `[Google Cloud Git Init] Mode: ${res.mode} | Project: ${res.gcpProjectId} (#${res.gcpProjectNumber})`,
      );
      console.log(`  Developer Connect:     ${res.developerConnectConnection}`);
      console.log(
        `  Credential Helper:     ${res.credentialHelperConfigured ? "configured" : "planned"}`,
      );
      console.log(
        `  gcloud Configs:        ${res.gcloudConfigsChecked.join(", ")}`,
      );
      console.log(`  Repositories Planned:  ${res.repositoriesPlanned}`);
      for (const note of res.notes) {
        console.log(`  Note: ${note}`);
      }
      if (dryRun) {
        console.log("\nProvisioning Commands:");
        for (const cmd of res.commands.slice(0, 8)) {
          console.log(`  $ ${cmd}`);
        }
        if (res.commands.length > 8) {
          console.log(
            `  ... (${res.commands.length - 8} additional gcloud source repos create commands)`,
          );
        }
      }
      break;
    }

    case "tri-sync": {
      const dryRun = args.includes("--dry-run");
      const asJson = args.includes("--json");
      let forge: ForgeTarget = "all";
      const forgeIdx = args.indexOf("--forge");
      if (forgeIdx !== -1 && args[forgeIdx + 1]) {
        const val = args[forgeIdx + 1] as ForgeTarget;
        if (["github", "gitlab", "google", "all"].includes(val)) {
          forge = val;
        } else {
          console.error(
            `Invalid --forge '${val}'. Expected: github | gitlab | google | all`,
          );
          process.exit(1);
        }
      }
      let repoFilter: string | undefined;
      const repoIdx = args.indexOf("--repo");
      if (repoIdx !== -1 && args[repoIdx + 1]) {
        repoFilter = args[repoIdx + 1];
      }

      const results = executeTriSync({ dryRun, forge, repoFilter });
      if (asJson) {
        console.log(JSON.stringify(results, null, 2));
        break;
      }

      console.log(
        `[Tri-Forge Sync] Target: ${forge.toUpperCase()} | Mode: ${dryRun ? "DRY-RUN" : "LIVE PUSH"} | Repos: ${results.length}\n`,
      );
      for (const r of results) {
        const branchLabel =
          r.branches.length > 0 ? r.branches.join(",") : "none";
        console.log(`${r.repo.padEnd(20)} [branches: ${branchLabel}]`);
        for (const [fKey, fStatus] of Object.entries(r.perForge)) {
          console.log(
            `  - ${fKey.padEnd(7)} (${fStatus.status.padEnd(7)}): ${fStatus.message}`,
          );
        }
      }
      break;
    }

    case "arch-upstreams": {
      const sync = args.includes("--sync");
      const asJson = args.includes("--json");
      const statuses = checkAndSyncArchUpstreams({ sync });
      if (asJson) {
        console.log(JSON.stringify(statuses, null, 2));
        break;
      }

      console.log(
        `[Arch / CachyOS / Omarchy Upstreams] Mode: ${sync ? "FETCH SYNC" : "AUDIT"} (${statuses.length} tracked repos)\n`,
      );
      console.log(
        "ECOSYSTEM   UPSTREAM ID                                  CLONED  HEAD          STATUS",
      );
      console.log(
        "----------------------------------------------------------------------------------------------------",
      );
      for (const s of statuses) {
        const ecoCol = s.ecosystem.padEnd(11);
        const idCol = s.id.padEnd(44).substring(0, 44);
        const clonedCol = (s.cloned ? "YES" : "NO").padEnd(7);
        const headCol = (s.headCommit || "-").padEnd(13);
        console.log(
          `${ecoCol} ${idCol} ${clonedCol} ${headCol} ${s.statusMessage}`,
        );
      }
      break;
    }

    case "pillars": {
      const asJson = args.includes("--json");
      const report = auditFourPillars("C:\\src");
      if (asJson) {
        console.log(JSON.stringify(report, null, 2));
        if (!report.allHealthy) process.exit(1);
        break;
      }

      console.log(
        `[4-Pillar VCS Governance Audit] Root: ${report.srcRoot} | Junctions: ${report.rootJunctionCount} (${report.danglingJunctions.length} dangling)\n`,
      );
      console.log(
        "PILLAR      STATUS  HEAD          REMOTES   SUMMARY",
      );
      console.log(
        "----------------------------------------------------------------------------------------",
      );
      for (const p of Object.values(report.pillars)) {
        const nameCol = p.pillar.toUpperCase().padEnd(11);
        const stCol = (p.healthy ? "OK" : "FAIL").padEnd(7);
        const headCol = (p.headCommit ? p.headCommit.substring(0, 10) : "-").padEnd(13);
        const remCol = `${Object.keys(p.remotes).length} rem`.padEnd(9);
        console.log(`${nameCol} ${stCol} ${headCol} ${remCol} ${p.details.join("; ")}`);
      }
      console.log(
        `\nOverall Status: ${report.allHealthy ? "PASS (Git + Chromium + Kernel + AOSP aligned)" : "FAIL"}`,
      );
      if (!report.allHealthy) process.exit(1);
      break;
    }

    case "help":
    default:
      printHelp();
      break;
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
