# 🌶️ Pepper v1.1.0 — 변경사항 되돌리기 (Discard)

> 다른 Git GUI에 다 있는 기본 기능이라 빠지면 신뢰 손상되는 영역을 보강합니다.

## ✨ 새 기능

### 3가지 진입점

| 진입점 | 위치 | 사용 |
|---|---|---|
| **우클릭** | 변경사항 패널의 파일 행 | 단일 파일 또는 다중 선택 중이면 선택 전체 |
| **다중 선택 일괄** | Unstaged / Staged 헤더의 "되돌리기" 버튼 | Ctrl/Shift 로 N개 선택 후 한 번에 |
| **전체 되돌리기** | Unstaged 헤더의 "모두 되돌리기" 버튼 | modified / staged / not_added / deleted 전부 |

### 안전 가드

- ConfirmModal `variant: danger` 로 빨간 강조
- tracked / untracked 분류 메시지 — "X개 복원 / Y개 영구 삭제 후보"
- **untracked 파일은 안전 default** — 별도 체크박스 "untracked 파일도 영구 삭제" (기본 OFF). 체크 안 하면 untracked 파일은 그대로 보존
- 결과 토스트에 처리 내역 노출 — `5개 복원 · untracked 2개 유지`

## 🔧 기술

- 백엔드: `git status --porcelain -z` 로 tracked / untracked 분류 → `git reset HEAD -- ...` + `git checkout HEAD -- ...` 또는 `git clean -f -- ...`
- `ConfirmModal` 에 `extras: ConfirmExtra[]` 필드 + `confirmWith()` API 추가 (기존 `confirm()` 호환 유지)

## 업그레이드

설치 그대로 덮어쓰면 됩니다. AI 모델 / 설정 / 최근 레포는 보존됩니다.

## 다운로드

| 파일 | 용도 |
|---|---|
| `Pepper_1.1.0_x64-setup.exe` | NSIS 설치 (권장) |
| `Pepper_1.1.0_x64_en-US.msi` | MSI 설치 (기업용) |

> ⚠ 코드 서명 없음 — SmartScreen 경고 시 "추가 정보" → "실행"

상세 변경 이력: [CHANGELOG.md](https://github.com/cho1124/Pepper/blob/master/CHANGELOG.md)