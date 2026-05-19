import { useState, useEffect, useCallback } from 'react'
import {
  Settings as SettingsIcon, X, Check, Sparkles, Eye, EyeOff,
  Trash2, Copy, Pencil, AlertTriangle, Palette, SlidersHorizontal, Bot,
  ChevronRight, ChevronDown,
} from 'lucide-react'
import {
  type Theme, type CustomTheme,
  builtinThemes, getSavedTheme, applyTheme,
  getCustomThemes, saveCustomTheme, deleteCustomTheme,
} from './ThemeSelector'
import {
  listProviders, getProvider, getSelectedProviderId, setSelectedProviderId,
  type ThemePalette, type ThemeAiProvider, type ProviderAvailability,
  ANTHROPIC_API_KEY_STORAGE, ANTHROPIC_MODEL_STORAGE, ANTHROPIC_DEFAULT_MODEL,
  ANTHROPIC_MODEL_OPTIONS,
} from '../lib/ai'
import { ManualPaletteEditor } from './ManualPaletteEditor'
import { LocalAiSettings } from './LocalAiSettings'
import { AVAILABLE_ICON_NAMES } from './BackgroundDecor'
import { useToast } from './Toast'
import { useConfirm } from './ConfirmModal'
import {
  useDateFormat, setDateFormat, type DateFormatMode,
  useRowPaddingY, setRowPaddingY,
  ROW_PADDING_MIN, ROW_PADDING_MAX, ROW_PADDING_DEFAULT,
  useShowSpiceLevels, setShowSpiceLevels,
  useMaxPepperCommits, setMaxPepperCommits,
  MAX_PEPPER_MIN, MAX_PEPPER_MAX, MAX_PEPPER_DEFAULT, MAX_PEPPER_STEP,
  useShowStalePepper, setShowStalePepper,
  useStaleThresholdDays, setStaleThresholdDays,
  STALE_DAYS_MIN, STALE_DAYS_MAX, STALE_DAYS_DEFAULT, STALE_DAYS_STEP,
} from '../lib/displaySettings'
import { usePepperStatus } from '../lib/hotspotContext'
import {
  useDecorConfig, setDecorConfig,
  DENSITY_MIN, DENSITY_MAX, OPACITY_MIN, OPACITY_MAX, SIZE_MIN, SIZE_MAX,
  type IconSet, type SpeedLevel, type ColorSource, type DriftMode,
} from '../lib/decorSettings'

interface Props {
  onClose: () => void
}

type TabId = 'appearance' | 'behavior' | 'ai'

interface TabDef {
  id: TabId
  label: string
  icon: typeof Palette
}

const TABS: TabDef[] = [
  { id: 'appearance', label: '외형', icon: Palette },
  { id: 'behavior', label: '동작', icon: SlidersHorizontal },
  { id: 'ai', label: 'AI', icon: Bot },
]

type EditorMode = 'closed' | 'manual' | 'ai-result' | 'edit-existing'

interface EditorState {
  mode: EditorMode
  initial: ThemePalette | null
  /** 'edit-existing' 일 때 갱신할 custom theme id */
  editingId?: string
}

const DEFAULT_EMPTY: ThemePalette = {
  name: 'Custom Theme',
  tokens: {
    'bg-primary': '#1e1e2e', 'bg-secondary': '#181825', 'bg-surface': '#313244', 'bg-hover': '#45475a',
    'text-primary': '#cdd6f4', 'text-secondary': '#bac2de', 'text-muted': '#7f849c',
    'border': '#45475a', 'accent': '#89b4fa', 'green': '#a6e3a1', 'yellow': '#f9e2af',
    'peach': '#fab387', 'red': '#f38ba8', 'mauve': '#cba6f7',
  },
}

export function SettingsModal({ onClose }: Props) {
  const toast = useToast()
  const confirm = useConfirm()
  const [activeTab, setActiveTab] = useState<TabId>('appearance')
  const [theme, setTheme] = useState<Theme>(getSavedTheme())
  const [entered, setEntered] = useState(false)
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([])
  const dateFormat = useDateFormat()
  const rowPaddingY = useRowPaddingY()
  const showSpice = useShowSpiceLevels()
  const maxPepperCommits = useMaxPepperCommits()
  const showStale = useShowStalePepper()
  const staleThresholdDays = useStaleThresholdDays()
  const pepperStatus = usePepperStatus()
  const decor = useDecorConfig()

  // provider 상태
  const providers = listProviders()
  const [providerId, setProviderId] = useState<string>(() => getSelectedProviderId())
  const [providerStatus, setProviderStatus] = useState<Record<string, ProviderAvailability>>({})

  // 생성기 상태
  const [genOpen, setGenOpen] = useState(false)
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem(ANTHROPIC_API_KEY_STORAGE) ?? '')
  const [showKey, setShowKey] = useState(false)
  const [model, setModel] = useState<string>(() => localStorage.getItem(ANTHROPIC_MODEL_STORAGE) ?? ANTHROPIC_DEFAULT_MODEL)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)

  // 편집기 상태
  const [editor, setEditor] = useState<EditorState>({ mode: 'closed', initial: null })
  // 편집/AI 미리보기 시작 직전의 테마 (취소 시 복원)
  const [previewStash, setPreviewStash] = useState<Theme | null>(null)

  // 데코 AI 생성 상태
  const [decorPrompt, setDecorPrompt] = useState('')
  const [decorBusy, setDecorBusy] = useState(false)

  useEffect(() => { setCustomThemes(getCustomThemes()) }, [])

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 10)
    return () => clearTimeout(t)
  }, [])

  // provider 가용 상태 갱신
  const refreshAvailability = useCallback(async () => {
    const next: Record<string, ProviderAvailability> = {}
    for (const p of providers) {
      next[p.id] = await p.isAvailable()
    }
    setProviderStatus(next)
  }, [providers])

  useEffect(() => {
    refreshAvailability()
  }, [refreshAvailability, apiKey])

  const handleClose = useCallback(() => {
    if (previewStash) applyTheme(previewStash)
    onClose()
  }, [previewStash, onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleClose])

  const handleSelectTheme = (next: Theme) => {
    if (previewStash) {
      // 미리보기 / 편집 중에 다른 테마 클릭 → 미리보기 취소
      setEditor({ mode: 'closed', initial: null })
      setPreviewStash(null)
    }
    setTheme(next)
    applyTheme(next)
  }

  const handleDeleteCustom = async (id: string, name: string) => {
    const ok = await confirm({
      title: '테마 삭제',
      message: `커스텀 테마 "${name}"를 삭제합니다.`,
      variant: 'danger',
      confirmLabel: '삭제',
    })
    if (!ok) return
    deleteCustomTheme(id)
    setCustomThemes(getCustomThemes())
    if (theme === id) handleSelectTheme('mocha')
    toast.info(`"${name}" 삭제됨`)
  }

  const handleEditExisting = (c: CustomTheme) => {
    if (!previewStash) setPreviewStash(theme)
    setEditor({
      mode: 'edit-existing',
      initial: { name: c.name, tokens: c.tokens },
      editingId: c.id,
    })
  }

  const handleManualNew = () => {
    if (!previewStash) setPreviewStash(theme)
    applyInline(DEFAULT_EMPTY)
    setEditor({ mode: 'manual', initial: DEFAULT_EMPTY })
  }

  const handleGenerate = async () => {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt) {
      toast.error('테마 설명을 입력하세요')
      return
    }
    const provider = getProvider(providerId)
    if (!provider) {
      toast.error('Provider 가 선택되지 않았습니다')
      return
    }
    const status = await provider.isAvailable()
    if (!status.ok) {
      toast.error(`${provider.label} 사용 불가: ${status.reason}`)
      return
    }

    // Anthropic 의 경우 키/모델 자동 저장
    if (providerId === 'anthropic') {
      localStorage.setItem(ANTHROPIC_API_KEY_STORAGE, apiKey.trim())
      localStorage.setItem(ANTHROPIC_MODEL_STORAGE, model)
    }
    setSelectedProviderId(providerId)

    setBusy(true)
    try {
      const palette = await provider.generate({ prompt: trimmedPrompt, model })
      // 미리보기 stash + 편집기로 결과 넘기기
      if (!previewStash) setPreviewStash(theme)
      applyInline(palette)
      setEditor({ mode: 'ai-result', initial: palette })
    } catch (e) {
      toast.error(`테마 생성 실패: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const handleEditorSave = (palette: ThemePalette) => {
    if (editor.mode === 'edit-existing' && editor.editingId) {
      // 기존 custom 갱신 — id 유지, name/tokens 교체
      const existing = customThemes.find(t => t.id === editor.editingId)
      const item: CustomTheme = {
        id: editor.editingId,
        name: palette.name,
        tokens: palette.tokens,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      }
      saveCustomTheme(item)
      setCustomThemes(getCustomThemes())
      setTheme(item.id)
      applyTheme(item.id)
      toast.success(`"${item.name}" 갱신됨`)
    } else {
      const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const item: CustomTheme = {
        id, name: palette.name, tokens: palette.tokens,
        createdAt: new Date().toISOString(),
      }
      saveCustomTheme(item)
      setCustomThemes(getCustomThemes())
      setTheme(id)
      applyTheme(id)
      toast.success(`"${item.name}" 저장됨`)
    }
    setEditor({ mode: 'closed', initial: null })
    setPreviewStash(null)
    setPrompt('')
  }

  const handleEditorClose = () => {
    if (previewStash) applyTheme(previewStash)
    setEditor({ mode: 'closed', initial: null })
    setPreviewStash(null)
    setTheme(getSavedTheme())
  }

  const handleGenerateDecor = async () => {
    const trimmed = decorPrompt.trim()
    if (!trimmed) {
      toast.error('데코 설명을 입력하세요')
      return
    }
    const provider = getProvider(providerId)
    if (!provider?.generateDecor) {
      toast.error(`${provider?.label ?? '현재 provider'}는 데코 생성을 지원하지 않습니다`)
      return
    }
    const status = await provider.isAvailable()
    if (!status.ok) {
      toast.error(`${provider.label} 사용 불가: ${status.reason}`)
      return
    }
    setDecorBusy(true)
    try {
      const result = await provider.generateDecor({ prompt: trimmed })
      setDecorConfig({ ...result, enabled: true })
      toast.success(`데코 적용 — ${result.iconSet} · ${result.density}개 · ${result.drift}`)
      setDecorPrompt('')
    } catch (e) {
      toast.error(`데코 생성 실패: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setDecorBusy(false)
    }
  }

  const handleCopyJson = (target: ThemePalette | CustomTheme) => {
    const json = JSON.stringify({ name: target.name, tokens: target.tokens }, null, 2)
    navigator.clipboard.writeText(json)
      .then(() => toast.info('JSON 클립보드 복사됨'))
      .catch(() => toast.error('클립보드 복사 실패'))
  }

  const selectedProvider = getProvider(providerId)
  const selectedStatus = providerStatus[providerId]
  const editorOpen = editor.mode !== 'closed'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
        opacity: entered ? 1 : 0, transition: 'opacity 0.15s ease-out',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          width: 800,
          maxWidth: 'calc(100vw - 40px)',
          height: 600,
          maxHeight: 'calc(100vh - 80px)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          transform: entered ? 'scale(1)' : 'scale(0.96)',
          transition: 'transform 0.15s ease-out',
          overflow: 'hidden',
        }}
      >
        {/* 헤더 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
        }}>
          <SettingsIcon size={16} strokeWidth={2.5} color="var(--accent)" style={{ flexShrink: 0 }} />
          <h3 id="settings-title" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
            설정
          </h3>
          <button
            aria-label="닫기"
            onClick={handleClose}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', padding: 2, display: 'flex',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* 본문: 좌측 탭 nav + 우측 패널 */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* 좌측 탭 nav */}
          <nav
            aria-label="설정 탭"
            style={{
              width: 140, flexShrink: 0,
              borderRight: '1px solid var(--border)',
              padding: '12px 8px',
              display: 'flex', flexDirection: 'column', gap: 2,
              background: 'var(--bg-primary)',
            }}
          >
            {TABS.map(t => {
              const Icon = t.icon
              const selected = t.id === activeTab
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  aria-current={selected ? 'page' : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px',
                    border: 'none',
                    borderRadius: 'calc(var(--radius) - 2px)',
                    background: selected ? 'var(--bg-surface)' : 'transparent',
                    color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontSize: 12,
                    fontWeight: selected ? 600 : 400,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Icon size={13} />
                  {t.label}
                </button>
              )
            })}
          </nav>

          {/* 우측 패널 */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', minWidth: 0 }}>
            {activeTab === 'appearance' && (
              <>
                {/* 테마 그리드 */}
                <Section title="테마" id="appearance-theme">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                    {builtinThemes.map(t => {
                      const selected = t.id === theme && !editorOpen
                      return (
                        <ThemeCard
                          key={t.id}
                          label={t.label}
                          preview={t.preview}
                          selected={selected}
                          onClick={() => handleSelectTheme(t.id)}
                        />
                      )
                    })}
                    {customThemes.map(c => {
                      const selected = c.id === theme && !editorOpen
                      return (
                        <ThemeCard
                          key={c.id}
                          label={c.name}
                          preview={c.tokens['bg-primary']}
                          accent={c.tokens['accent']}
                          selected={selected}
                          onClick={() => handleSelectTheme(c.id)}
                          onEdit={() => handleEditExisting(c)}
                          onDelete={() => handleDeleteCustom(c.id, c.name)}
                          onCopy={() => handleCopyJson(c)}
                        />
                      )
                    })}
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={handleManualNew}
                      disabled={editorOpen}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, padding: '5px 10px',
                      }}
                    >
                      <Pencil size={11} /> 직접 만들기
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-mauve"
                      onClick={() => setGenOpen(v => !v)}
                      disabled={editorOpen}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, padding: '5px 10px',
                      }}
                    >
                      <Sparkles size={11} /> AI 생성기 {genOpen ? '닫기' : '열기'}
                    </button>
                  </div>
                </Section>

                {/* 편집기가 열려 있으면 그것만 보여주기 (포커스) */}
                {editorOpen && editor.initial && (
                  <Section
                    collapsible={false}
                    title={
                      editor.mode === 'ai-result' ? 'AI 생성 결과 — 미세 조정' :
                      editor.mode === 'edit-existing' ? '기존 테마 편집' :
                      '수동 편집'
                    }
                  >
                    <ManualPaletteEditor
                      key={`editor-${editor.mode}-${editor.editingId ?? 'new'}`}
                      initial={editor.initial}
                      onSave={handleEditorSave}
                      onClose={handleEditorClose}
                      onLivePreview={applyInline}
                    />
                  </Section>
                )}

                {/* AI 생성기 — 편집기 닫혀 있고 genOpen 일 때만. provider 설정은 AI 탭에서. */}
                {genOpen && !editorOpen && (
                  <Section title="AI 테마 생성" collapsible={false}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <ProviderIndicator
                        provider={selectedProvider}
                        status={selectedStatus}
                        onJumpToAiTab={() => setActiveTab('ai')}
                      />

                      <div>
                        <Label>테마 설명</Label>
                        <textarea
                          value={prompt}
                          onChange={e => setPrompt(e.target.value)}
                          placeholder="예: 가을 숲속 분위기의 따뜻한 어두운 테마, 황금색 강조"
                          rows={2}
                          style={{ width: '100%', fontSize: 11, padding: '6px 8px', resize: 'vertical' }}
                          disabled={busy}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={handleGenerate}
                          disabled={busy || !selectedStatus?.ok}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11 }}
                        >
                          {busy ? (
                            <><span className="spinner" style={{ width: 11, height: 11, borderWidth: 1 }} /> 생성 중</>
                          ) : (
                            <><Sparkles size={11} /> 생성하기</>
                          )}
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => setGenOpen(false)}
                          disabled={busy}
                          style={{ fontSize: 11 }}
                        >
                          닫기
                        </button>
                      </div>
                    </div>
                  </Section>
                )}

                {/* 배경 데코 */}
                <Section title="배경 데코" id="appearance-decor">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={decor.enabled}
                        onChange={e => setDecorConfig({ enabled: e.target.checked })}
                      />
                      <span>배경에 떠다니는 아이콘 표시</span>
                    </label>

                    {/* AI 자연어 → 데코 설정 */}
                    <div>
                      <Label>AI 로 생성 (자연어)</Label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input
                          type="text"
                          value={decorPrompt}
                          onChange={e => setDecorPrompt(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !decorBusy) handleGenerateDecor() }}
                          placeholder="예: 코드가 비처럼 떨어지는 분위기"
                          disabled={decorBusy}
                          style={{ flex: 1, fontSize: 11, padding: '4px 6px' }}
                        />
                        <button
                          type="button"
                          className="btn btn-sm btn-mauve"
                          onClick={handleGenerateDecor}
                          disabled={decorBusy || !decorPrompt.trim()}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontSize: 11, padding: '4px 10px',
                          }}
                        >
                          {decorBusy ? (
                            <><span className="spinner" style={{ width: 10, height: 10, borderWidth: 1 }} /> 생성</>
                          ) : (
                            <><Sparkles size={11} /> 생성</>
                          )}
                        </button>
                      </div>
                      <Hint>AI 탭의 provider 가 자연어를 8개 항목 JSON 으로 변환 → 즉시 적용 + 토글 자동 ON.</Hint>
                    </div>

                    {decor.enabled && (
                      <>
                        <div>
                          <Label>아이콘 종류</Label>
                          <select
                            value={decor.iconSet}
                            onChange={e => setDecorConfig({ iconSet: e.target.value as IconSet })}
                            style={{ width: '100%', fontSize: 11, padding: '4px 6px' }}
                          >
                            <option value="git">Git (브랜치/커밋/머지/체리/태그…)</option>
                            <option value="code">Code (대괄호/터미널/Cpu/Bug…)</option>
                            <option value="minimal">Minimal (원/사각/삼각형…)</option>
                            <option value="fun">Fun (고양이/강아지/별/하트…)</option>
                            <option value="custom">Custom (직접 지정)</option>
                            <option value="none">없음</option>
                          </select>
                        </div>

                        {decor.iconSet === 'custom' && (
                          <div>
                            <Label>커스텀 아이콘 — 쉼표로 구분</Label>
                            <input
                              type="text"
                              value={decor.customIcons.join(', ')}
                              onChange={e => setDecorConfig({
                                customIcons: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                              })}
                              placeholder="Cat, PawPrint, Heart"
                              style={{ width: '100%', fontSize: 11, padding: '4px 6px', fontFamily: 'var(--font-mono)' }}
                            />
                            <Hint>
                              사용 가능: {AVAILABLE_ICON_NAMES.join(', ')}
                            </Hint>
                          </div>
                        )}

                        <div>
                          <Label>
                            농도 (동시 표시 개수) — <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{decor.density}</span>
                          </Label>
                          <input
                            type="range"
                            min={DENSITY_MIN}
                            max={DENSITY_MAX}
                            step={1}
                            value={decor.density}
                            onChange={e => setDecorConfig({ density: parseInt(e.target.value, 10) })}
                            style={{ width: '100%' }}
                          />
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <Label>속도</Label>
                            <select
                              value={decor.speed}
                              onChange={e => setDecorConfig({ speed: e.target.value as SpeedLevel })}
                              style={{ width: '100%', fontSize: 11, padding: '4px 6px' }}
                            >
                              <option value="slow">느림 (60~120초)</option>
                              <option value="medium">보통 (25~50초)</option>
                              <option value="fast">빠름 (10~20초)</option>
                            </select>
                          </div>
                          <div style={{ flex: 1 }}>
                            <Label>방향</Label>
                            <select
                              value={decor.drift}
                              onChange={e => setDecorConfig({ drift: e.target.value as DriftMode })}
                              style={{ width: '100%', fontSize: 11, padding: '4px 6px' }}
                            >
                              <option value="all">자유 (제자리 떠다님)</option>
                              <option value="up">위로 (아래 → 위)</option>
                              <option value="down">아래로 (위 → 아래)</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <Label>
                            불투명도 — <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{decor.opacity.toFixed(2)}</span>
                          </Label>
                          <input
                            type="range"
                            min={OPACITY_MIN}
                            max={OPACITY_MAX}
                            step={0.01}
                            value={decor.opacity}
                            onChange={e => setDecorConfig({ opacity: parseFloat(e.target.value) })}
                            style={{ width: '100%' }}
                          />
                        </div>

                        <div>
                          <Label>
                            크기 — <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{decor.size}px</span>
                          </Label>
                          <input
                            type="range"
                            min={SIZE_MIN}
                            max={SIZE_MAX}
                            step={1}
                            value={decor.size}
                            onChange={e => setDecorConfig({ size: parseInt(e.target.value, 10) })}
                            style={{ width: '100%' }}
                          />
                        </div>

                        <div>
                          <Label>색상</Label>
                          <select
                            value={decor.color}
                            onChange={e => setDecorConfig({ color: e.target.value as ColorSource })}
                            style={{ width: '100%', fontSize: 11, padding: '4px 6px' }}
                          >
                            <option value="auto">자동 (테마 accent)</option>
                            <option value="accent">Accent</option>
                            <option value="mauve">Mauve</option>
                            <option value="green">Green</option>
                            <option value="peach">Peach</option>
                            <option value="yellow">Yellow</option>
                            <option value="red">Red</option>
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                </Section>
              </>
            )}

            {activeTab === 'behavior' && (
              <>
                <Section title="표시" id="behavior-display">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <Label>커밋 날짜 표시</Label>
                      <select
                        value={dateFormat}
                        onChange={e => setDateFormat(e.target.value as DateFormatMode)}
                        style={{ width: '100%', fontSize: 11, padding: '4px 6px' }}
                      >
                        <option value="relative">상대 시간 (3일 전, 2주 전)</option>
                        <option value="absolute">절대 날짜 (2026-05-09 14:32)</option>
                      </select>
                    </div>

                    <div>
                      <Label>
                        커밋 행 세로 여백 — <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{rowPaddingY}px</span>
                        {rowPaddingY !== ROW_PADDING_DEFAULT && (
                          <button
                            type="button"
                            onClick={() => setRowPaddingY(ROW_PADDING_DEFAULT)}
                            style={{
                              marginLeft: 6,
                              background: 'none', border: 'none',
                              color: 'var(--text-muted)', cursor: 'pointer',
                              fontSize: 10, padding: 0,
                              textDecoration: 'underline',
                            }}
                          >
                            초기화
                          </button>
                        )}
                      </Label>
                      <input
                        type="range"
                        min={ROW_PADDING_MIN}
                        max={ROW_PADDING_MAX}
                        step={1}
                        value={rowPaddingY}
                        onChange={e => setRowPaddingY(parseInt(e.target.value, 10))}
                        style={{ width: '100%' }}
                      />
                      <Hint>커밋 리스트 한 행의 위/아래 여백. 그래프 라인 높이도 함께 늘어납니다.</Hint>
                    </div>
                  </div>
                </Section>

                <Section title="핫 페퍼 (변경 잦은 파일)" id="behavior-pepper">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={showSpice}
                          onChange={e => setShowSpiceLevels(e.target.checked)}
                        />
                        <span>🌶️ 핫 페퍼 배지 표시</span>
                      </label>
                      <Hint>변경 잦은 파일 옆에 🌶️ 1~3개로 매운맛 등급 표시 (최근 90일 score 상위 33% / 10% / 3% percentile).</Hint>
                    </div>

                    {showSpice && (
                      <div>
                        <Label>
                          분석 임계값 — <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{maxPepperCommits.toLocaleString()}</span> 커밋
                          {maxPepperCommits !== MAX_PEPPER_DEFAULT && (
                            <button
                              type="button"
                              onClick={() => setMaxPepperCommits(MAX_PEPPER_DEFAULT)}
                              style={{
                                marginLeft: 6,
                                background: 'none', border: 'none',
                                color: 'var(--text-muted)', cursor: 'pointer',
                                fontSize: 10, padding: 0,
                                textDecoration: 'underline',
                              }}
                            >
                              초기화
                            </button>
                          )}
                        </Label>
                        <input
                          type="range"
                          min={MAX_PEPPER_MIN}
                          max={MAX_PEPPER_MAX}
                          step={MAX_PEPPER_STEP}
                          value={maxPepperCommits}
                          onChange={e => setMaxPepperCommits(parseInt(e.target.value, 10))}
                          style={{ width: '100%' }}
                        />
                        <Hint>
                          최근 90일 커밋이 이 값을 넘으면 페퍼 분석을 건너뜁니다 — 큰 레포 멈춤 방지.
                          {pepperStatus.totalCommits > 0 && (
                            <> 현재 레포: <span style={{ fontFamily: 'var(--font-mono)', color: pepperStatus.tooLarge ? 'var(--yellow)' : 'var(--text-secondary)' }}>{pepperStatus.totalCommits.toLocaleString()}</span> 커밋{pepperStatus.tooLarge ? ' — 임계값을 올리면 분석됩니다.' : ' — 분석 가능.'}</>
                          )}
                        </Hint>
                      </div>
                    )}
                  </div>
                </Section>

                <Section title="stale 페퍼 (오래 안 만진 파일)" id="behavior-stale">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={showStale}
                          onChange={e => setShowStalePepper(e.target.checked)}
                        />
                        <span style={{ filter: 'grayscale(1)', opacity: 0.7 }}>🌶️</span>
                        <span>stale 페퍼 배지 표시</span>
                      </label>
                      <Hint>임계값 이상 변경 없는 파일에 회색 페퍼 1개 표시. 핫 페퍼와 동시 해당이면 핫이 우선.</Hint>
                    </div>

                    {showStale && (
                      <div>
                        <Label>
                          stale 기준 — <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{staleThresholdDays}</span>일 이상 변경 없음
                          {staleThresholdDays !== STALE_DAYS_DEFAULT && (
                            <button
                              type="button"
                              onClick={() => setStaleThresholdDays(STALE_DAYS_DEFAULT)}
                              style={{
                                marginLeft: 6,
                                background: 'none', border: 'none',
                                color: 'var(--text-muted)', cursor: 'pointer',
                                fontSize: 10, padding: 0,
                                textDecoration: 'underline',
                              }}
                            >
                              초기화
                            </button>
                          )}
                        </Label>
                        <input
                          type="range"
                          min={STALE_DAYS_MIN}
                          max={STALE_DAYS_MAX}
                          step={STALE_DAYS_STEP}
                          value={staleThresholdDays}
                          onChange={e => setStaleThresholdDays(parseInt(e.target.value, 10))}
                          style={{ width: '100%' }}
                        />
                        <Hint>
                          이 기간 안에 한 번도 안 만진 파일이 stale. 30일(아주 보수적) ~ 730일(2년) 범위.
                          {pepperStatus.staleTotalCommits > 0 && (
                            <> 현재 레포 범위 내 커밋: <span style={{ fontFamily: 'var(--font-mono)', color: pepperStatus.staleTooLarge ? 'var(--yellow)' : 'var(--text-secondary)' }}>{pepperStatus.staleTotalCommits.toLocaleString()}</span>{pepperStatus.staleTooLarge ? ' — 30000 초과로 분석 건너뜀.' : ''}</>
                          )}
                        </Hint>
                      </div>
                    )}
                  </div>
                </Section>
              </>
            )}

            {activeTab === 'ai' && (
              <Section title="AI Provider" id="ai-provider" defaultExpanded>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Hint>여기 설정한 provider 가 외형 탭의 테마 생성, 배경 데코 생성 등 모든 AI 기능에 공통 사용됩니다.</Hint>

                  <div>
                    <Label>Provider</Label>
                    <select
                      value={providerId}
                      onChange={e => {
                        setProviderId(e.target.value)
                        setSelectedProviderId(e.target.value)
                      }}
                      style={{ width: '100%', fontSize: 11, padding: '4px 6px' }}
                    >
                      {providers.map(p => {
                        const s = providerStatus[p.id]
                        const ok = s?.ok ?? false
                        return (
                          <option key={p.id} value={p.id}>
                            {p.label}{ok ? '' : ` — ${s?.reason ?? '확인 중'}`}
                          </option>
                        )
                      })}
                    </select>
                    {selectedProvider && (
                      <Hint>
                        {selectedProvider.description}
                        {selectedStatus && !selectedStatus.ok && (
                          <span style={{ color: 'var(--yellow)', display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 6 }}>
                            <AlertTriangle size={9} /> {selectedStatus.reason}
                          </span>
                        )}
                      </Hint>
                    )}
                  </div>

                  {/* Anthropic 전용 옵션 */}
                  {providerId === 'anthropic' && (
                    <>
                      <div>
                        <Label>Anthropic API 키 (sk-ant-...)</Label>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <input
                            type={showKey ? 'text' : 'password'}
                            value={apiKey}
                            onChange={e => {
                              setApiKey(e.target.value)
                              localStorage.setItem(ANTHROPIC_API_KEY_STORAGE, e.target.value.trim())
                            }}
                            placeholder="sk-ant-api03-..."
                            style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => setShowKey(v => !v)}
                            aria-label={showKey ? '숨기기' : '보이기'}
                            style={{ padding: '4px 6px' }}
                          >
                            {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                        </div>
                        <Hint>로컬 localStorage 저장. console.anthropic.com 발급 키.</Hint>
                      </div>

                      <div>
                        <Label>모델</Label>
                        <select
                          value={model}
                          onChange={e => {
                            setModel(e.target.value)
                            localStorage.setItem(ANTHROPIC_MODEL_STORAGE, e.target.value)
                          }}
                          style={{ width: '100%', fontSize: 11, padding: '4px 6px' }}
                        >
                          {ANTHROPIC_MODEL_OPTIONS.map(m => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  {/* Local-llama: 엔진/모델 다운로드 + 시작/종료 UI */}
                  {providerId === 'local-llama' && (
                    <LocalAiSettings onChanged={refreshAvailability} />
                  )}
                </div>
              </Section>
            )}
          </div>
        </div>

        {/* 푸터 */}
        <div style={{
          padding: '8px 20px',
          borderTop: '1px solid var(--border)',
          fontSize: 10, color: 'var(--text-muted)',
        }}>
          Esc 또는 외부 클릭으로 닫기 · 편집 중이면 미리보기 자동 복원
        </div>
      </div>
    </div>
  )
}

/** AI 생성기 안 인디케이터 — 현재 provider 상태 + AI 탭으로 이동 안내. */
function ProviderIndicator({
  provider, status, onJumpToAiTab,
}: {
  provider: ThemeAiProvider | undefined
  status: ProviderAvailability | undefined
  onJumpToAiTab: () => void
}) {
  if (!provider) {
    return (
      <div style={{
        fontSize: 11, color: 'var(--yellow)',
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}>
        <AlertTriangle size={11} /> provider 가 선택되지 않았습니다.{' '}
        <button
          type="button"
          onClick={onJumpToAiTab}
          style={{
            background: 'none', border: 'none', color: 'var(--accent)',
            cursor: 'pointer', padding: 0, textDecoration: 'underline', fontSize: 11,
          }}
        >
          AI 탭에서 설정
        </button>
      </div>
    )
  }
  const ok = status?.ok ?? false
  return (
    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
      현재 provider: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{provider.label}</span>{' '}
      {ok ? (
        <span style={{ color: 'var(--green)' }}>· 사용 가능</span>
      ) : (
        <>
          <span style={{ color: 'var(--yellow)' }}>· {status?.reason ?? '확인 중'}</span>{' '}
          <button
            type="button"
            onClick={onJumpToAiTab}
            style={{
              background: 'none', border: 'none', color: 'var(--accent)',
              cursor: 'pointer', padding: 0, textDecoration: 'underline', fontSize: 11,
            }}
          >
            AI 탭에서 수정
          </button>
        </>
      )}
    </div>
  )
}

function ThemeCard({
  label, preview, accent, selected, onClick, onDelete, onCopy, onEdit,
}: {
  label: string
  preview: string
  accent?: string
  selected: boolean
  onClick: () => void
  onDelete?: () => void
  onCopy?: () => void
  onEdit?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px',
        background: selected ? 'var(--bg-surface)' : 'var(--bg-primary)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'calc(var(--radius) - 2px)',
        color: 'var(--text-primary)',
        fontSize: 12,
        cursor: 'pointer',
        textAlign: 'left',
        position: 'relative',
      }}
    >
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <span
          style={{
            display: 'block', width: 24, height: 24, borderRadius: 4,
            background: preview, border: '1px solid var(--border)',
          }}
        />
        {accent && (
          <span
            style={{
              position: 'absolute', right: -3, bottom: -3,
              width: 10, height: 10, borderRadius: '50%',
              background: accent, border: '1px solid var(--bg-secondary)',
            }}
          />
        )}
      </div>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {selected && <Check size={12} color="var(--accent)" />}
      {(onCopy || onDelete || onEdit) && (
        <div style={{ display: 'inline-flex', gap: 2 }}>
          {onEdit && (
            <button
              onClick={e => { e.stopPropagation(); onEdit() }}
              aria-label="편집"
              title="편집"
              style={{
                background: 'none', border: 'none', color: 'var(--mauve)',
                cursor: 'pointer', padding: 2, display: 'flex',
              }}
            >
              <Pencil size={11} />
            </button>
          )}
          {onCopy && (
            <button
              onClick={e => { e.stopPropagation(); onCopy() }}
              aria-label="JSON 복사"
              title="JSON 복사"
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', padding: 2, display: 'flex',
              }}
            >
              <Copy size={11} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={e => { e.stopPropagation(); onDelete() }}
              aria-label="삭제"
              title="삭제"
              style={{
                background: 'none', border: 'none', color: 'var(--red)',
                cursor: 'pointer', padding: 2, display: 'flex',
              }}
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Section({
  title, children,
  collapsible = true,
  defaultExpanded = true,
  id,
}: {
  title: string
  children: React.ReactNode
  /** false = 항상 펼침 + chevron 없음 (편집기/AI 생성기 등 조건부 Section 용). */
  collapsible?: boolean
  /** localStorage 값이 없을 때의 초기 상태. */
  defaultExpanded?: boolean
  /** localStorage 영속화 키. 없으면 영속화 X. */
  id?: string
}) {
  const storageKey = id ? `pepper.settings.section.${id}.expanded` : null
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (!collapsible) return true
    if (!storageKey) return defaultExpanded
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw === null) return defaultExpanded
      return raw === 'true'
    } catch {
      return defaultExpanded
    }
  })
  const toggle = () => {
    const next = !expanded
    setExpanded(next)
    if (storageKey) {
      try { localStorage.setItem(storageKey, String(next)) } catch {}
    }
  }

  if (!collapsible) {
    return (
      <div style={{ marginBottom: 18 }}>
        <div style={{
          fontSize: 10, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.5px',
          marginBottom: 8,
        }}>
          {title}
        </div>
        {children}
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'none', border: 'none',
          color: 'var(--text-muted)',
          fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px',
          fontWeight: 600,
          cursor: 'pointer', padding: '4px 0',
          marginBottom: expanded ? 6 : 0,
          width: '100%', textAlign: 'left',
        }}
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span>{title}</span>
      </button>
      {expanded && children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
      {children}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
      {children}
    </div>
  )
}

/** 미리보기 — 저장하지 않고 인라인 토큰만 적용 */
function applyInline(palette: ThemePalette) {
  document.documentElement.removeAttribute('data-theme')
  for (const [k, v] of Object.entries(palette.tokens)) {
    document.documentElement.style.setProperty(`--${k}`, v)
  }
}

// 사용 안 하지만 IDE 가 ThemeAiProvider 미사용 경고 안 내도록 (provider.label 등 직접 참조하므로 사실상 사용 중)
export type { ThemeAiProvider }
