import { useState, useEffect, useCallback, useRef } from 'react'
import { GitBranch, ChevronDown, Plus, GitMerge, Trash2, Check } from 'lucide-react'
import { api } from '../api'
import { useToast } from './Toast'
import { useConfirm } from './ConfirmModal'

interface Props {
  currentBranch: string
  onBranchChanged: (newBranch: string) => void
  refreshKey?: number
}

type Mode = null | 'create' | 'merge' | 'delete'

export function BranchSelector({ currentBranch, onBranchChanged, refreshKey }: Props) {
  const toast = useToast()
  const confirm = useConfirm()
  const [branches, setBranches] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<Mode>(null)
  const [inputName, setInputName] = useState('')
  const [targetBranch, setTargetBranch] = useState('')
  const [checkoutAfterCreate, setCheckoutAfterCreate] = useState(true)
  const [forceDelete, setForceDelete] = useState(false)
  const [noFf, setNoFf] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const loadBranches = useCallback(async () => {
    const result = await api.getBranches()
    if (result.ok) {
      setBranches(result.data.all)
    } else {
      toast.error(`브랜치 목록 로드 실패: ${result.error}`)
    }
  }, [toast])

  useEffect(() => {
    loadBranches()
  }, [loadBranches, refreshKey, currentBranch])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const handleCheckout = async (branch: string) => {
    if (branch === currentBranch) {
      setOpen(false)
      return
    }
    setLoading(true)
    const result = await api.checkout(branch)
    setLoading(false)
    setOpen(false)
    if (result.ok) {
      onBranchChanged(branch)
    } else {
      toast.error(result.error)
    }
  }

  const handleCreate = async () => {
    const name = inputName.trim()
    if (!name) return
    setLoading(true)
    const result = await api.createBranch(name, checkoutAfterCreate)
    setLoading(false)
    if (result.ok) {
      setMode(null)
      setInputName('')
      await loadBranches()
      if (checkoutAfterCreate) onBranchChanged(name)
    } else {
      toast.error(result.error)
    }
  }

  const handleMerge = async () => {
    if (!targetBranch) return
    setLoading(true)
    const result = await api.mergeBranch(targetBranch, noFf)
    setLoading(false)
    if (result.ok) {
      setMode(null)
      setTargetBranch('')
      onBranchChanged(currentBranch)
    } else {
      toast.error(result.error)
    }
  }

  const handleDelete = async () => {
    if (!targetBranch) return
    const ok = await confirm({
      title: '브랜치 삭제',
      message: `브랜치 '${targetBranch}'를 삭제합니다.${forceDelete ? '\n⚠ force (-D) 모드: 병합되지 않은 브랜치도 강제 삭제됩니다.' : ''}`,
      confirmLabel: '삭제',
      variant: 'danger'
    })
    if (!ok) return
    setLoading(true)
    const result = await api.deleteBranch(targetBranch, forceDelete)
    setLoading(false)
    if (result.ok) {
      setMode(null)
      setTargetBranch('')
      await loadBranches()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        className="btn btn-sm"
        onClick={() => setOpen(v => !v)}
        disabled={loading}
        title="브랜치 전환"
        style={{ fontFamily: 'var(--font-mono)', minWidth: '120px', justifyContent: 'flex-start' }}
      >
        <GitBranch size={12} color="var(--mauve)" />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {currentBranch}
        </span>
        <ChevronDown size={12} color="var(--text-muted)" style={{ marginLeft: 'auto' }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: '260px',
            maxWidth: '360px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            zIndex: 100,
            padding: '6px',
            maxHeight: '60vh',
            overflow: 'auto'
          }}
        >
          {/* 브랜치 목록 */}
          <div style={{
            fontSize: '10px',
            color: 'var(--text-muted)',
            padding: '4px 8px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            브랜치 ({branches.length})
          </div>
          {branches.map(b => (
            <button
              key={b}
              onClick={() => handleCheckout(b)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '6px 8px',
                background: b === currentBranch ? 'var(--bg-surface)' : 'transparent',
                border: 'none',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                textAlign: 'left'
              }}
              onMouseEnter={e => {
                if (b !== currentBranch) e.currentTarget.style.background = 'var(--bg-hover)'
              }}
              onMouseLeave={e => {
                if (b !== currentBranch) e.currentTarget.style.background = 'transparent'
              }}
            >
              <span style={{ width: '12px', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center' }}>
                {b === currentBranch ? <Check size={12} strokeWidth={3} /> : null}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {b}
              </span>
            </button>
          ))}

          {/* 액션 */}
          <div style={{
            borderTop: '1px solid var(--border)',
            marginTop: '6px',
            paddingTop: '6px',
            display: 'flex',
            gap: '4px'
          }}>
            <button
              className="btn btn-sm"
              style={{ flex: 1, fontSize: '10px', gap: 4 }}
              onClick={() => { setMode('create'); setInputName('') }}
            >
              <Plus size={11} /> 새 브랜치
            </button>
            <button
              className="btn btn-sm"
              style={{ flex: 1, fontSize: '10px', gap: 4 }}
              onClick={() => {
                setMode('merge')
                const other = branches.find(b => b !== currentBranch) || ''
                setTargetBranch(other)
              }}
              disabled={branches.length < 2}
            >
              <GitMerge size={11} /> Merge
            </button>
            <button
              className="btn btn-sm"
              style={{ flex: 1, fontSize: '10px', gap: 4 }}
              onClick={() => {
                setMode('delete')
                const other = branches.find(b => b !== currentBranch) || ''
                setTargetBranch(other)
              }}
              disabled={branches.length < 2}
            >
              <Trash2 size={11} /> Delete
            </button>
          </div>

          {/* 모달 영역 */}
          {mode === 'create' && (
            <div style={{ padding: '8px', borderTop: '1px solid var(--border)', marginTop: '6px' }}>
              <div style={{ fontSize: '11px', marginBottom: '6px' }}>새 브랜치 이름</div>
              <input
                autoFocus
                type="text"
                value={inputName}
                onChange={e => setInputName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="feature/xyz"
                style={{ width: '100%', marginBottom: '6px' }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', marginBottom: '6px' }}>
                <input
                  type="checkbox"
                  checked={checkoutAfterCreate}
                  onChange={e => setCheckoutAfterCreate(e.target.checked)}
                />
                생성 후 checkout
              </label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ flex: 1, fontSize: '10px' }}
                  onClick={handleCreate}
                  disabled={loading || !inputName.trim()}
                >
                  생성
                </button>
                <button className="btn btn-sm" style={{ fontSize: '10px' }} onClick={() => setMode(null)}>
                  취소
                </button>
              </div>
            </div>
          )}

          {mode === 'merge' && (
            <div style={{ padding: '8px', borderTop: '1px solid var(--border)', marginTop: '6px' }}>
              <div style={{ fontSize: '11px', marginBottom: '6px' }}>
                <span style={{ color: 'var(--mauve)' }}>{currentBranch}</span>
                {' ← '}
                merge 할 브랜치
              </div>
              <select
                value={targetBranch}
                onChange={e => setTargetBranch(e.target.value)}
                style={{
                  width: '100%',
                  marginBottom: '6px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-primary)',
                  padding: '6px 10px',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)'
                }}
              >
                {branches.filter(b => b !== currentBranch).map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', marginBottom: '6px' }}>
                <input type="checkbox" checked={noFf} onChange={e => setNoFf(e.target.checked)} />
                --no-ff
              </label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ flex: 1, fontSize: '10px' }}
                  onClick={handleMerge}
                  disabled={loading || !targetBranch}
                >
                  Merge
                </button>
                <button className="btn btn-sm" style={{ fontSize: '10px' }} onClick={() => setMode(null)}>
                  취소
                </button>
              </div>
            </div>
          )}

          {mode === 'delete' && (
            <div style={{ padding: '8px', borderTop: '1px solid var(--border)', marginTop: '6px' }}>
              <div style={{ fontSize: '11px', marginBottom: '6px' }}>삭제할 브랜치</div>
              <select
                value={targetBranch}
                onChange={e => setTargetBranch(e.target.value)}
                style={{
                  width: '100%',
                  marginBottom: '6px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-primary)',
                  padding: '6px 10px',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)'
                }}
              >
                {branches.filter(b => b !== currentBranch).map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', marginBottom: '6px' }}>
                <input type="checkbox" checked={forceDelete} onChange={e => setForceDelete(e.target.checked)} />
                force (-D, 병합 안 된 브랜치도 강제 삭제)
              </label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  className="btn btn-sm"
                  style={{ flex: 1, fontSize: '10px', background: 'var(--red)', color: 'var(--bg-primary)', borderColor: 'var(--red)' }}
                  onClick={handleDelete}
                  disabled={loading || !targetBranch}
                >
                  삭제
                </button>
                <button className="btn btn-sm" style={{ fontSize: '10px' }} onClick={() => setMode(null)}>
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}