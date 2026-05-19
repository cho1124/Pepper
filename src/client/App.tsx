import { useState, useCallback, useEffect } from 'react'
import { Settings as SettingsIcon } from 'lucide-react'
import { api, type RepoInfo } from './api'
import { FileTree } from './components/FileTree'
import { CommitLog } from './components/CommitLog'
import { DiffView } from './components/DiffView'
import { StatusBar } from './components/StatusBar'
import { CommitPanel } from './components/CommitPanel'
import { FileHistory } from './components/FileHistory'
import { BranchSelector } from './components/BranchSelector'
import { WelcomeScreen } from './components/WelcomeScreen'
import { RepoSelector } from './components/RepoSelector'
import { RemoteSyncButton } from './components/RemoteSyncButton'
import { SettingsModal } from './components/SettingsModal'
import { BackgroundDecor } from './components/BackgroundDecor'
import { WindowControls } from './components/WindowControls'
import { onDragHandle } from './lib/dragRegion'
import { useToast } from './components/Toast'
import { HotspotProvider } from './lib/hotspotContext'

type Tab = 'changes' | 'commits'

function repoNameFromPath(path: string): string {
  const cleaned = path.replace(/[\\/]+$/, '')
  const idx = Math.max(cleaned.lastIndexOf('/'), cleaned.lastIndexOf('\\'))
  return idx >= 0 ? cleaned.slice(idx + 1) : cleaned
}

export default function App() {
  const toast = useToast()
  const [repo, setRepo] = useState<RepoInfo | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('changes')
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [diff, setDiff] = useState<string>('')
  const [showFileHistory, setShowFileHistory] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const v = parseInt(localStorage.getItem('pepper.sidebarWidth') ?? '260', 10)
      return Number.isFinite(v) && v >= 180 && v <= 600 ? v : 260
    } catch { return 260 }
  })
  const [resizing, setResizing] = useState(false)

  const handleOpenRepo = useCallback(async (path: string) => {
    const trimmed = path.trim()
    if (!trimmed) return
    setLoading(true)
    const result = await api.openRepo(trimmed)
    setLoading(false)
    if (result.ok) {
      setRepo(result.data)
      setSelectedCommit(null)
      setDiff('')
      setSelectedFile(null)
      setShowFileHistory(false)
      setActiveTab('changes')
      setRefreshKey(k => k + 1)
    } else {
      toast.error(result.error)
    }
  }, [toast])

  const handleSelectCommit = useCallback(async (hash: string) => {
    setSelectedCommit(hash)
    const result = await api.getDiff(hash)
    if (result.ok) {
      setDiff(result.data)
    } else {
      setDiff('')
      toast.error(`diff 로드 실패: ${result.error}`)
    }
  }, [toast])

  const handleSelectFile = useCallback((path: string) => {
    setSelectedFile(path)
    setShowFileHistory(true)
  }, [])

  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])

  const handleBranchChanged = useCallback((newBranch: string) => {
    setRepo(prev => prev ? { ...prev, currentBranch: newBranch } : prev)
    setSelectedCommit(null)
    setDiff('')
    setRefreshKey(k => k + 1)
  }, [])

  const handleSidebarResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setResizing(true)
    const startX = e.clientX
    const startWidth = sidebarWidth
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(180, Math.min(600, startWidth + (ev.clientX - startX)))
      setSidebarWidth(next)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setResizing(false)
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  useEffect(() => {
    try { localStorage.setItem('pepper.sidebarWidth', String(sidebarWidth)) } catch {}
  }, [sidebarWidth])

  // 키보드 단축키 (Ctrl+1~2 탭 전환, F5 새로고침)
  useEffect(() => {
    if (!repo) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '1') { e.preventDefault(); setActiveTab('changes') }
        else if (e.key === '2') { e.preventDefault(); setActiveTab('commits') }
      }
      if (e.key === 'F5') { e.preventDefault(); handleRefresh() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [repo, handleRefresh])

  if (!repo) {
    return (
      <div className="app-container">
        <BackgroundDecor />
        {/* data-tauri-drag-region 부착 X — Tauri 자동 핸들러가 closest()로
            부모를 찾기 때문에 자식 버튼에 "false" 줘도 부모 drag region 매치되어 충돌.
            onMouseDown(onDragHandle)만 사용하고 핸들러 내부에서 인터랙티브 자식 차단. */}
        <div className="welcome-titlebar" onMouseDown={onDragHandle}>
          <Logo />
          <div style={{ flex: 1 }} />
          <WindowControls />
        </div>
        <WelcomeScreen onOpen={handleOpenRepo} opening={loading} />
      </div>
    )
  }

  return (
    <HotspotProvider repoPath={repo.path} refreshKey={refreshKey}>
    <div className="app-container">
      <BackgroundDecor />
      <header className="app-header" style={{ gap: 8 }} onMouseDown={onDragHandle}>
        <Logo />
        <RepoSelector
          currentPath={repo.path}
          currentName={repoNameFromPath(repo.path)}
          onPickRepo={handleOpenRepo}
        />
        <BranchSelector
          currentBranch={repo.currentBranch}
          onBranchChanged={handleBranchChanged}
          refreshKey={refreshKey}
        />

        <div style={{
          paddingLeft: 8,
          borderLeft: '1px solid var(--border)',
          marginLeft: 4,
        }}>
          <RemoteSyncButton
            refreshKey={refreshKey}
            onSynced={handleRefresh}
          />
        </div>

        <div className="header-drag-spacer" style={{ flex: 1 }} />

        <IconButton
          icon={<SettingsIcon size={13} />}
          label="설정"
          onClick={() => setSettingsOpen(true)}
        />
        <WindowControls />
      </header>

      <div className="app-body">
        {/* Sidebar */}
        <div className="sidebar" style={{ width: sidebarWidth }}>
          <div className="sidebar-tabs">
            <button
              className={`sidebar-tab ${!showFileHistory ? 'active' : ''}`}
              onClick={() => setShowFileHistory(false)}
            >
              파일 트리
            </button>
            <button
              className={`sidebar-tab ${showFileHistory ? 'active' : ''}`}
              onClick={() => selectedFile && setShowFileHistory(true)}
              title="선택한 파일의 함수/클래스 단위 변경 히스토리"
            >
              심볼 히스토리
            </button>
          </div>
          <div className="sidebar-content">
            {showFileHistory && selectedFile ? (
              <FileHistory
                key={`fh-${refreshKey}`}
                filePath={selectedFile}
                selectedCommit={selectedCommit}
                onSelectCommit={(hash) => {
                  setActiveTab('commits')
                  handleSelectCommit(hash)
                }}
              />
            ) : (
              <FileTree
                key={`ft-${refreshKey}`}
                onSelectFile={handleSelectFile}
                selectedFile={selectedFile}
              />
            )}
          </div>
        </div>

        {/* Resizer between sidebar and main content */}
        <div
          className={`sidebar-resizer${resizing ? ' dragging' : ''}`}
          onMouseDown={handleSidebarResizeStart}
          role="separator"
          aria-orientation="vertical"
          title="드래그하여 사이드바 너비 조정 · 더블클릭으로 기본값"
          onDoubleClick={() => setSidebarWidth(260)}
        />

        {/* Main Content */}
        <div className="main-content">
          <div className="content-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === 'changes'}
              className={`content-tab ${activeTab === 'changes' ? 'active' : ''}`}
              onClick={() => setActiveTab('changes')}
              title="Ctrl+1"
            >
              변경사항
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'commits'}
              className={`content-tab ${activeTab === 'commits' ? 'active' : ''}`}
              onClick={() => setActiveTab('commits')}
              title="Ctrl+2"
            >
              커밋 로그
            </button>
          </div>

          <div className="content-area">
            {activeTab === 'changes' && (
              <CommitPanel key={`cp-${refreshKey}`} onCommitDone={handleRefresh} />
            )}

            {activeTab === 'commits' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ flex: 1, overflow: 'auto' }}>
                  <CommitLog
                    key={`cl-${refreshKey}`}
                    selectedCommit={selectedCommit}
                    onSelectCommit={handleSelectCommit}
                    file={selectedFile}
                  />
                </div>
                {diff && (
                  <div style={{ flex: 1, overflow: 'auto', borderTop: '1px solid var(--border)' }}>
                    <DiffView diff={diff} />
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      <StatusBar
        branch={repo.currentBranch}
        refreshKey={refreshKey}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
    </HotspotProvider>
  )
}

/** 좌측 워드마크. 부모 헤더의 onMouseDown 이 드래그 처리. */
function Logo() {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px 4px 4px',
        userSelect: 'none',
        cursor: 'default',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 20,
          height: 20,
          borderRadius: 5,
          background: 'linear-gradient(135deg, var(--mauve), var(--accent))',
          display: 'inline-block',
        }}
      />
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.3px',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        Pepper
      </span>
    </div>
  )
}

interface IconButtonProps {
  icon: React.ReactNode
  label: string
  shortcut?: string
  onClick: () => void
  busy?: boolean
  disabled?: boolean
}

function IconButton({ icon, label, shortcut, onClick, busy, disabled }: IconButtonProps) {
  return (
    <button
      className="btn btn-sm"
      onClick={onClick}
      disabled={disabled || busy}
      title={shortcut ? `${label} · ${shortcut}` : label}
      aria-label={label}
      style={{
        padding: '4px 6px',
        minWidth: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? <span className="spinner" style={{ width: 11, height: 11, borderWidth: 1 }} /> : icon}
    </button>
  )
}
