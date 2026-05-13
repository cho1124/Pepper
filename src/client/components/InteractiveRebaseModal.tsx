import { useState, useEffect } from 'react'
import { ChevronUp, ChevronDown, GitMerge, X } from 'lucide-react'
import { api, type CommitInfo } from '../api'
import { useToast } from './Toast'

interface Props {
  from: string
  fromShort: string
  onClose: () => void
  onApplied: () => void
}

type Action = 'pick' | 'reword' | 'squash' | 'fixup' | 'drop'

interface Item extends CommitInfo {
  action: Action
  // reword/squash 에서 새 커밋 메시지로 사용. 다른 action은 무시. 초기값은 원 커밋 메시지.
  editMessage: string
}

const NEEDS_MESSAGE: Action[] = ['reword', 'squash']

export function InteractiveRebaseModal({ from, fromShort, onClose, onApplied }: Props) {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [entered, setEntered] = useState(false)
  const toast = useToast()

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 10)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    setLoading(true)
    api.listCommitsInRange(from).then(r => {
      if (r.ok) {
        setItems(r.data.map(c => ({ ...c, action: 'pick' as Action, editMessage: c.message })))
      } else {
        toast.error(`커밋 로드 실패: ${r.error}`)
        onClose()
      }
      setLoading(false)
    })
  }, [from, onClose, toast])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !applying) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [applying, onClose])

  const moveUp = (idx: number) => {
    if (idx === 0) return
    const next = [...items]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    setItems(next)
  }

  const moveDown = (idx: number) => {
    if (idx === items.length - 1) return
    const next = [...items]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    setItems(next)
  }

  const setAction = (idx: number, action: Action) => {
    const next = [...items]
    next[idx] = { ...next[idx], action }
    setItems(next)
  }

  const setEditMessage = (idx: number, msg: string) => {
    const next = [...items]
    next[idx] = { ...next[idx], editMessage: msg }
    setItems(next)
  }

  const apply = async () => {
    setApplying(true)
    const operations = items.map(i => ({
      hash: i.hash,
      action: i.action,
      message: NEEDS_MESSAGE.includes(i.action) ? i.editMessage : undefined,
    }))
    const r = await api.interactiveRebase(from, operations)
    setApplying(false)
    if (r.ok) {
      toast.success('Interactive rebase 완료')
      onApplied()
    } else {
      toast.error(r.error)
    }
  }

  const keepCount = items.filter(i => i.action !== 'drop').length
  const rewordCount = items.filter(i => i.action === 'reword').length
  const squashCount = items.filter(i => i.action === 'squash').length
  const fixupCount = items.filter(i => i.action === 'fixup').length
  const dropCount = items.filter(i => i.action === 'drop').length
  const hasInvalidMessage = items.some(
    i => NEEDS_MESSAGE.includes(i.action) && i.editMessage.trim() === '',
  )
  // 첫 적용 위치(이전 적용 op 없음)에 squash/fixup이 오는지 검사
  const firstAppliedIdx = items.findIndex(i => i.action !== 'drop')
  const firstAction = firstAppliedIdx >= 0 ? items[firstAppliedIdx].action : null
  const firstNeedsPrior = firstAction === 'squash' || firstAction === 'fixup'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="irebase-title"
      onClick={() => { if (!applying) onClose() }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        opacity: entered ? 1 : 0,
        transition: 'opacity 0.15s ease-out',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--mauve)',
          borderLeft: '4px solid var(--mauve)',
          borderRadius: 'var(--radius)',
          padding: '16px 20px',
          width: '640px',
          maxWidth: 'calc(100vw - 40px)',
          maxHeight: 'calc(100vh - 80px)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          transform: entered ? 'scale(1)' : 'scale(0.96)',
          transition: 'transform 0.15s ease-out',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <GitMerge size={16} strokeWidth={2.5} color="var(--mauve)" style={{ flexShrink: 0 }} />
          <h3 id="irebase-title" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
            Interactive rebase
          </h3>
          <button
            aria-label="닫기"
            onClick={onClose}
            disabled={applying}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: applying ? 'not-allowed' : 'pointer', padding: 2, display: 'flex',
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
          <code style={{ color: 'var(--mauve)' }}>{fromShort}</code> 위로 재적용 ·
          {' '}<span style={{ color: 'var(--green)' }}>{keepCount} 유지</span>
          {rewordCount > 0 && <>{' / '}<span style={{ color: 'var(--mauve)' }}>{rewordCount} reword</span></>}
          {squashCount > 0 && <>{' / '}<span style={{ color: 'var(--peach)' }}>{squashCount} squash</span></>}
          {fixupCount > 0 && <>{' / '}<span style={{ color: 'var(--peach)' }}>{fixupCount} fixup</span></>}
          {' / '}<span style={{ color: 'var(--red)' }}>{dropCount} 드롭</span>
          {' · 충돌 시 자동 롤백'}
        </div>
        {firstNeedsPrior && (
          <div style={{
            fontSize: 11,
            color: 'var(--red)',
            background: 'rgba(243, 139, 168, 0.1)',
            border: '1px solid var(--red)',
            borderRadius: 'calc(var(--radius) - 2px)',
            padding: '6px 10px',
            marginBottom: 12,
          }}>
            ⚠ 첫 적용 위치가 squash/fixup 입니다. 결합할 이전 커밋이 없어 적용 시 거부됩니다. 위 커밋을 위로 옮기거나 pick으로 바꾸세요.
          </div>
        )}

        <div style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          border: '1px solid var(--border)',
          borderRadius: 'calc(var(--radius) - 2px)',
          background: 'var(--bg-primary)',
        }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              <span className="spinner" /> 로드 중
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              {fromShort} 이후에 적용할 커밋이 없습니다.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {items.map((item, idx) => {
                const isDrop = item.action === 'drop'
                const isReword = item.action === 'reword'
                const isSquash = item.action === 'squash'
                const isFixup = item.action === 'fixup'
                const needsMessage = isReword || isSquash
                const messageEmpty = needsMessage && item.editMessage.trim() === ''
                const bg =
                  isDrop ? 'rgba(243, 139, 168, 0.06)' :
                  isReword ? 'rgba(203, 166, 247, 0.06)' :
                  isSquash || isFixup ? 'rgba(250, 179, 135, 0.06)' :
                  'transparent'
                const dropdownColor =
                  isDrop ? 'var(--red)' :
                  isReword ? 'var(--mauve)' :
                  isSquash || isFixup ? 'var(--peach)' :
                  'var(--text-primary)'
                return (
                  <li
                    key={item.hash}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      padding: '6px 8px',
                      borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none',
                      fontSize: 12,
                      background: bg,
                      opacity: isDrop ? 0.55 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        aria-label="위로"
                        disabled={idx === 0 || applying}
                        onClick={() => moveUp(idx)}
                        style={{ ...iconBtnStyle, opacity: idx === 0 ? 0.3 : 1 }}
                      >
                        <ChevronUp size={12} strokeWidth={2.5} />
                      </button>
                      <button
                        aria-label="아래로"
                        disabled={idx === items.length - 1 || applying}
                        onClick={() => moveDown(idx)}
                        style={{ ...iconBtnStyle, opacity: idx === items.length - 1 ? 0.3 : 1 }}
                      >
                        <ChevronDown size={12} strokeWidth={2.5} />
                      </button>
                      <select
                        value={item.action}
                        onChange={(e) => setAction(idx, e.target.value as Action)}
                        disabled={applying}
                        aria-label="action"
                        style={{
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 3,
                          color: dropdownColor,
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          padding: '2px 4px',
                          cursor: applying ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <option value="pick">pick</option>
                        <option value="reword">reword</option>
                        <option value="squash">squash</option>
                        <option value="fixup">fixup</option>
                        <option value="drop">drop</option>
                      </select>
                      <code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                        {item.hashShort}
                      </code>
                      <span style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--text-primary)',
                        textDecoration: isDrop ? 'line-through' : 'none',
                      }}>
                        {item.message}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{item.author}</span>
                    </div>
                    {needsMessage && (
                      <textarea
                        value={item.editMessage}
                        onChange={(e) => setEditMessage(idx, e.target.value)}
                        disabled={applying}
                        rows={2}
                        placeholder={isSquash ? '결합 후 커밋 메시지 (이전과 합칠 내용 직접 작성)' : '새 커밋 메시지'}
                        style={{
                          marginLeft: 56,
                          background: 'var(--bg-surface)',
                          border: `1px solid ${messageEmpty ? 'var(--red)' : 'var(--border)'}`,
                          borderRadius: 3,
                          color: 'var(--text-primary)',
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          padding: '4px 6px',
                          resize: 'vertical',
                        }}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 12 }}>
          <button className="btn btn-sm" onClick={onClose} disabled={applying}>
            취소
          </button>
          <button
            className="btn btn-sm btn-mauve"
            onClick={apply}
            disabled={applying || loading || items.length === 0 || keepCount === 0 || hasInvalidMessage || firstNeedsPrior}
            title={
              hasInvalidMessage ? 'reword/squash 메시지를 입력하세요' :
              firstNeedsPrior ? '첫 적용 위치는 squash/fixup 불가' :
              undefined
            }
          >
            {applying ? (
              <><span className="spinner" style={{ width: 10, height: 10, borderWidth: 1 }} /> 적용 중</>
            ) : (
              `Apply (${keepCount} 커밋)`
            )}
          </button>
        </div>

        <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)' }}>
          Esc: 취소 · 충돌 발생 시 변경사항 없이 원상 복구됩니다
        </div>
      </div>
    </div>
  )
}

const iconBtnStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 3,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: '2px 4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}
