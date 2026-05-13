import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react'
import { api } from '../api'
import { useMaxPepperCommits } from './displaySettings'

/**
 * 핫 페퍼 배지용 score map.
 *
 * 백엔드 `get_pepper_scores` (페퍼 전용 슬림 명령) 에서 score 분포를 받음.
 * score 공식: `changes × 3 + authors × 5 + churn × 0.01 + recent × 10`.
 *
 * Percentile 기반 매운맛 등급:
 *  - level 1 (🌶️)   : 상위 33%
 *  - level 2 (🌶️🌶️) : 상위 10%
 *  - level 3 (🌶️🌶️🌶️): 상위 3%
 *
 * 큰 레포는 백엔드가 `tooLarge=true` 로 빈 결과 반환 → 배지 표시 안 됨.
 */

export type SpiceLevel = 0 | 1 | 2 | 3

interface HotspotContextValue {
  /** 파일 경로 → 매운맛 등급. 데이터 없으면 0 반환. */
  getLevel: (path: string) => SpiceLevel
  /** 최초 로드 중 여부 (UI 에서 사용 안 해도 됨 — silent fail) */
  loading: boolean
  /** 백엔드 가드(max_commits 초과)로 분석을 건너뛴 상태 */
  tooLarge: boolean
  /** 현재 레포의 since=days 범위 커밋 수 (가드 판정에 쓰인 값) */
  totalCommits: number
}

const HotspotContext = createContext<HotspotContextValue>({
  getLevel: () => 0,
  loading: false,
  tooLarge: false,
  totalCommits: 0,
})

interface ScoreMap {
  scores: Map<string, number>
  threshold33: number
  threshold10: number
  threshold3: number
  tooLarge: boolean
  totalCommits: number
}

const EMPTY: ScoreMap = {
  scores: new Map(),
  threshold33: Infinity,
  threshold10: Infinity,
  threshold3: Infinity,
  tooLarge: false,
  totalCommits: 0,
}

interface ProviderProps {
  /** 현재 레포 경로. 변경 시 재 fetch. */
  repoPath: string
  /** 명시적 새로고침 키. 변경 시 재 fetch. */
  refreshKey?: number
  children: ReactNode
}

export function HotspotProvider({ repoPath, refreshKey, children }: ProviderProps) {
  const [data, setData] = useState<ScoreMap>(EMPTY)
  const [loading, setLoading] = useState(false)
  const maxCommits = useMaxPepperCommits()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.getPepperScores({ limit: 1000, maxCommits }).then(result => {
      if (cancelled) return
      if (!result.ok) {
        setData(EMPTY)
        setLoading(false)
        return
      }
      const { tooLarge, totalCommits, scores: entries } = result.data
      if (tooLarge || entries.length === 0) {
        setData({ ...EMPTY, tooLarge, totalCommits })
        setLoading(false)
        return
      }
      const scores = new Map<string, number>()
      const values: number[] = []
      for (const entry of entries) {
        scores.set(entry.path, entry.score)
        values.push(entry.score)
      }
      values.sort((a, b) => b - a) // 내림차순
      const pick = (pct: number): number => {
        if (values.length === 0) return Infinity
        const idx = Math.max(0, Math.floor(values.length * pct) - 1)
        return values[idx]
      }
      setData({
        scores,
        threshold3: pick(0.03),
        threshold10: pick(0.10),
        threshold33: pick(0.33),
        tooLarge: false,
        totalCommits,
      })
      setLoading(false)
    })
    return () => { cancelled = true }
    // repoPath / refreshKey / maxCommits 변경 시에만 재 fetch
  }, [repoPath, refreshKey, maxCommits])

  const value = useMemo<HotspotContextValue>(() => ({
    getLevel: (path: string): SpiceLevel => {
      const score = data.scores.get(path)
      if (score === undefined) return 0
      if (score >= data.threshold3) return 3
      if (score >= data.threshold10) return 2
      if (score >= data.threshold33) return 1
      return 0
    },
    loading,
    tooLarge: data.tooLarge,
    totalCommits: data.totalCommits,
  }), [data, loading])

  return (
    <HotspotContext.Provider value={value}>
      {children}
    </HotspotContext.Provider>
  )
}

/** 컴포넌트에서 특정 파일의 매운맛 등급 조회. Provider 밖에서는 0 반환. */
export function useSpiceLevel(path: string | null | undefined): SpiceLevel {
  const ctx = useContext(HotspotContext)
  if (!path) return 0
  return ctx.getLevel(path)
}

/** 가드 발동 상태 조회 — 설정창 슬라이더 옆 hint 표시 등에 사용. */
export function usePepperStatus(): { tooLarge: boolean; totalCommits: number; loading: boolean } {
  const ctx = useContext(HotspotContext)
  return { tooLarge: ctx.tooLarge, totalCommits: ctx.totalCommits, loading: ctx.loading }
}