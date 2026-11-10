// Sovereign Monorepo Forge Types

export interface RepoInfo {
  name: string;
  path: string;
  branch: string;
  headCommit: string;
  headMessage: string;
  isClean: boolean;
  hasJj: boolean;
  modifiedFiles: number;
  untrackedFiles: number;
  lastChecked: string;
}

export interface StackCommit {
  changeId: string;
  commitSha: string;
  author: string;
  timestamp: string;
  description: string;
  isWorkingCopy: boolean;
  isImmutable: boolean;
  hasConflict: boolean;
}

export interface Review {
  id: number;
  repoName: string;
  title: string;
  description: string;
  targetBranch: string;
  sourceCommit: string;
  status: "pending" | "approved" | "rejected" | "merged";
  author: string;
  createdAt: string;
  updatedAt: string;
}

export interface CIRun {
  id: number;
  repoName: string;
  command: string;
  status: "running" | "success" | "failure";
  exitCode: number;
  output: string;
  durationMs: number;
  createdAt: string;
}

export interface PatchBundleHeader {
  version: number;
  hash: string;
  repoName: string;
  baseCommit: string;
  headCommit: string;
  timestamp: number;
  filesCount: number;
  rawBytes: number;
  compressedBytes: number;
}

export interface PatchBundle {
  header: PatchBundleHeader;
  patchZstdBase64: string;
}
