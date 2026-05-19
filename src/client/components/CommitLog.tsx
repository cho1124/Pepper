import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Tag, Cherry, AlertTriangle, Play, X as XIcon, RotateCcw, AlertOctagon, GitMerge, SkipForward } from 'lucide-react'
import { api, type CommitInfo } from '../api'
import { buildGraph, maxLaneCount } from '../lib/graph'
import { useDateFormat, formatCommitDate, useRowPaddingY } from '../lib/displaySettings'
import { CommitGraph } from './CommitGraph'
import { useConfirm } from './ConfirmModal'
import { useToast } from './Toast'
import { InteractiveRebaseModal } from './InteractiveRebaseModal'

const GRAPH_LINE_HEIGHT_BASE = 36
const GRAPH_LANE_WIDTH = 14

interface Props {
  selectedCommit: string | null
  onSelectCommit: (hash: string) => void
  file?: string | null
}

interface ParsedRefs {
  head: boolean
  branches: string[]
  remotes: string[]
  tags: string[]
}

function parseRefs(refs: string): ParsedRefs {
  const result: ParsedRefs = { head: false, branches: [], remotes: [], tags: [] }
  if (!refs) return result
  for (const raw of refs.split(',').map(s => s.trim()).filter(Boolean)) {
    if (raw.startsWith('HEAD -> ')) {
      result.head = true
      result.branches.push(raw.slice('HEAD -> '.length))
    } else if (raw === 'HEAD') {
      result.head = true
    } else if (raw.startsWith('tag: ')) {
      result.tags.push(raw.slice('tag: '.length))
    } else if (raw.includes('/')) {
      result.remotes.push(raw)
    } else {
      result.branches.push(raw)
    }
  }
  return result
}

const pillStyle: React.CSSProperties = {
  padding: '1px 6px',
  borderRadius: '3px',
  fontSize: '10px',
  marginRight: '4px',
  fontFamily: 'var(--font-mono)',
  display: 'inline-block',
  whiteSpace: 'nowrap'
}

const PAGE_SIZE = 100
const INCLUDE_ALL_LS_KEY = 'pepper.commitLog.includeAll'

interface CtxMenu {
  hash: string
  hashShort: string
  x: number
  y: number
  isMerge: boolean
}

function ConflictsPanel({
  conflicts,
  onResolve,
}: {
  conflicts: Array<{ path: string; kind: string }>
  onResolve: (file: string, strategy: 'ours' | 'theirs') => void
}) {
  return (
    <div style={{
      padding: '8px 12px',
      background: 'rgba(243, 139, 168, 0.06)',
      borderBottom: '1px solid var(--red)',
      borderLeft: '3px solid var(--red)',
      fontSize: 12,
      color: 'var(--text-primary)',
    }}>
      <div style={{
        fontSize: 11,
        color: 'var(--red)',
        marginBottom: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <AlertTriangle size={12} strokeWidth={2.5} />
        충돌 {conflicts.length}개 — Take ours/theirs 로 빠른 해결, 또는 외부 에디터에서 수동 해결 후 Stage
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {conflicts.map(c => (
          <li
            key={c.path}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 0',
              fontSize: 11,
            }}
          >
            <span style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {c.path}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{c.kind}</span>
            <button
              className="btn btn-sm"
              onClick={() => onResolve(c.path, 'ours')}
              title="현재 브랜치 버전으로 해결"
              style={{ fontSize: 10, padding: '2px 6px' }}
            >
              Take ours
            </button>
            <button
              className="btn btn-sm"
              onClick={() => onResolve(c.path, 'theirs')}
              title="들어오는 버전으로 해결"
              style={{ fontSize: 10, padding: '2px 6px' }}
            >
              Take theirs
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProgressBanner({
  label,
  onContinue,
  onSkip,
  onAbort,
}: {
  label: string
  onContinue: () => void
  onSkip?: () => void
  onAbort: () => void
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      background: 'rgba(249, 226, 175, 0.12)',
      borderBottom: '1px solid var(--yellow)',
      borderLeft: '3px solid var(--yellow)',
      fontSize: '12px',
      color: 'var(--text-primary)',
    }}>
      <AlertTriangle size={14} strokeWidth={2.5} color="var(--yellow)" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{label}</span>
      <button
        className="btn btn-sm"
        onClick={onContinue}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        <Play size={11} strokeWidth={2.5} /> 계속
      </button>
      {onSkip && (
        <button
          className="btn btn-sm"
          onClick={onSkip}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <SkipForward size={11} strokeWidth={2.5} /> 건너뛰기
        </button>
      )}
      <button
        className="btn btn-sm"
        onClick={onAbort}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          background: 'var(--red)',
          color: 'var(--bg-primary)',
          borderColor: 'var(--red)',
        }}
      >
        <XIcon size={11} strokeWidth={2.5} /> 중단
      </button>
    </div>
  )
}

function MenuButton({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        padding: '6px 10px',
        background: 'none',
        border: 'none',
        color: danger ? 'var(--red)' : 'var(--text-primary)',
        textAlign: 'left',
        cursor: 'pointer',
        borderRadius: 'calc(var(--radius) - 2px)',
        fontSize: '12px',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

export function CommitLog({ selectedCommit, onSelectCommit, file }: Props) {
  const [commits, setCommits] = useState<CommitInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reachedEnd, setReachedEnd] = useState(false)
  const [includeAll, setIncludeAll] = useState<boolean>(() => {
    if (file) return false
    try {
      const v = localStorage.getItem(INCLUDE_ALL_LS_KEY)
      return v === null ? true : v === 'true'
    } catch {
      return true
    }
  })
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [cherryInProgress, setCherryInProgress] = useState(false)
  const [rebaseInProgress, setRebaseInProgress] = useState(false)
  const [conflicts, setConflicts] = useState<Array<{ path: string; kind: string }>>([])
  const [irebaseTarget, setIrebaseTarget] = useState<{ from: string; fromShort: string } | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const confirm = useConfirm()
  const toast = useToast()

  // 초기/파일 변경/토글 변경 시 로드
  useEffect(() => {
    setLoading(true)
    setReachedEnd(false)
    api.getLog({ maxCount: PAGE_SIZE, file: file ?? undefined, includeAll }).then(result => {
      if (result.ok) {
        setCommits(result.data)
        if (result.data.length < PAGE_SIZE) setReachedEnd(true)
      } else {
        setCommits([])
        toast.error(`커밋 로그 로드 실패: ${result.error}`)
      }
      setLoading(false)
    })
  }, [file, includeAll, toast])

  // includeAll 변경 시 localStorage 저장 (파일 모드 제외)
  useEffect(() => {
    if (file) return
    try { localStorage.setItem(INCLUDE_ALL_LS_KEY, String(includeAll)) } catch {}
  }, [includeAll, file])

  const reload = useCallback(async () => {
    const target = Math.max(commits.length, PAGE_SIZE)
    const result = await api.getLog({ maxCount: target, file: file ?? undefined, includeAll })
    if (result.ok) {
      setCommits(result.data)
      setReachedEnd(result.data.length < target)
    } else {
      toast.error(`커밋 로그 갱신 실패: ${result.error}`)
    }
  }, [commits.length, file, includeAll, toast])

  const refreshCherryStatus = useCallback(async () => {
    const r = await api.cherryPickInProgress()
    setCherryInProgress(r.ok ? r.data : false)
  }, [])

  const refreshRebaseStatus = useCallback(async () => {
    const r = await api.rebaseInProgress()
    setRebaseInProgress(r.ok ? r.data : false)
  }, [])

  const refreshConflicts = useCallback(async () => {
    const r = await api.listConflictedFiles()
    setConflicts(r.ok ? r.data : [])
  }, [])

  useEffect(() => {
    refreshCherryStatus()
    refreshRebaseStatus()
    refreshConflicts()
  }, [refreshCherryStatus, refreshRebaseStatus, refreshConflicts])

  const handleResolveConflict = async (file: string, strategy: 'ours' | 'theirs') => {
    const r = await api.resolveConflict(file, strategy)
    if (r.ok) {
      toast.success(`${file}: ${strategy === 'ours' ? '내 버전' : '상대 버전'} 으로 해결`)
    } else {
      toast.error(`해결 실패: ${r.error}`)
    }
    await refreshConflicts()
  }

  // 컨텍스트 메뉴 외부 클릭/Esc 로 닫기
  useEffect(() => {
    if (!ctxMenu) return
    const onMouseDown = () => setCtxMenu(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtxMenu(null)
    }
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [ctxMenu])

  const handleCherryPick = async (target: CtxMenu) => {
    setCtxMenu(null)
    const mainline = target.isMerge ? 1 : undefined
    const message = target.isMerge
      ? `머지 커밋입니다. 첫 번째 부모(-m 1)를 기준으로 cherry-pick 합니다.\n\n${target.hashShort}`
      : `이 커밋을 현재 브랜치에 cherry-pick 합니다.\n\n${target.hashShort}`
    const ok = await confirm({
      title: 'Cherry-pick',
      message,
      variant: 'warn',
      confirmLabel: 'Cherry-pick',
    })
    if (!ok) return
    const result = await api.cherryPick(target.hash, { mainline })
    if (result.ok) {
      toast.success('Cherry-pick 완료')
    } else {
      toast.error(`Cherry-pick 실패: ${result.error}`)
    }
    await reload()
    await refreshCherryStatus()
    await refreshConflicts()
  }

  const handleCherryAbort = async () => {
    const ok = await confirm({
      title: 'Cherry-pick 중단',
      message: '진행 중인 cherry-pick을 중단하고 이전 상태로 되돌립니다.',
      variant: 'danger',
      confirmLabel: '중단',
    })
    if (!ok) return
    const r = await api.cherryPickAbort()
    if (r.ok) {
      toast.info('Cherry-pick 중단됨')
    } else {
      toast.error(`중단 실패: ${r.error}`)
    }
    await reload()
    await refreshCherryStatus()
    await refreshConflicts()
  }

  const handleCherryContinue = async () => {
    const r = await api.cherryPickContinue()
    if (r.ok) {
      toast.success('Cherry-pick 계속 완료')
    } else {
      toast.error(`계속 실패: ${r.error}`)
    }
    await reload()
    await refreshCherryStatus()
    await refreshConflicts()
  }

  const handleRebase = async (target: CtxMenu) => {
    setCtxMenu(null)
    const ok = await confirm({
      title: 'Rebase',
      message: `현재 브랜치를 이 커밋 위로 rebase 합니다.\n히스토리가 다시 쓰여지므로 이미 push 한 브랜치라면 충돌 위험이 있습니다.\n\n대상: ${target.hashShort}`,
      variant: 'warn',
      confirmLabel: 'Rebase',
    })
    if (!ok) return
    const result = await api.rebase(target.hash)
    if (result.ok) {
      toast.success('Rebase 완료')
    } else {
      toast.error(`Rebase 실패: ${result.error}`)
    }
    await reload()
    await refreshRebaseStatus()
    await refreshConflicts()
  }

  const handleRebaseContinue = async () => {
    const r = await api.rebaseContinue()
    if (r.ok) {
      toast.success('Rebase 계속 완료')
    } else {
      toast.error(`계속 실패: ${r.error}`)
    }
    await reload()
    await refreshRebaseStatus()
    await refreshConflicts()
  }

  const handleRebaseSkip = async () => {
    const ok = await confirm({
      title: 'Rebase 건너뛰기',
      message: '현재 충돌 중인 커밋을 건너뜁니다 (해당 커밋은 새 히스토리에 포함되지 않음).',
      variant: 'warn',
      confirmLabel: '건너뛰기',
    })
    if (!ok) return
    const r = await api.rebaseSkip()
    if (r.ok) {
      toast.info('커밋 건너뜀')
    } else {
      toast.error(`건너뛰기 실패: ${r.error}`)
    }
    await reload()
    await refreshRebaseStatus()
    await refreshConflicts()
  }

  const handleRebaseAbort = async () => {
    const ok = await confirm({
      title: 'Rebase 중단',
      message: '진행 중인 rebase를 중단하고 이전 상태로 되돌립니다.',
      variant: 'danger',
      confirmLabel: '중단',
    })
    if (!ok) return
    const r = await api.rebaseAbort()
    if (r.ok) {
      toast.info('Rebase 중단됨')
    } else {
      toast.error(`중단 실패: ${r.error}`)
    }
    await reload()
    await refreshRebaseStatus()
    await refreshConflicts()
  }

  const handleReset = async (target: CtxMenu, mode: 'soft' | 'mixed' | 'hard') => {
    setCtxMenu(null)
    const variant = mode === 'hard' ? 'danger' : 'warn'
    const description: Record<typeof mode, string> = {
      soft: '현재 HEAD만 이 커밋으로 이동합니다. staging과 working tree의 변경사항은 그대로 보존됩니다.',
      mixed: '현재 HEAD를 이 커밋으로 이동하고 staging을 비웁니다. working tree의 변경사항은 보존됩니다.',
      hard: '⚠️ HEAD / staging / working tree 를 모두 이 커밋 상태로 되돌립니다.\n\n커밋되지 않은 모든 변경사항이 영구적으로 사라집니다.',
    }
    const ok = await confirm({
      title: `Reset (${mode})`,
      message: `${description[mode]}\n\n대상: ${target.hashShort}`,
      variant,
      confirmLabel: mode === 'hard' ? 'Hard reset' : `Reset (${mode})`,
    })
    if (!ok) return
    const result = await api.reset(target.hash, mode)
    if (result.ok) {
      toast.success(`Reset (${mode}) 완료`)
    } else {
      toast.error(`Reset 실패: ${result.error}`)
    }
    await reload()
  }

  const loadMore = useCallback(async () => {
    if (loadingMore || reachedEnd) return
    setLoadingMore(true)
    const result = await api.getLog({
      maxCount: commits.length + PAGE_SIZE,
      file: file ?? undefined,
      includeAll,
    })
    setLoadingMore(false)
    if (result.ok) {
      const next = result.data
      if (next.length <= commits.length) {
        setReachedEnd(true)
      } else {
        setCommits(next)
        if (next.length - commits.length < PAGE_SIZE) setReachedEnd(true)
      }
    } else {
      toast.error(`커밋 로그 추가 로드 실패: ${result.error}`)
    }
  }, [commits.length, file, loadingMore, reachedEnd, includeAll, toast])

  // 키보드 네비 (↑/↓) — 리스트에 focus 된 상태에서
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!listRef.current) return
      if (!listRef.current.contains(document.activeElement) && document.activeElement !== listRef.current) return
      if (commits.length === 0) return

      const currentIdx = selectedCommit ? commits.findIndex(c => c.hash === selectedCommit) : -1

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        const next = currentIdx < commits.length - 1 ? currentIdx + 1 : 0
        onSelectCommit(commits[next].hash)
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        const prev = currentIdx > 0 ? currentIdx - 1 : commits.length - 1
        onSelectCommit(commits[prev].hash)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [commits, selectedCommit, onSelectCommit])

  // 선택된 커밋이 바뀌면 스크롤로 맞춰줌
  useEffect(() => {
    if (!selectedCommit || !listRef.current) return
    const el = listRef.current.querySelector<HTMLLIElement>(`[data-hash="${selectedCommit}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [selectedCommit])

  const dateFormat = useDateFormat()
  const rowPaddingY = useRowPaddingY()
  const graphLineHeight = GRAPH_LINE_HEIGHT_BASE + rowPaddingY * 2
  const formatDate = (dateStr: string) => formatCommitDate(dateStr, dateFormat)

  // 그래프 레인 계산
  const graphRows = useMemo(() => buildGraph(commits), [commits])
  const laneCount = useMemo(() => maxLaneCount(graphRows), [graphRows])

  const toolbar = !file && (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-1)',
        fontSize: 12,
        color: 'var(--text-secondary)',
      }}
    >
      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <input
          type="checkbox"
          checked={includeAll}
          onChange={e => setIncludeAll(e.target.checked)}
          style={{ cursor: 'pointer' }}
        />
        <span>전체 브랜치 보기</span>
      </label>
    </div>
  )

  if (loading) return <>{toolbar}<div className="loading"><span className="spinner" /> 커밋 로딩 중...</div></>
  if (commits.length === 0) return <>{toolbar}<div className="loading">커밋이 없습니다</div></>

  return (
    <>
      {toolbar}
      {cherryInProgress && (
        <ProgressBanner
          label="Cherry-pick 진행 중. 충돌이 있으면 해결한 뒤 계속하세요."
          onContinue={handleCherryContinue}
          onAbort={handleCherryAbort}
        />
      )}
      {rebaseInProgress && (
        <ProgressBanner
          label="Rebase 진행 중. 충돌을 해결하면 계속, 이 커밋을 건너뛰려면 건너뛰기, 되돌리려면 중단을 누르세요."
          onContinue={handleRebaseContinue}
          onSkip={handleRebaseSkip}
          onAbort={handleRebaseAbort}
        />
      )}
      {(cherryInProgress || rebaseInProgress) && conflicts.length > 0 && (
        <ConflictsPanel
          conflicts={conflicts}
          onResolve={handleResolveConflict}
        />
      )}
      <ul
        ref={listRef}
        className="commit-list"
        tabIndex={0}
        role="listbox"
        aria-label="커밋 목록 (↑/↓ 또는 j/k 로 이동)"
      >
        {commits.map((commit, idx) => {
          const parsed = parseRefs(commit.refs)
          const isSelected = selectedCommit === commit.hash
          const graphRow = graphRows[idx]
          return (
            <li
              key={commit.hash}
              data-hash={commit.hash}
              className={`commit-item ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectCommit(commit.hash)}
              onContextMenu={(e) => {
                e.preventDefault()
                setCtxMenu({
                  hash: commit.hash,
                  hashShort: commit.hashShort,
                  x: e.clientX,
                  y: e.clientY,
                  isMerge: commit.parents.length >= 2,
                })
              }}
              role="option"
              aria-selected={isSelected}
            >
              {graphRow && (
                <CommitGraph
                  row={graphRow}
                  commitHash={commit.hash}
                  laneCount={laneCount}
                  laneWidth={GRAPH_LANE_WIDTH}
                  lineHeight={graphLineHeight}
                />
              )}
              <span className="commit-hash">{commit.hashShort}</span>
              <span className="commit-message">
                {parsed.head && (
                  <span style={{ ...pillStyle, background: 'var(--accent)', color: 'var(--bg-primary)' }}>
                    HEAD
                  </span>
                )}
                {parsed.branches.map(b => (
                  <span key={`b-${b}`} style={{ ...pillStyle, background: 'var(--bg-hover)', color: 'var(--mauve)' }}>
                    {b}
                  </span>
                ))}
                {parsed.remotes.map(r => (
                  <span key={`r-${r}`} style={{ ...pillStyle, background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
                    {r}
                  </span>
                ))}
                {parsed.tags.map(t => (
                  <span key={`t-${t}`} style={{ ...pillStyle, background: 'rgba(249, 226, 175, 0.15)', color: 'var(--yellow)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <Tag size={9} strokeWidth={2.5} /> {t}
                  </span>
                ))}
                {commit.message}
              </span>
              <span className="commit-meta">{commit.author} · {formatDate(commit.date)}</span>
            </li>
          )
        })}
      </ul>

      {/* 페이지네이션 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px',
        fontSize: '11px',
        color: 'var(--text-muted)',
        borderTop: '1px solid var(--border)'
      }}>
        {reachedEnd ? (
          <span>총 {commits.length}개 · 끝</span>
        ) : (
          <>
            <span style={{ marginRight: '8px' }}>{commits.length}개 로드됨</span>
            <button
              className="btn btn-sm"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <><span className="spinner" style={{ width: 10, height: 10, borderWidth: 1 }} /> 로드 중</>
              ) : (
                `+${PAGE_SIZE}개 더 보기`
              )}
            </button>
          </>
        )}
      </div>

      {/* 우클릭 컨텍스트 메뉴 */}
      {ctxMenu && (
        <div
          role="menu"
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: ctxMenu.x,
            top: ctxMenu.y,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            padding: '4px',
            minWidth: '180px',
            zIndex: 9000,
            fontSize: '12px',
          }}
        >
          <MenuButton
            icon={<Cherry size={13} strokeWidth={2.5} color="var(--red)" />}
            label={`Cherry-pick${ctxMenu.isMerge ? ' (merge, -m 1)' : ''}`}
            onClick={() => handleCherryPick(ctxMenu)}
          />
          <MenuButton
            icon={<GitMerge size={13} strokeWidth={2.5} color="var(--mauve)" />}
            label="Rebase current onto here"
            onClick={() => handleRebase(ctxMenu)}
          />
          <MenuButton
            icon={<GitMerge size={13} strokeWidth={2.5} color="var(--mauve)" />}
            label="Interactive rebase from here"
            onClick={() => {
              setIrebaseTarget({ from: ctxMenu.hash, fromShort: ctxMenu.hashShort })
              setCtxMenu(null)
            }}
          />

          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

          <MenuButton
            icon={<RotateCcw size={13} strokeWidth={2.5} color="var(--yellow)" />}
            label="Reset (soft) — 변경사항 보존"
            onClick={() => handleReset(ctxMenu, 'soft')}
          />
          <MenuButton
            icon={<RotateCcw size={13} strokeWidth={2.5} color="var(--yellow)" />}
            label="Reset (mixed) — staging 비움"
            onClick={() => handleReset(ctxMenu, 'mixed')}
          />
          <MenuButton
            icon={<AlertOctagon size={13} strokeWidth={2.5} color="var(--red)" />}
            label="Reset (hard) — 모든 변경 삭제"
            onClick={() => handleReset(ctxMenu, 'hard')}
            danger
          />
        </div>
      )}

      {/* Interactive rebase 모달 */}
      {irebaseTarget && (
        <InteractiveRebaseModal
          from={irebaseTarget.from}
          fromShort={irebaseTarget.fromShort}
          onClose={() => setIrebaseTarget(null)}
          onApplied={async () => {
            setIrebaseTarget(null)
            await reload()
            await refreshRebaseStatus()
            await refreshConflicts()
          }}
        />
      )}
    </>
  )
}