import { useEffect, useState, useCallback } from 'react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { FolderOpen, Folder, X } from 'lucide-react'
import { api, type RecentRepo } from '../api'

interface Props {
  onOpen: (path: string) => void
  opening: boolean
}

export function WelcomeScreen({ onOpen, opening }: Props) {
  const [recents, setRecents] = useState<RecentRepo[]>([])
  const [manual, setManual] = useState('')
  const [loadingRecents, setLoadingRecents] = useState(true)

  const loadRecents = useCallback(async () => {
    setLoadingRecents(true)
    const result = await api.getRecentRepos()
    if (result.ok) setRecents(result.data)
    setLoadingRecents(false)
  }, [])

  useEffect(() => {
    loadRecents()
  }, [loadRecents])

  const handlePickFolder = async () => {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: 'Git 레포지토리 선택'
    })
    if (typeof selected === 'string' && selected) {
      onOpen(selected)
    }
  }

  const handleRemove = async (path: string) => {
    await api.removeRecentRepo(path)
    await loadRecents()
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60))
      if (hours === 0) return '방금 전'
      return `${hours}시간 전`
    }
    if (days === 1) return '어제'
    if (days < 7) return `${days}일 전`
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="welcome-screen">
      <h2>Pepper</h2>
      <p>심볼 단위 히스토리 · 내장 AI · 페퍼 배지 — 친근한 Git GUI</p>

      <div style={{ display: 'flex', gap: '8px', marginTop: '16px', alignItems: 'center' }}>
        <button
          className="btn btn-primary"
          onClick={handlePickFolder}
          disabled={opening}
          style={{ fontSize: '13px', padding: '8px 16px' }}
        >
          <FolderOpen size={14} style={{ marginRight: 2 }} />
          {opening ? '여는 중...' : '폴더 선택'}
        </button>
        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>또는 경로 직접 입력</span>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <input
          type="text"
          value={manual}
          onChange={e => setManual(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && manual.trim() && onOpen(manual.trim())}
          placeholder="C:/Users/.../Project"
          style={{ width: '420px' }}
        />
        <button
          className="btn btn-sm"
          onClick={() => manual.trim() && onOpen(manual.trim())}
          disabled={opening || !manual.trim()}
        >
          열기
        </button>
      </div>

      {/* 최근 레포 */}
      <div style={{
        marginTop: '32px',
        width: '520px',
        maxWidth: '90vw'
      }}>
        <div style={{
          fontSize: '11px',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '8px',
          padding: '0 4px'
        }}>
          최근 레포 {recents.length > 0 && `(${recents.length})`}
        </div>

        {loadingRecents ? (
          <div className="loading" style={{ padding: '16px' }}>
            <span className="spinner" /> 로딩 중...
          </div>
        ) : recents.length === 0 ? (
          <div style={{
            padding: '16px',
            fontSize: '11px',
            color: 'var(--text-muted)',
            textAlign: 'center',
            border: '1px dashed var(--border)',
            borderRadius: 'var(--radius)'
          }}>
            최근에 연 레포가 없습니다
          </div>
        ) : (
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden'
          }}>
            {recents.map(r => (
              <div
                key={r.path}
                onClick={() => !opening && onOpen(r.path)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--border)',
                  cursor: opening ? 'default' : 'pointer',
                  transition: 'background 0.1s'
                }}
                onMouseEnter={e => {
                  if (!opening) e.currentTarget.style.background = 'var(--bg-surface)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <Folder size={18} color="var(--peach)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{r.name}</div>
                  <div style={{
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {r.path}
                  </div>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  {formatDate(r.lastOpened)}
                </div>
                <button
                  className="btn btn-sm"
                  style={{ padding: '4px 6px', display: 'flex', alignItems: 'center' }}
                  onClick={e => { e.stopPropagation(); handleRemove(r.path) }}
                  title="목록에서 제거"
                  aria-label={`${r.name} 제거`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}