import { useEffect, useState } from 'react'

// ── 날짜 표시 모드 ─────────────────────────────────────────
export type DateFormatMode = 'relative' | 'absolute'

const DATE_FORMAT_LS_KEY = 'pepper.dateFormat'
const DATE_FORMAT_EVENT = 'pepper:dateFormat-changed'

export function getDateFormat(): DateFormatMode {
  try {
    const v = localStorage.getItem(DATE_FORMAT_LS_KEY)
    return v === 'absolute' ? 'absolute' : 'relative'
  } catch {
    return 'relative'
  }
}

export function setDateFormat(mode: DateFormatMode): void {
  try {
    localStorage.setItem(DATE_FORMAT_LS_KEY, mode)
  } catch {}
  window.dispatchEvent(new CustomEvent(DATE_FORMAT_EVENT, { detail: mode }))
}

/** localStorage 값을 reactive 하게 구독. setDateFormat 호출 시 자동 리렌더 */
export function useDateFormat(): DateFormatMode {
  const [mode, setMode] = useState<DateFormatMode>(getDateFormat)
  useEffect(() => {
    const handler = () => setMode(getDateFormat())
    window.addEventListener(DATE_FORMAT_EVENT, handler)
    // 다른 탭에서의 변경도 반영 (StorageEvent)
    const storageHandler = (e: StorageEvent) => {
      if (e.key === DATE_FORMAT_LS_KEY) setMode(getDateFormat())
    }
    window.addEventListener('storage', storageHandler)
    return () => {
      window.removeEventListener(DATE_FORMAT_EVENT, handler)
      window.removeEventListener('storage', storageHandler)
    }
  }, [])
  return mode
}

// ── 커밋 row 세로 여백 (px) ───────────────────────────────
const ROW_PADDING_LS_KEY = 'pepper.rowPaddingY'
const ROW_PADDING_EVENT = 'pepper:rowPaddingY-changed'
export const ROW_PADDING_MIN = 0
export const ROW_PADDING_MAX = 12
export const ROW_PADDING_DEFAULT = 0

export function getRowPaddingY(): number {
  try {
    const raw = localStorage.getItem(ROW_PADDING_LS_KEY)
    if (raw === null) return ROW_PADDING_DEFAULT
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n)) return ROW_PADDING_DEFAULT
    return Math.max(ROW_PADDING_MIN, Math.min(ROW_PADDING_MAX, n))
  } catch {
    return ROW_PADDING_DEFAULT
  }
}

export function setRowPaddingY(value: number): void {
  const clamped = Math.max(ROW_PADDING_MIN, Math.min(ROW_PADDING_MAX, Math.round(value)))
  try { localStorage.setItem(ROW_PADDING_LS_KEY, String(clamped)) } catch {}
  window.dispatchEvent(new CustomEvent(ROW_PADDING_EVENT, { detail: clamped }))
}

export function useRowPaddingY(): number {
  const [value, setValue] = useState<number>(getRowPaddingY)
  useEffect(() => {
    const handler = () => setValue(getRowPaddingY())
    window.addEventListener(ROW_PADDING_EVENT, handler)
    const storageHandler = (e: StorageEvent) => {
      if (e.key === ROW_PADDING_LS_KEY) setValue(getRowPaddingY())
    }
    window.addEventListener('storage', storageHandler)
    return () => {
      window.removeEventListener(ROW_PADDING_EVENT, handler)
      window.removeEventListener('storage', storageHandler)
    }
  }, [])
  return value
}

// ── 핫 페퍼 배지 표시 여부 ─────────────────────────────────
const SPICE_LS_KEY = 'pepper.showSpiceLevels'
const SPICE_EVENT = 'pepper:showSpiceLevels-changed'

export function getShowSpiceLevels(): boolean {
  try {
    const v = localStorage.getItem(SPICE_LS_KEY)
    return v === null ? true : v === 'true'
  } catch {
    return true
  }
}

export function setShowSpiceLevels(value: boolean): void {
  try { localStorage.setItem(SPICE_LS_KEY, String(value)) } catch {}
  window.dispatchEvent(new CustomEvent(SPICE_EVENT, { detail: value }))
}

export function useShowSpiceLevels(): boolean {
  const [value, setValue] = useState<boolean>(getShowSpiceLevels)
  useEffect(() => {
    const handler = () => setValue(getShowSpiceLevels())
    window.addEventListener(SPICE_EVENT, handler)
    const storageHandler = (e: StorageEvent) => {
      if (e.key === SPICE_LS_KEY) setValue(getShowSpiceLevels())
    }
    window.addEventListener('storage', storageHandler)
    return () => {
      window.removeEventListener(SPICE_EVENT, handler)
      window.removeEventListener('storage', storageHandler)
    }
  }, [])
  return value
}

// ── 핫 페퍼 분석 임계값 (커밋 수) ───────────────────────────
// 사용자가 직접 "어디까지 분석할지" 조절. 큰 레포에서 too_large 가드와 직접 연동.
const MAX_PEPPER_LS_KEY = 'pepper.maxPepperCommits'
const MAX_PEPPER_EVENT = 'pepper:maxPepperCommits-changed'
export const MAX_PEPPER_MIN = 1000
export const MAX_PEPPER_MAX = 50000
export const MAX_PEPPER_DEFAULT = 10000
export const MAX_PEPPER_STEP = 1000

export function getMaxPepperCommits(): number {
  try {
    const raw = localStorage.getItem(MAX_PEPPER_LS_KEY)
    if (raw === null) return MAX_PEPPER_DEFAULT
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n)) return MAX_PEPPER_DEFAULT
    return Math.max(MAX_PEPPER_MIN, Math.min(MAX_PEPPER_MAX, n))
  } catch {
    return MAX_PEPPER_DEFAULT
  }
}

export function setMaxPepperCommits(value: number): void {
  const clamped = Math.max(MAX_PEPPER_MIN, Math.min(MAX_PEPPER_MAX, Math.round(value)))
  try { localStorage.setItem(MAX_PEPPER_LS_KEY, String(clamped)) } catch {}
  window.dispatchEvent(new CustomEvent(MAX_PEPPER_EVENT, { detail: clamped }))
}

export function useMaxPepperCommits(): number {
  const [value, setValue] = useState<number>(getMaxPepperCommits)
  useEffect(() => {
    const handler = () => setValue(getMaxPepperCommits())
    window.addEventListener(MAX_PEPPER_EVENT, handler)
    const storageHandler = (e: StorageEvent) => {
      if (e.key === MAX_PEPPER_LS_KEY) setValue(getMaxPepperCommits())
    }
    window.addEventListener('storage', storageHandler)
    return () => {
      window.removeEventListener(MAX_PEPPER_EVENT, handler)
      window.removeEventListener('storage', storageHandler)
    }
  }, [])
  return value
}

/** 앱 부팅 시 1회 호출 — :root에 CSS var 동기화 */
export function initDisplaySettings(): void {
  const py = getRowPaddingY()
  document.documentElement.style.setProperty('--commit-row-padding-y', `${py}px`)
  window.addEventListener(ROW_PADDING_EVENT, (e) => {
    const v = (e as CustomEvent<number>).detail
    document.documentElement.style.setProperty('--commit-row-padding-y', `${v}px`)
  })
}

export function formatCommitDate(dateStr: string, mode: DateFormatMode): string {
  const d = new Date(dateStr)
  if (mode === 'absolute') {
    // YYYY-MM-DD HH:mm
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return '오늘'
  if (days === 1) return '어제'
  if (days < 7) return `${days}일 전`
  if (days < 30) return `${Math.floor(days / 7)}주 전`
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
}