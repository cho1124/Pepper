import { useState, useEffect, useCallback, useRef } from 'react'
import {
  RefreshCw,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
  CloudOff,
  ChevronDown,
  Check,
} from 'lucide-react'
import { api, type RemoteStatus } from '../api'
import { useToast } from './Toast'

interface Props {
  /** 트리거 변경 시 즉시 재조회 (예: 커밋/브랜치 전환 직후) */
  refreshKey: number
  /** sync/push/pull 후 호출 — 부모가 다른 뷰들 갱신 */
  onSynced: () => void
}

const POLL_INTERVAL_MS = 5000

type Action = 'fetch' | 'pull' | 'push'

export function RemoteSyncButton({ refreshKey, onSynced }: Props) {
  const toast = useToast()
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  const [busy, setBusy] = useState<null | Action>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    const r = await api.getRemoteStatus()
    if (r.ok) setStatus(r.data)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh, refreshKey])

  // 5초 폴링
  useEffect(() => {
    const id = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [refresh])

  // 메뉴 외부 클릭 / Esc 닫기
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const runAction = async (action: Action) => {
    setMenuOpen(false)
    setBusy(action)
    let r
    if (action === 'fetch') r = await api.fetch()
    else if (action === 'pull') r = await api.pull()
    else r = await api.push()
    setBusy(null)
    if (r.ok) {
      toast.success(`${labelMap[action]} 완료`)
      await refresh()
      onSynced()
    } else {
      const summary = classifyRemoteError(r.error)
      const detail = firstNonEmptyLine(r.error)
      toast.error(`${labelMap[action]} 실패 — ${summary}\n${detail}`)
    }
  }

  // 표시 상태 결정
  const view = computeView(status)

  const showCounts = !!status?.hasUpstream

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        className="btn btn-sm"
        onClick={view.primary ? () => runAction(view.primary!) : undefined}
        disabled={!view.primary || busy !== null}
        title={view.title}
        aria-label={view.label}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '8px 14px',
          fontSize: 13,
          fontWeight: 500,
          color: view.color,
          borderRight: 'none',
          borderTopRightRadius: 0,
          borderBottomRightRadius: 0,
        }}
      >
        {busy ? (
          <span className="spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }} />
        ) : (
          view.icon
        )}
        <span>{view.label}</span>
        {showCounts && status && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
            <CountPill value={status.ahead} arrow="↑" color="var(--accent)" />
            <CountPill value={status.behind} arrow="↓" color="var(--peach)" />
          </span>
        )}
      </button>
      <button
        className="btn btn-sm"
        onClick={() => setMenuOpen(v => !v)}
        disabled={busy !== null || !status?.hasUpstream}
        aria-label="동기화 옵션"
        title="다른 동작 선택"
        style={{
          padding: '8px 8px',
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          marginLeft: -1,
        }}
      >
        <ChevronDown size={14} />
      </button>

      {menuOpen && status?.hasUpstream && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: 260,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
            zIndex: 100,
            padding: 6,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              padding: '6px 10px',
              fontFamily: 'var(--font-mono)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
              {status.upstream}
            </span>
            <CountPill value={status.ahead} arrow="↑" color="var(--accent)" />
            <CountPill value={status.behind} arrow="↓" color="var(--peach)" />
          </div>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <MenuItem
            icon={<RefreshCw size={13} />}
            label="Fetch (--all --prune)"
            onClick={() => runAction('fetch')}
            highlight={view.primary === 'fetch'}
          />
          <MenuItem
            icon={<ArrowDownToLine size={13} />}
            label={`Pull${status.behind > 0 ? ` (${status.behind})` : ''}`}
            onClick={() => runAction('pull')}
            highlight={view.primary === 'pull'}
            disabled={status.behind === 0}
          />
          <MenuItem
            icon={<ArrowUpFromLine size={13} />}
            label={`Push${status.ahead > 0 ? ` (${status.ahead})` : ''}`}
            onClick={() => runAction('push')}
            highlight={view.primary === 'push'}
            disabled={status.ahead === 0}
          />
        </div>
      )}
    </div>
  )
}

function CountPill({ value, arrow, color }: { value: number; arrow: '↑' | '↓'; color: string }) {
  const active = value > 0
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        padding: '1px 6px',
        borderRadius: 10,
        background: active ? color : 'transparent',
        color: active ? 'var(--bg-primary)' : 'var(--text-muted)',
        border: active ? 'none' : '1px solid var(--border)',
        minWidth: 22,
        justifyContent: 'center',
        lineHeight: 1.3,
      }}
      aria-label={`${value} ${arrow === '↑' ? 'ahead' : 'behind'}`}
    >
      {value}{arrow}
    </span>
  )
}

const labelMap: Record<Action, string> = {
  fetch: 'Fetch',
  pull: 'Pull',
  push: 'Push',
}

/**
 * git stderr 패턴을 한국어 요약으로 매핑.
 * 모르는 패턴은 첫 줄 그대로 반환 (정보 손실 없음).
 */
function classifyRemoteError(raw: string): string {
  const s = raw.toLowerCase()
  if (
    s.includes('could not resolve host') ||
    s.includes('unable to access') ||
    s.includes('failed to connect') ||
    s.includes('could not read from remote') ||
    s.includes('connection timed out') ||
    s.includes('network is unreachable')
  ) {
    return '네트워크 연결 실패 (호스트/방화벽 확인 필요)'
  }
  if (
    s.includes('authentication failed') ||
    s.includes('could not read username') ||
    s.includes('permission denied') ||
    s.includes('invalid credentials')
  ) {
    return '원격 인증 실패 (자격 증명/PAT 확인 필요)'
  }
  if (s.includes('no tracking information') || s.includes('no upstream branch')) {
    return '원격 추적 브랜치 미설정 (push -u 필요)'
  }
  if (
    s.includes('updates were rejected') ||
    s.includes('non-fast-forward') ||
    s.includes('fetch first')
  ) {
    return 'Push 거부 — 원격에 새 커밋 있음 (먼저 pull 필요)'
  }
  if (
    s.includes('your local changes') ||
    s.includes('would be overwritten') ||
    s.includes('uncommitted changes')
  ) {
    return '로컬 변경이 덮어써질 위험 (먼저 commit/stash 필요)'
  }
  if (s.includes('merge conflict') || s.includes('automatic merge failed')) {
    return '머지 충돌 — 수동 해결 필요'
  }
  if (
    s.includes('you are in the middle of') ||
    s.includes('rebase in progress') ||
    s.includes('merge in progress') ||
    s.includes('cherry-pick is now empty')
  ) {
    return '진행 중인 작업 있음 (먼저 완료/중단 필요)'
  }
  return firstNonEmptyLine(raw)
}

function firstNonEmptyLine(raw: string): string {
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (t) return t.length > 140 ? t.slice(0, 140) + '…' : t
  }
  return raw
}

interface ViewState {
  primary: Action | null
  icon: React.ReactNode
  label: string
  title: string
  color: string
}

function computeView(status: RemoteStatus | null): ViewState {
  if (!status) {
    return {
      primary: null,
      icon: <RefreshCw size={13} />,
      label: '...',
      title: '상태 조회 중',
      color: 'var(--text-muted)',
    }
  }
  if (!status.hasUpstream) {
    return {
      primary: null,
      icon: <CloudOff size={13} />,
      label: 'No upstream',
      title: '원격 추적 브랜치가 설정되지 않았습니다 (push -u origin <branch> 필요)',
      color: 'var(--text-muted)',
    }
  }
  const { ahead, behind } = status
  if (ahead === 0 && behind === 0) {
    return {
      primary: 'fetch',
      icon: <Check size={15} color="var(--green)" strokeWidth={2.5} />,
      label: 'Sync',
      title: `${status.upstream} 와 동기화됨 — 클릭 시 fetch`,
      color: 'var(--green)',
    }
  }
  if (ahead > 0 && behind === 0) {
    return {
      primary: 'push',
      icon: <ArrowUpFromLine size={15} color="var(--accent)" />,
      label: 'Push',
      title: `로컬에만 ${ahead}개 커밋 — 클릭 시 push`,
      color: 'var(--accent)',
    }
  }
  if (ahead === 0 && behind > 0) {
    return {
      primary: 'pull',
      icon: <ArrowDownToLine size={15} color="var(--peach)" />,
      label: 'Pull',
      title: `원격에만 ${behind}개 커밋 — 클릭 시 pull`,
      color: 'var(--peach)',
    }
  }
  // diverged
  return {
    primary: 'fetch',
    icon: <AlertTriangle size={15} color="var(--yellow)" />,
    label: 'Diverged',
    title: `히스토리 분기 (${ahead}↑ ${behind}↓) — 클릭 시 fetch (pull/push는 직접 판단 필요)`,
    color: 'var(--yellow)',
  }
}

function MenuItem({
  icon,
  label,
  onClick,
  highlight,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  highlight?: boolean
  disabled?: boolean
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '8px 12px',
        background: 'transparent',
        border: 'none',
        borderRadius: 4,
        color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
        fontSize: 13,
        cursor: disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left',
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      {highlight && <Check size={11} color="var(--accent)" />}
    </button>
  )
}
