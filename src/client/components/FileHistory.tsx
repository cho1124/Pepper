import { useState, useEffect } from 'react'
import { Info, Sparkles, X as XIcon } from 'lucide-react'
import { api, type CommitInfo, type Symbol } from '../api'
import { useToast } from './Toast'
import { getProvider, getSelectedProviderId } from '../lib/ai'

// 옵션 B (2026-04-29): 파일 전체 로그는 우측 커밋 로그 탭에서 보고,
// 좌측은 심볼 단위 히스토리 전용으로 재정의.

interface Props {
  filePath: string
  selectedCommit?: string | null
  onSelectCommit?: (hash: string) => void
}

const KIND_COLORS: Record<string, string> = {
  function: 'var(--accent)',
  method: 'var(--accent)',
  constructor: 'var(--accent)',
  class: 'var(--mauve)',
  struct: 'var(--mauve)',
  record: 'var(--mauve)',
  interface: 'var(--yellow)',
  trait: 'var(--yellow)',
  enum: 'var(--peach)',
  impl: 'var(--green)',
  property: 'var(--green)',
  type: 'var(--red)',
  mod: 'var(--text-secondary)',
}

export function FileHistory({ filePath, selectedCommit, onSelectCommit }: Props) {
  const toast = useToast()
  const [commits, setCommits] = useState<CommitInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [symbols, setSymbols] = useState<Symbol[]>([])
  // -1 = 전체 파일
  const [selectedSymbolIdx, setSelectedSymbolIdx] = useState<number>(-1)
  // AI 요약 상태 (Phase 11-B-2-b)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [summaryBusy, setSummaryBusy] = useState(false)

  // 심볼 로드 (파일 바뀔 때만)
  useEffect(() => {
    setSelectedSymbolIdx(-1)
    setSymbols([])
    api.getSymbols(filePath).then(result => {
      if (result.ok) setSymbols(result.data)
    })
  }, [filePath])

  // 심볼 선택 시에만 히스토리 로드 (파일 전체 로그는 우측 커밋 로그 탭에서)
  useEffect(() => {
    setAiSummary(null) // 심볼 바뀌면 이전 요약 폐기
    if (selectedSymbolIdx === -1) {
      setCommits([])
      setLoading(false)
      return
    }
    const sym = symbols[selectedSymbolIdx]
    if (!sym) {
      setCommits([])
      setLoading(false)
      return
    }
    setLoading(true)
    api.getSymbolHistory(filePath, sym.startLine, sym.endLine).then(r => {
      setCommits(r.ok ? r.data : [])
      setLoading(false)
    })
  }, [filePath, selectedSymbolIdx, symbols])

  const handleSummarize = async () => {
    const sym = selectedSymbolIdx >= 0 ? symbols[selectedSymbolIdx] : null
    if (!sym) return
    const provider = getProvider(getSelectedProviderId())
    if (!provider?.summarizeSymbolHistory) {
      toast.error(`${provider?.label ?? '현재 provider'}는 심볼 요약을 지원하지 않습니다`)
      return
    }
    const avail = await provider.isAvailable()
    if (!avail.ok) {
      toast.error(`${provider.label} 사용 불가: ${avail.reason}`)
      return
    }
    setSummaryBusy(true)
    try {
      const r = await api.getSymbolHistoryPatch(filePath, sym.startLine, sym.endLine)
      if (!r.ok) throw new Error(r.error)
      if (!r.data.trim()) throw new Error('이 심볼의 변경 히스토리가 없습니다')
      const result = await provider.summarizeSymbolHistory({
        logPatch: r.data,
        symbolName: sym.name,
        symbolKind: sym.kind,
        filePath,
      })
      setAiSummary(result)
      toast.success(`${sym.name} 진화 요약 생성됨`)
    } catch (e) {
      toast.error(`요약 실패: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSummaryBusy(false)
    }
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  }

  const currentSymbol = selectedSymbolIdx >= 0 ? symbols[selectedSymbolIdx] : null

  return (
    <div>
      <div
        style={{
          padding: '8px 12px',
          fontSize: '11px',
          color: 'var(--accent)',
          fontFamily: 'var(--font-mono)',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface)',
        }}
      >
        {filePath}
      </div>

      {/* 심볼 선택기 */}
      <div
        style={{
          padding: '6px 12px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
        }}
      >
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>
          심볼 단위 히스토리{' '}
          {currentSymbol && `(L${currentSymbol.startLine}–${currentSymbol.endLine})`}
        </div>
        {symbols.length > 0 ? (
          <>
            <select
              value={selectedSymbolIdx}
              onChange={e => setSelectedSymbolIdx(Number(e.target.value))}
              style={{
                width: '100%',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                padding: '4px 6px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <option value={-1}>— 심볼 선택 ({symbols.length}개 탐지됨) —</option>
              {symbols.map((s, i) => (
                <option key={`${s.kind}-${s.name}-${s.startLine}`} value={i}>
                  [{s.kind}] {s.name} · L{s.startLine}–{s.endLine}
                </option>
              ))}
            </select>
            {currentSymbol && (
              <div
                style={{
                  fontSize: '10px',
                  color: KIND_COLORS[currentSymbol.kind] ?? 'var(--text-secondary)',
                  marginTop: '4px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                ● {currentSymbol.kind}: {currentSymbol.name}
              </div>
            )}
          </>
        ) : (
          <div
            style={{
              fontSize: '10px',
              color: 'var(--text-muted)',
              padding: '4px 0',
              fontStyle: 'italic',
            }}
          >
            이 파일에서 탐지된 심볼이 없습니다 (지원 언어: TS/TSX/JS/Rust/Python/C#)
          </div>
        )}
      </div>

      {/* 빈 상태: 심볼 미선택 시 가이드 (파일 전체 로그는 우측 탭으로 안내) */}
      {selectedSymbolIdx === -1 && !loading && (
        <div
          style={{
            margin: '12px',
            padding: '12px',
            background: 'var(--bg-surface)',
            border: '1px dashed var(--border)',
            borderRadius: 'var(--radius)',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-start',
            lineHeight: 1.6,
          }}
        >
          <Info size={14} strokeWidth={2.5} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            {symbols.length > 0 ? (
              <>
                위 드롭다운에서 <strong style={{ color: 'var(--accent)' }}>함수/클래스/메서드</strong>를
                선택하면 그 심볼이 변경된 커밋만 표시됩니다.
                <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)' }}>
                  파일 전체 로그는 <strong>우측 「커밋 로그」 탭</strong>에서 자동으로 같은 파일로 필터됩니다.
                </div>
              </>
            ) : (
              <>
                심볼이 탐지되지 않아 심볼 단위 히스토리를 표시할 수 없습니다.
                <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)' }}>
                  파일 전체 로그는 <strong>우측 「커밋 로그」 탭</strong>에서 확인하세요 (해당 파일로 자동 필터).
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {selectedSymbolIdx >= 0 && (loading ? (
        <div className="loading">
          <span className="spinner" /> 히스토리 로딩 중...
        </div>
      ) : (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 12px',
            fontSize: '11px', color: 'var(--text-muted)',
          }}>
            <span style={{ flex: 1 }}>총 {commits.length}개 커밋 (심볼 단위)</span>
            {commits.length > 0 && (
              <button
                type="button"
                className="btn btn-sm btn-mauve"
                onClick={handleSummarize}
                disabled={summaryBusy}
                title="이 심볼의 진화 과정을 AI 가 자연어로 요약"
                style={{
                  fontSize: 10, padding: '3px 8px',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              >
                {summaryBusy ? (
                  <><span className="spinner" style={{ width: 9, height: 9, borderWidth: 1 }} /> 요약중</>
                ) : (
                  <><Sparkles size={10} /> AI 요약</>
                )}
              </button>
            )}
          </div>

          {aiSummary && (
            <div style={{
              margin: '0 12px 8px',
              padding: '10px 12px',
              background: 'rgba(203, 166, 247, 0.06)',
              border: '1px solid var(--mauve)',
              borderLeft: '3px solid var(--mauve)',
              borderRadius: 'calc(var(--radius) - 2px)',
              fontSize: 11,
              color: 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.55,
              position: 'relative',
            }}>
              <button
                type="button"
                onClick={() => setAiSummary(null)}
                aria-label="요약 닫기"
                title="닫기"
                style={{
                  position: 'absolute', top: 4, right: 4,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', padding: 2, display: 'flex',
                }}
              >
                <XIcon size={11} />
              </button>
              <div style={{ paddingRight: 16 }}>{aiSummary}</div>
            </div>
          )}
          {commits.map((commit, i) => {
            const isSelected = selectedCommit === commit.hash
            return (
              <div
                key={commit.hash}
                onClick={() => onSelectCommit?.(commit.hash)}
                style={{
                  display: 'flex',
                  gap: '8px',
                  padding: '6px 12px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: isSelected ? 'var(--bg-surface)' : 'transparent',
                  borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                }}
                className="file-tree-item"
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    width: '16px',
                  }}
                >
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: i === 0 ? 'var(--accent)' : 'var(--bg-hover)',
                      border: '2px solid var(--accent)',
                      flexShrink: 0,
                    }}
                  />
                  {i < commits.length - 1 && (
                    <div
                      style={{
                        width: '1px',
                        flex: 1,
                        background: 'var(--border)',
                        marginTop: '2px',
                      }}
                    />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '11px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {commit.message}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                      {commit.hashShort}
                    </span>
                    {' · '}
                    {commit.author}
                    {' · '}
                    {formatDate(commit.date)}
                  </div>
                </div>
              </div>
            )
          })}
          {commits.length === 0 && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '16px' }}>
              해당 심볼의 변경 히스토리가 없습니다
            </div>
          )}
        </>
      ))}
    </div>
  )
}