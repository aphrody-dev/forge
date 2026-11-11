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

export type ForgeTarget = "github" | "gitlab" | "google" | "all";

export interface TriForgeRepoSpec {
  name: string;
  relPath: string;
  absPath: string;
  tier: "root" | "apps" | "packages" | "crates" | "infra" | "tools";
  githubUrl: string;
  gitlabUrl: string;
  gitlabSelfUrl: string;
  googleUrl: string;
  developerConnectUri: string;
  defaultBranch: string;
}

export interface RemoteAuditEntry {
  name: string;
  relPath: string;
  absPath: string;
  exists: boolean;
  configuredRemotes: Record<string, string>;
  expectedRemotes: {
    origin: string;
    gitlab: string;
    gitlabSelf: string;
    google: string;
  };
  originAligned: boolean;
  gitlabAligned: boolean;
  gitlabSelfAligned: boolean;
  googleAligned: boolean;
  allPushUrls: string[];
  appliedActions: string[];
}

export interface UpstreamDistroRepo {
  id: string;
  ecosystem: "archlinux" | "cachyos" | "omacom";
  upstreamPath: string;
  upstreamUrl: string;
  localRelPath: string;
  description: string;
}

export interface UpstreamSyncStatus {
  id: string;
  ecosystem: "archlinux" | "cachyos" | "omacom";
  upstreamUrl: string;
  localPath: string;
  cloned: boolean;
  headCommit: string;
  branch: string;
  fetched: boolean;
  statusMessage: string;
}

export interface TriSyncRepoResult {
  repo: string;
  relPath: string;
  branches: string[];
  perForge: Record<
    string,
    {
      remote: string;
      url: string;
      status: "pushed" | "dry-run" | "skipped" | "failed";
      message: string;
    }
  >;
}
