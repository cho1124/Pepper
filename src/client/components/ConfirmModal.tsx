import { useEffect, useState, useCallback, createContext, useContext, type ReactNode } from 'react'
import { AlertTriangle, Info } from 'lucide-react'

type Variant = 'danger' | 'warn' | 'info'

export interface ConfirmExtra {
  key: string
  label: string
  hint?: string
  initial?: boolean
}

interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: Variant
  /** 모달 안 본문 아래에 노출되는 체크박스 옵션들. confirmWith() 결과에서 키별 boolean 값을 받음. */
  extras?: ConfirmExtra[]
}

export interface ConfirmResult {
  confirmed: boolean
  extras: Record<string, boolean>
}

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  confirmWith: (opts: ConfirmOptions) => Promise<ConfirmResult>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

interface PendingConfirm {
  id: number
  opts: ConfirmOptions
  resolve: (v: ConfirmResult) => void
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<PendingConfirm[]>([])
  const current = queue[0]

  const confirmWith = useCallback((opts: ConfirmOptions): Promise<ConfirmResult> => {
    return new Promise<ConfirmResult>(resolve => {
      setQueue(prev => [...prev, { id: Date.now() + Math.random(), opts, resolve }])
    })
  }, [])

  // 기존 API — extras 무시, boolean 만 반환
  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return confirmWith(opts).then(r => r.confirmed)
  }, [confirmWith])

  const resolveCurrent = (r: ConfirmResult) => {
    if (!current) return
    current.resolve(r)
    setQueue(prev => prev.slice(1))
  }

  return (
    <ConfirmContext.Provider value={{ confirm, confirmWith }}>
      {children}
      {current && (
        <ConfirmDialog
          opts={current.opts}
          onResolve={resolveCurrent}
        />
      )}
    </ConfirmContext.Provider>
  )
}

function ConfirmDialog({ opts, onResolve }: { opts: ConfirmOptions; onResolve: (v: ConfirmResult) => void }) {
  const [entered, setEntered] = useState(false)
  const [extraValues, setExtraValues] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const e of opts.extras ?? []) init[e.key] = e.initial ?? false
    return init
  })

  const finish = useCallback((confirmed: boolean) => {
    onResolve({ confirmed, extras: extraValues })
  }, [onResolve, extraValues])

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 10)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false)
      if (e.key === 'Enter') finish(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finish])

  const variant = opts.variant ?? 'info'
  const accent =
    variant === 'danger' ? 'var(--red)' :
    variant === 'warn' ? 'var(--yellow)' :
    'var(--accent)'
  const Icon = variant === 'info' ? Info : AlertTriangle

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onClick={() => finish(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        opacity: entered ? 1 : 0,
        transition: 'opacity 0.15s ease-out'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary)',
          border: `1px solid ${accent}`,
          borderLeft: `4px solid ${accent}`,
          borderRadius: 'var(--radius)',
          padding: '16px 20px',
          minWidth: '320px',
          maxWidth: '480px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          transform: entered ? 'scale(1)' : 'scale(0.96)',
          transition: 'transform 0.15s ease-out'
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '10px'
        }}>
          <Icon size={16} strokeWidth={2.5} color={accent} style={{ flexShrink: 0 }} />
          <h3 id="confirm-title" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {opts.title ?? '확인'}
          </h3>
        </div>

        <div style={{
          fontSize: '12px',
          color: 'var(--text-secondary)',
          marginBottom: opts.extras?.length ? '12px' : '16px',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.6
        }}>
          {opts.message}
        </div>

        {opts.extras && opts.extras.length > 0 && (
          <div style={{
            marginBottom: '16px',
            paddingTop: '10px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            {opts.extras.map(extra => (
              <label
                key={extra.key}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                }}
              >
                <input
                  type="checkbox"
                  checked={extraValues[extra.key] ?? false}
                  onChange={e =>
                    setExtraValues(prev => ({ ...prev, [extra.key]: e.target.checked }))
                  }
                  style={{ marginTop: 2 }}
                />
                <span style={{ flex: 1 }}>
                  {extra.label}
                  {extra.hint && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '10px', marginTop: 2 }}>
                      {extra.hint}
                    </div>
                  )}
                </span>
              </label>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
          <button className="btn btn-sm" onClick={() => finish(false)} autoFocus>
            {opts.cancelLabel ?? '취소'}
          </button>
          <button
            className="btn btn-sm"
            onClick={() => finish(true)}
            style={
              variant === 'danger'
                ? { background: 'var(--red)', color: 'var(--bg-primary)', borderColor: 'var(--red)' }
                : variant === 'warn'
                ? { background: 'var(--yellow)', color: 'var(--bg-primary)', borderColor: 'var(--yellow)' }
                : { background: 'var(--accent)', color: 'var(--bg-primary)', borderColor: 'var(--accent)' }
            }
          >
            {opts.confirmLabel ?? '확인'}
          </button>
        </div>

        <div style={{ marginTop: '10px', fontSize: '10px', color: 'var(--text-muted)' }}>
          Enter: 확인 · Esc: 취소
        </div>
      </div>
    </div>
  )
}

export function useConfirm(): ConfirmContextValue['confirm'] {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider')
  return ctx.confirm
}

/** 체크박스 옵션이 있는 모달을 띄울 때 사용. {confirmed, extras} 를 반환. */
export function useConfirmWith(): ConfirmContextValue['confirmWith'] {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirmWith must be used inside ConfirmProvider')
  return ctx.confirmWith
}