# 🌶️ Pepper v1.0.0 — 최종 업데이트

> 친근한 로컬 Git GUI — 심볼 단위 히스토리 · 온디바이스 AI · 페퍼 배지.
> Tauri 2 + Rust + React + 로컬 GGUF 모델.

이번 릴리즈는 **기능 동결 후 안정성·표면 위생에 집중한 정리**이 목표입니다. v0.5.0 이후 새 기능 추가 없이, 외부 노출 표면 위생과 시연 안정성에 집중했습니다.

---

## 차별점 3가지 한눈에

### 1️⃣ 심볼 단위 히스토리

Tree-sitter + `git log -L` 로 **함수·클래스·메서드 단위 변경 이력**. TS/TSX/JS/Rust/Python/C# 지원.

### 2️⃣ 온디바이스 AI

llama.cpp sidecar + Qwen 2.5 Coder GGUF (~2GB). 외부 API 키 / 클라우드 의존 없음.
**AI 5종**: 커밋 메시지 / 심볼 진화 요약 / 테마 생성 / 배경 데코 / refine.

### 3️⃣ 페퍼 배지 (v1.0.0 완성) 🌶️

- **핫 페퍼 🌶️🌶️🌶️** (상위 3%·10%·33% percentile) — 자주 변경 = 리팩토링 후보
- **stale 페퍼 ⚪🌶️** (N일 이상 변경 없음, 기본 365일) — 안 만져진 영역 = 정리 후보
- 별도 탭 없이 평소 작업 흐름 안에서 인지

---

## v1.0.0에서 새로 들어간 것

### 🌶️ Stale 페퍼 (페퍼 시리즈 완성)

- `git ls-files` − `git log --since=Nd` 차집합으로 회색 🌶️ 검출
- 30~730일 슬라이더, 기본 365일, 기본 OFF
- 30000 커밋 가드로 대형 레포 안전

### 🔧 시연 안정성

- **D-07 silent fail 9건** → toast.error 보강 (커밋 클릭/브랜치/트리/심볼/상태 로드 실패 시 빈 화면 → 명확한 에러)
- **D-17 네트워크 에러 분류기** → fetch/push/pull stderr를 6가지 패턴으로 한국어 요약 (network / auth / no_upstream / rejected / conflict / in_progress)
- **D-06 충돌 해결 UX** → 진행 중 spinner + 다른 행 disable + 마지막 해결 시 "Continue 안내"
- **D-01 stale 표면 정리** → "코드 포렌식" stale 문자열 + package.json description + dead CSS 118줄

### 📖 외부 표면 위생

- **README** 전면 재작성 (319→256 lines): 차별점 3가지 head 절 + Forensics 섹션 제거 + 적대적 검증 회고 추가
- **DEVELOPMENT.md** v1.0.0 핸드오프 절 신설
- **docs/SCREENSHOTS.md** 스크린샷·데모 GIF 촬영 가이드

---

## 적대적 검증 회고

Pepper는 두 차례 다중 모델 적대적 검증을 통과했습니다.

| 회차 | 시기 | 산출물 |
|---|---|---|
| **1차 보안 감사** | Tauri 마이그레이션 전 | P0 5건 식별 → CORS/host/CSRF 3건 구조적 소멸, path/singleton 2건 Rust 구조로 해결 |
| **2차 시나리오·결함 검증** | v0.5.0 직후 | 4 라운드, 모순 27건 (VALID 100%), 결함 32건 + Critical 5건. v1.0.0에서 D-01/D-06/D-07/D-17 처리 |

가장 큰 통찰은 결함 카운트가 아니라 **frame**입니다. "본인용 vs 시장 출시" 이분법이 잘못된 frame이었고, AI 도구는 측정 권한이 없는 한계가 있다는 메타 통찰까지 포함합니다.

---

## 의도적으로 처리하지 않음

배포 시나리오 의존 항목 → v1.0.0 frame에서는 가치 ↓:

- D-29 OS 자격 증명 통합, D-15 stash 발견성, D-16 페퍼 도움말, D-09 DiffView virtualize, D-28 다중 인스턴스 lock

폐기된 후보 (Lean Principle 강화):

- Phase 11-E 봉고캣 미니 모드, Phase 10 Knowledge Graph, Phase 11-B-2-c 충돌 AI 제안, Phase 11-C AI refine, Git 호스팅 연동

---

## 다운로드

| 파일 | 용도 |
|---|---|
| `Pepper_1.0.0_x64-setup.exe` | NSIS 설치 (권장) |
| `Pepper_1.0.0_x64_en-US.msi` | MSI 설치 (기업용) |

> ⚠ 코드 서명이 없어 SmartScreen 경고가 뜹니다. "추가 정보" → "실행".
>
> ℹ️ 이전 `GitScope` / 0.5.0 데이터(모델/설정/최근 레포)는 첫 실행 시 `pepper/` 디렉토리로 자동 마이그레이션됩니다.

## 첨부 권장 (Release 본문 상단)

- 정적: `docs/screenshots/02-overview.png`
- 동영상: `docs/screenshots/g01-pepper-badges.gif`

---

상세 변경 이력: [CHANGELOG.md](https://github.com/cho1124/Pepper/blob/master/CHANGELOG.md)
이어받기 핸드오프: [DEVELOPMENT.md](https://github.com/cho1124/Pepper/blob/master/DEVELOPMENT.md)
