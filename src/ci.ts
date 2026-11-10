// Sovereign Monorepo Local CI Runner
import { spawn } from "node:child_process";
import { recordCIRun } from "./db.ts";
import type { CIRun } from "./types.ts";

export async function executeCIRun(repoName: string, repoPath: string, command: string): Promise<CIRun> {
  const startTime = performance.now();
  let stdout = "";
  let stderr = "";
  let exitCode = 0;

  try {
    const isWindows = process.platform === "win32";
    const shell = isWindows ? "cmd.exe" : "/bin/sh";
    const flag = isWindows ? "/c" : "-c";

    const proc = spawn(shell, [flag, command], {
      cwd: repoPath,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CI: "true", SOVEREIGN_FORGE: "1" },
    });

    proc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf-8");
    });

    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf-8");
    });

    await new Promise<void>((resolve) => {
      proc.on("close", (code) => {
        exitCode = code ?? 0;
        resolve();
      });
      proc.on("error", (err) => {
        stderr += `\nSpawn error: ${err.message}`;
        exitCode = 1;
        resolve();
      });
    });
  } catch (err: any) {
    stderr += `\nExecution error: ${err.message}`;
    exitCode = 1;
  }

  const durationMs = Math.round(performance.now() - startTime);
  const status: "success" | "failure" = exitCode === 0 ? "success" : "failure";
  const output = (stdout + "\n" + stderr).trim().slice(-20000); // keep last 20k chars

  return recordCIRun({
    repoName,
    command,
    status,
    exitCode,
    output: output || "(no output)",
    durationMs,
  });
}
