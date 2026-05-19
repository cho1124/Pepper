import { useState, useEffect, useCallback } from 'react'
import { GitBranch, Circle, Sparkles, Cpu, AlertTriangle } from 'lucide-react'
import { api, type AiStatus } from '../api'
import { getSelectedLocalModel } from '../lib/ai/local'

interface Props {
  branch: string
  refreshKey?: number
  /** AI 칩 클릭 시 설정창 열기 (엔진/모델 미설치 등 fallback) */
  onOpenSettings?: () => void
}

const POLL_INTERVAL = 5000 // 5s
const AI_POLL_INTERVAL = 3000 // 3s — 시작/종료 직후 빠른 반영

export function StatusBar({ branch, refreshKey, onOpenSettings }: Props) {
  const [changeCount, setChangeCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    const fetchStatus = async () => {
      const result = await api.getStatus()
      if (cancelled) return
      if (result.ok) {
        const s = result.data
        setChangeCount(
          (s.modified?.length || 0) + (s.not_added?.length || 0) +
          (s.deleted?.length || 0) + (s.staged?.length || 0)
        )
      }
    }

    fetchStatus()
    const id = setInterval(fetchStatus, POLL_INTERVAL)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [refreshKey])

  return (
    <div className="status-bar">
      <span className="branch" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <GitBranch size={11} /> {branch}
      </span>
      {changeCount > 0 && (
        <span className="changes" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Circle size={8} fill="currentColor" strokeWidth={0} /> {changeCount}개 변경
        </span>
      )}
      <div style={{ flex: 1 }} />
      <AiStatusChip onOpenSettings={onOpenSettings} />
      <span style={{ marginLeft: 8 }}>Pepper v{__APP_VERSION__}</span>
    </div>
  )
}

function AiStatusChip({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [busy, setBusy] = useState<'starting' | 'stopping' | null>(null)

  const refresh = useCallback(async () => {
    const r = await api.aiStatus()
    if (r.ok) setStatus(r.data)
  }, [])

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      if (cancelled) return
      const r = await api.aiStatus()
      if (!cancelled && r.ok) setStatus(r.data)
    }
    tick()
    const id = setInterval(tick, AI_POLL_INTERVAL)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  if (!status) return null

  const running = status.runningPort !== null
  const selectedModelId = getSelectedLocalModel()
  const selectedModel = status.models.find(m => m.id === selectedModelId)
  const serverInstalled = status.serverInstalled
  const modelInstalled = selectedModel?.installed ?? false

  // 상태 결정 — 우선순위: busy > 미설치 > running > off
  let icon: React.ReactNode
  let label: string
  let color: string
  let title: string

  if (busy === 'starting') {
    icon = <span className="spinner" style={{ width: 9, height: 9, borderWidth: 1 }} />
    label = 'starting'
    color = 'var(--yellow)'
    title = '서버 시작 중 (최대 30초)'
  } else if (busy === 'stopping') {
    icon = <span className="spinner" style={{ width: 9, height: 9, borderWidth: 1 }} />
    label = 'stopping'
    color = 'var(--text-muted)'
    title = '서버 종료 중'
  } else if (!serverInstalled) {
    icon = <AlertTriangle size={10} />
    label = '엔진 미설치'
    color = 'var(--peach)'
    title = '클릭 → 설정창에서 llama-server 다운로드'
  } else if (!modelInstalled) {
    icon = <AlertTriangle size={10} />
    label = '모델 미설치'
    color = 'var(--peach)'
    title = '클릭 → 설정창에서 모델 다운로드'
  } else if (running) {
    icon = <Sparkles size={10} fill="currentColor" />
    label = `AI · :${status.runningPort}`
    color = 'var(--green)'
    title = `Qwen Coder 실행 중 — 클릭하면 종료`
  } else {
    icon = <Cpu size={10} />
    label = 'AI off'
    color = 'var(--text-muted)'
    title = `클릭 → ${selectedModel?.label ?? '선택된 모델'} 로 서버 시작`
  }

  const handleClick = async () => {
    if (busy) return
    if (!serverInstalled || !modelInstalled) {
      onOpenSettings?.()
      return
    }
    if (running) {
      setBusy('stopping')
      const r = await api.aiStopServer()
      setBusy(null)
      if (!r.ok) console.error('AI stop failed:', r.error)
      await refresh()
    } else {
      setBusy('starting')
      const r = await api.aiStartServer(selectedModelId)
      setBusy(null)
      if (!r.ok) console.error('AI start failed:', r.error)
      await refresh()
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 8px',
        fontSize: 10,
        fontFamily: 'var(--font-mono)',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 10,
        color,
        cursor: busy ? 'wait' : 'pointer',
        opacity: busy ? 0.7 : 1,
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}