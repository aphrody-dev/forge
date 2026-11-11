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
import { resolve } from "node:path";

const args = process.argv.slice(2);
const command = args[0] || "help";

function printHelp() {
  console.log(`
FRG // Sovereign Monorepo Forge CLI (v1.0.0)
Architecture: Jujutsu (jj) + Gitoxide (gix) + Radicle + Pure Bun 1.4.4

USAGE:
  frg <command> [arguments]

COMMANDS:
  status [repo]              Inspect all C:\\src repositories or a single repo stack
  bundle <repo> [out]        Export content-addressed Blake3 + Zstd patch bundle
  sync <bundle> [repo]       Verify & apply patch bundle to target repo
  verify <bundle_file>       Verify Blake3 hash integrity of a bundle file
  slim [repo]                Byte-level repository optimization (commit-graph, reflog, pack)
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
    case "status": {
      const target = args[1];
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
          const marker = s.isWorkingCopy ? "@" : "◆";
          console.log(
            `  ${marker} ${s.changeId.padEnd(12)} [${s.commitSha.substring(0, 7)}] ${s.description} (${s.author})`,
          );
        });
      } else {
        console.log("Scanning C:\\src monorepo repositories...\n");
        const repos = scanMonorepoRepos("C:\\src");
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
