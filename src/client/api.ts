import { invoke, Channel } from '@tauri-apps/api/core'

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<ApiResult<T>> {
  try {
    const data = await invoke<T>(cmd, args)
    return { ok: true, data }
  } catch (e: unknown) {
    return { ok: false, error: typeof e === 'string' ? e : String(e) }
  }
}

// ───── Shared types ─────────────────────────────────────

export interface RepoInfo {
  path: string
  currentBranch: string
  lastCommit: { hash: string; message: string; date: string } | null
}

export interface CommitInfo {
  hash: string
  hashShort: string
  message: string
  author: string
  email: string
  date: string
  refs: string
  parents: string[]
}

export interface StatusInfo {
  current: string
  not_added: string[]
  modified: string[]
  deleted: string[]
  staged: string[]
  conflicted: string[]
  created: string[]
  renamed: string[]
}

export interface BranchInfo {
  current: string
  all: string[]
}

export interface RemoteStatus {
  hasUpstream: boolean
  upstream: string | null
  ahead: number
  behind: number
}

export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
}

export interface CommitResult {
  hash: string
  summary: unknown
}

export interface DiscardResult {
  /** 복원된 tracked 파일 수 */
  tracked: number
  /** 영구 삭제된 untracked 파일 수 */
  untracked: number
  /** include_untracked=false 라서 건너뛴 untracked 파일 수 */
  skippedUntracked: number
}

// 핫 페퍼 배지용 슬림 응답 (forensics 통째 대체)
export interface PepperEntry {
  path: string
  score: number
}

export interface PepperResult {
  scores: PepperEntry[]
  /** max_commits 초과로 분석을 건너뛴 경우 true. */
  tooLarge: boolean
  /** since=days 범위 안의 총 커밋 수. */
  totalCommits: number
}

// stale 페퍼 — N일 이상 변경 없는 파일
export interface StaleResult {
  stalePaths: string[]
  tooLarge: boolean
  totalCommits: number
}

export interface RecentRepo {
  path: string
  name: string
  lastOpened: string
}

export interface StashEntry {
  index: number
  refName: string
  branch: string
  message: string
}

// Symbol: 파일 안의 함수/클래스/메서드 등 (Phase 9-A)
export interface Symbol {
  name: string
  kind: string   // "function" | "class" | "method" | "interface" | "enum" | "type" | "struct" | "trait" | "impl" | "mod"
  startLine: number
  endLine: number
}

// Local AI 다운로드 진행 (Phase 11-B)
export type DownloadProgress =
  | { stage: 'started'; total: number }
  | { stage: 'chunk'; downloaded: number; total: number }
  | { stage: 'finished'; downloaded: number }
  | { stage: 'failed'; message: string }

export interface ModelStatus {
  id: string
  label: string
  description: string
  sizeBytes: number
  license: string
  licenseUrl: string
  recommended: boolean
  installed: boolean
  localBytes: number
}

export interface AiStatus {
  serverInstalled: boolean
  runningPort: number | null
  runningModel: string | null
  models: ModelStatus[]
}

// ───── API ──────────────────────────────────────────────

export const api = {
  openRepo: (path: string) => call<RepoInfo>('open_repo', { path }),

  getLog: (opts?: { maxCount?: number; file?: string; includeAll?: boolean }) =>
    call<CommitInfo[]>('get_log', {
      maxCount: opts?.maxCount ?? 200,
      file: opts?.file ?? null,
      includeAll: opts?.includeAll ?? false,
    }),

  getStatus: () => call<StatusInfo>('get_status'),

  getDiff: (hash: string) => call<string>('get_diff', { hash }),

  stage: (files: string[]) => call<void>('stage', { files }),

  unstage: (files: string[]) => call<void>('unstage', { files }),

  /** 변경사항 되돌리기 — tracked 는 HEAD 복원, untracked 는 옵션에 따라 영구 삭제. */
  discardFiles: (files: string[], includeUntracked: boolean) =>
    call<DiscardResult>('discard_files', { files, includeUntracked }),

  /** 부분 staging — hunk 단위 patch 를 stdin 으로 git apply --cached 에 전달. */
  applyPatchCached: (patch: string, reverse?: boolean) =>
    call<void>('apply_patch_cached', { patch, reverse: reverse ?? false }),

  commit: (message: string, body?: string) =>
    call<CommitResult>('commit', { message, body: body ?? null }),

  getBranches: () => call<BranchInfo>('get_branches'),

  checkout: (branch: string) => call<void>('checkout', { branch }),

  createBranch: (name: string, checkout?: boolean) =>
    call<void>('create_branch', { name, checkout: checkout ?? false }),

  deleteBranch: (name: string, force?: boolean) =>
    call<void>('delete_branch', { name, force: force ?? false }),

  mergeBranch: (name: string, noFf?: boolean) =>
    call<string>('merge_branch', { name, noFf: noFf ?? false }),

  // ── Cherry-pick (Phase 8-A) ──────────────────────────
  cherryPick: (hash: string, opts?: { noCommit?: boolean; mainline?: number }) =>
    call<void>('cherry_pick', {
      hash,
      noCommit: opts?.noCommit ?? false,
      mainline: opts?.mainline ?? null,
    }),
  cherryPickAbort: () => call<void>('cherry_pick_abort'),
  cherryPickContinue: () => call<void>('cherry_pick_continue'),
  cherryPickInProgress: () => call<boolean>('cherry_pick_in_progress'),

  // ── Reset (Phase 8-B) ────────────────────────────────
  reset: (hash: string, mode: 'soft' | 'mixed' | 'hard') =>
    call<void>('reset', { hash, mode }),

  // ── Rebase (Phase 8-C) ───────────────────────────────
  rebase: (target: string) => call<void>('rebase', { target }),
  rebaseAbort: () => call<void>('rebase_abort'),
  rebaseContinue: () => call<void>('rebase_continue'),
  rebaseSkip: () => call<void>('rebase_skip'),
  rebaseInProgress: () => call<boolean>('rebase_in_progress'),

  // ── Interactive rebase (Phase 8-D / 8-E / 8-F) ───────
  listCommitsInRange: (from: string) =>
    call<CommitInfo[]>('list_commits_in_range', { from }),
  interactiveRebase: (
    from: string,
    operations: Array<{
      hash: string
      action: 'pick' | 'reword' | 'squash' | 'fixup' | 'drop'
      message?: string
    }>,
  ) => call<void>('interactive_rebase', { from, operations }),

  // ── Conflict resolution (Phase 8-G-1) ────────────────
  listConflictedFiles: () =>
    call<Array<{ path: string; kind: string }>>('list_conflicted_files'),
  resolveConflict: (file: string, strategy: 'ours' | 'theirs') =>
    call<void>('resolve_conflict', { file, strategy }),

  fetch: () => call<void>('fetch'),
  getRemoteStatus: () => call<RemoteStatus>('get_remote_status'),
  push: () => call<void>('push'),
  pull: () => call<void>('pull'),

  getFileTree: () => call<FileTreeNode[]>('get_file_tree'),

  getDirectoryChildren: (relPath: string) =>
    call<FileTreeNode[]>('get_directory_children', { relPath }),

  getFileHistory: (filePath: string) =>
    call<CommitInfo[]>('get_file_history', { filePath }),

  getRecentRepos: () => call<RecentRepo[]>('get_recent_repos'),

  removeRecentRepo: (path: string) => call<void>('remove_recent_repo', { path }),

  clearRecentRepos: () => call<void>('clear_recent_repos'),

  // ── 핫 페퍼 배지용 슬림 백엔드 ─────────────────────
  getPepperScores: (opts?: { limit?: number; days?: number; maxCommits?: number }) =>
    call<PepperResult>('get_pepper_scores', {
      limit: opts?.limit ?? 1000,
      days: opts?.days ?? 90,
      maxCommits: opts?.maxCommits ?? 10000,
    }),

  // ── stale 페퍼: N일 이상 변경 없는 파일 ───────────
  getStaleFiles: (opts?: { thresholdDays?: number; maxCommits?: number }) =>
    call<StaleResult>('get_stale_files', {
      thresholdDays: opts?.thresholdDays ?? 365,
      maxCommits: opts?.maxCommits ?? 30000,
    }),

  // ── Stash ────────────────────────────────────────────
  stashList: () => call<StashEntry[]>('stash_list'),

  stashSave: (message?: string, includeUntracked?: boolean) =>
    call<void>('stash_save', {
      message: message ?? null,
      includeUntracked: includeUntracked ?? false,
    }),

  stashApply: (refName: string) => call<void>('stash_apply', { refName }),
  stashPop: (refName: string) => call<void>('stash_pop', { refName }),
  stashDrop: (refName: string) => call<void>('stash_drop', { refName }),
  stashShow: (refName: string) => call<string>('stash_show', { refName }),

  // ── Working tree diff ────────────────────────────────
  getUnstagedDiff: (file: string) => call<string>('get_unstaged_diff', { file }),
  getStagedDiff: (file: string) => call<string>('get_staged_diff', { file }),
  getStagedDiffAll: () => call<string>('get_staged_diff_all'),

  // ── Symbols (Phase 9) ────────────────────────────────
  getSymbols: (filePath: string) =>
    call<Symbol[]>('get_symbols', { filePath }),

  getSymbolHistory: (filePath: string, startLine: number, endLine: number) =>
    call<CommitInfo[]>('get_symbol_history', { filePath, startLine, endLine }),

  getSymbolHistoryPatch: (filePath: string, startLine: number, endLine: number) =>
    call<string>('get_symbol_history_patch', { filePath, startLine, endLine }),

  // ── Local AI (Phase 11-B) ────────────────────────────
  aiStatus: () => call<AiStatus>('ai_status'),

  aiDownloadModel: (modelId: string, onProgress?: (p: DownloadProgress) => void) =>
    call<void>('ai_download_model', {
      modelId,
      onProgress: mkDownloadChannel(onProgress),
    }),

  aiDownloadServer: (onProgress?: (p: DownloadProgress) => void) =>
    call<string>('ai_download_server', {
      onProgress: mkDownloadChannel(onProgress),
    }),

  aiStartServer: (modelId: string) =>
    call<number>('ai_start_server', { modelId }),

  aiStopServer: () => call<void>('ai_stop_server'),
}

function mkDownloadChannel(handler?: (p: DownloadProgress) => void): Channel<DownloadProgress> {
  const ch = new Channel<DownloadProgress>()
  if (handler) ch.onmessage = handler
  return ch
}