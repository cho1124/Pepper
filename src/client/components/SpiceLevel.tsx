import { useSpiceLevel, useIsStale } from '../lib/hotspotContext'
import { useShowSpiceLevels, useShowStalePepper } from '../lib/displaySettings'

interface Props {
  path: string
}

/**
 * 페퍼 배지 — 핫 페퍼 (🌶️ 1~3개) 또는 stale 페퍼 (회색 🌶️ 1개).
 *
 * 우선순위: 핫 페퍼 > stale 페퍼. 한 파일이 둘 다 해당하는 경우는 거의 없음
 * (핫은 최근 활발 / stale 은 N일 이상 정지), 만약 겹치면 핫 우선.
 *
 * 토글 off / 등급 0 / stale 아님 → null.
 */
export function SpiceLevel({ path }: Props) {
  const showHot = useShowSpiceLevels()
  const showStale = useShowStalePepper()
  const level = useSpiceLevel(path)
  const stale = useIsStale(path)

  // 핫 페퍼 우선
  if (showHot && level > 0) {
    const peppers = '🌶️'.repeat(level)
    const titles: Record<number, string> = {
      1: '핫스팟 (상위 33%) — 가끔 변경됨',
      2: '핫스팟 (상위 10%) — 자주 변경됨',
      3: '핫스팟 (상위 3%) — 매우 자주 변경 / 리팩토링 후보',
    }
    return (
      <span
        aria-label={titles[level]}
        title={titles[level]}
        style={{
          marginLeft: 6,
          fontSize: 10,
          lineHeight: 1,
          verticalAlign: 'middle',
          userSelect: 'none',
          opacity: 0.85,
          flexShrink: 0,
        }}
      >
        {peppers}
      </span>
    )
  }

  // stale 페퍼 — 회색 🌶️ (grayscale + opacity)
  if (showStale && stale) {
    const tooltip = '오래된 파일 — 임계값 이상 변경 없음 (stale)'
    return (
      <span
        aria-label={tooltip}
        title={tooltip}
        style={{
          marginLeft: 6,
          fontSize: 10,
          lineHeight: 1,
          verticalAlign: 'middle',
          userSelect: 'none',
          opacity: 0.55,
          filter: 'grayscale(1)',
          flexShrink: 0,
        }}
      >
        🌶️
      </span>
    )
  }

  return null
}
