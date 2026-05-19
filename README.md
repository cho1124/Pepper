# 🌶️ Pepper

> 친근한 로컬 Git GUI — **심볼 단위 히스토리 · 온디바이스 AI · 페퍼 배지 (변경 빈도 시각화)**.
> Tauri 2 + Rust + React + 로컬 GGUF 모델. 외부 클라우드 의존 없이, 코드의 매운맛까지 한 화면에서.

![Tauri](https://img.shields.io/badge/Tauri-2.10-24c8db.svg)
![React](https://img.shields.io/badge/React-18-61dafb.svg)
![Rust](https://img.shields.io/badge/Rust-1.95+-dea584.svg)
![On-device AI](https://img.shields.io/badge/AI-on--device-ff6b35.svg)
![License](https://img.shields.io/badge/License-MIT-green.svg)

<!-- 스크린샷/데모 GIF 자리 — 자세한 안내는 docs/SCREENSHOTS.md 참고 -->

## 다운로드

**[최신 릴리즈](https://github.com/cho1124/Pepper/releases/latest)**

| 파일                          | 크기  | 설명               |
|-------------------------------|-------|--------------------|
| `Pepper_x.y.z_x64-setup.exe`  | ~4 MB | NSIS 설치 (권장)   |
| `Pepper_x.y.z_x64_en-US.msi`  | ~6 MB | MSI 설치 (기업용)  |

> ⚠ 코드 서명이 없어 Windows SmartScreen 경고가 뜹니다. "추가 정보" → "실행"을 클릭하면 설치됩니다.
>
> ℹ️ 이전 이름 `GitScope` 시절 데이터(모델/설정/최근 레포)는 첫 실행 시 `pepper/` 디렉토리로 자동 마이그레이션됩니다.

---

## 차별점 3가지

다른 Git GUI에는 없거나, 클라우드/유료 SaaS에 묶여있는 기능들을 **로컬에서 통합**합니다.

### 1️⃣ 심볼 단위 히스토리 — 함수/클래스가 어떻게 변해왔나

일반 Git GUI는 파일 단위 추적만 가능합니다. Pepper는 **Tree-sitter + `git log -L`** 로 **함수·클래스·메서드 단위 히스토리**를 제공합니다.

| 지원 언어 | 탐지 심볼 |
|---|---|
| TypeScript / TSX / JavaScript / JSX | function, class, method, interface, enum, type, arrow function |
| Rust | function, struct, enum, trait, impl, mod |
| Python | function, class (+ decorated) |
| **C#** | method, class, struct, interface, enum, constructor, record, property |

파일 히스토리 탭에서 심볼을 고르면 **그 심볼이 변경된 커밋만** 필터링됩니다. 리팩토링 히스토리 추적, 의도 변화 파악, 인수인계에 유용합니다.

### 2️⃣ 온디바이스 AI — 외부 API 키 없이 로컬에서

**llama.cpp sidecar + GGUF 모델**을 앱이 직접 관리합니다. 외부 ollama / API 키 / 클라우드 의존 없이 완전히 로컬에서 동작합니다.

| 기능 | 설명 |
|---|---|
| **AI 커밋 메시지** | staged diff + 힌트(선택) → conventional commit 한국어 subject/body 자동 분리 |
| **AI 심볼 진화 요약** | 함수/클래스의 `git log -L` 결과 → 자연어 narrative (요약 / 주요 변화 / 현재 상태) |
| **AI 테마 생성기** | 자연어("어두운 사이버펑크 분위기") → Catppuccin 호환 14 토큰 + WCAG/luminance 검증 |
| **AI 배경 데코 생성** | "고양이가 떠다니는" → `customIcons=["Cat","PawPrint"]` 자동 매핑 |

**모델**: Qwen 2.5 Coder 3B Q4_K_M (~2GB, 코딩 특화) 또는 1.5B (~1GB, 가벼움).
**런타임**: llama.cpp 자동 다운로드(~50MB), 포트 27182부터 자동 선택, `/health` ready 폴링, 메인 프로세스 종료 시 자동 정리.

### 3️⃣ 페퍼 배지 — 변경 빈도 시각화 (Pepper 시그니처)

파일 트리/변경사항/커밋 패널에 인라인으로 🌶️ 배지가 표시됩니다.

| 배지 | 의미 | 알고리즘 |
|---|---|---|
| 🌶️🌶️🌶️ | 매운맛 3단계 — 매우 자주 변경 (상위 3%) | `changes × 3 + authors × 5 + churn × 0.01 + recent × 10` 점수의 percentile |
| 🌶️🌶️ | 매운맛 2단계 — 자주 변경 (상위 10%) | 동일 점수 분포 기반 |
| 🌶️ | 매운맛 1단계 — 가끔 변경 (상위 33%) | 동일 점수 분포 기반 |
| ⚪🌶️ | stale — N일(기본 365일) 이상 변경 없음 | `git ls-files` − `git log --since=Nd` 차집합 |

핫 페퍼(자주 변경)와 stale 페퍼(오래 안 만진)는 mutual exclusive — 핫이면 stale 불가. 큰 레포는 `tooLarge=true` 가드로 분석 건너뜀.
별도 탭 없이 평소 작업 흐름 안에서 인지 가능 — "Forensics 탭 따로 안 가도 핫스팟 보임".

---

## 그 외 기능

### 기본 Git 워크플로우

- 커밋 로그 (페이지네이션, `--all` 토글, 키보드 네비 j/k, 그래프 lane)
- 변경사항 (Ctrl/Shift 다중 선택, hunk 단위 stage/unstage, working tree diff 미리보기)
- 브랜치 (생성/전환/머지/삭제, force 옵션)
- Stash (save · apply · pop · drop, untracked 포함 옵션, diff 미리보기)
- 원격 동기화 (fetch · pull · push 통합 버튼 + 상태 pill + 5초 폴링, 친근한 한국어 에러 분류)
- 충돌 해결 (Take ours / Take theirs 빠른 해결, 진행 중 spinner, 마지막 해결 시 완료 안내)

### 고급 Git 액션 (커밋 로그 우클릭)

| 액션 | 설명 |
|------|------|
| **Cherry-pick** | 머지 커밋은 `-m 1` 자동 적용, 충돌 시 abort/continue 배너 |
| **Reset** (soft / mixed / hard) | hard는 danger ConfirmModal로 명시적 손실 경고 |
| **Rebase** | 충돌 시 계속/건너뛰기/중단 3-액션 배너 |
| **Interactive rebase** ⭐ | 모달로 재정렬 / drop / reword / squash / fixup · `git rebase -i` todo 파일 안 쓰고 cherry-pick 체인으로 안전 구현 · 실패 시 원본 HEAD 자동 롤백 |

### 통합 헤더 (커스텀 타이틀 바)

- `decorations: false` + 자체 WindowControls (Linear/Discord 스타일)
- 로고 · 레포 · 브랜치 · 원격 동기화 · 설정 · 윈도우 컨트롤이 한 줄
- 헤더 전체가 드래그 영역

### 배경 데코 시스템

설정창 토글로 켜는 **떠다니는 아이콘 배경**. 시드 기반 결정적 렌더링.

- 3가지 drift 모드 (자유 / 위로 / 아래로) + 9개 옵션
- 36개 아이콘 풀 (git · code · minimal · fun · custom)
- AI 자연어 생성 ("고양이가 떠다니는") 가능

### UX

- **Catppuccin 4 flavor** (Mocha / Latte / Frappé / Macchiato) + AI 생성 / 수동 팔레트 편집
- **Lucide SVG** 아이콘 (이모지 미사용, OS 의존성 제거)
- **사이드바 드래그 리사이저** (180~600px, 더블클릭으로 리셋)
- **날짜 포맷 토글** (상대 / 절대)
- **토스트 알림** + **커스텀 ConfirmModal** (Enter/Esc)
- **키보드 단축키** (Ctrl+1/2 탭 전환, F5 새로고침, ↑↓·j/k 리스트 네비)
- **최근 레포 목록** (AppData에 최대 10개)
- **WebView2 컨텍스트 메뉴 차단**

---

## 기술 스택

| 계층 | 기술 |
|------|------|
| Desktop Shell | Tauri 2.10 |
| Frontend | React 18 + TypeScript + Vite 6 |
| Backend | Rust (`std::process::Command` 로 git CLI 래핑) |
| AST 파싱 | tree-sitter + TS/Rust/Python/C# grammar |
| 로컬 AI | llama.cpp sidecar + Qwen 2.5 Coder GGUF (OpenAI-compatible HTTP) |
| 아이콘 | lucide-react |
| Virtualization | react-window 2.x |
| 테마 | Catppuccin (4 flavor) + 커스텀 |

### 왜 Tauri로 (결정 배경)

초기에는 Express HTTP 서버 + Vite + React 웹앱이었습니다. 적대적 감사(자체 + Codex)에서 P0 보안 이슈 5건 발견:

- CORS 와일드카드 + 인증/CSRF 없음 → 악성 웹사이트가 localhost로 commit/push 트리거 가능
- `app.listen(PORT)` host 미지정 → LAN 전체 노출
- path traversal 가능, 전역 싱글톤 race, 모든 에러 200 OK

→ Tauri 2 + Rust + git CLI 래핑으로 재작성. P0 5건 중 3건은 구조적으로 소멸, 2건은 Rust 구조로 해결.
**`git2-rs` (libgit2 바인딩) 대신 CLI 래퍼를 선택한 이유**: `--follow` 미지원 등 기능 갭이 컸음. Fork / GitHub Desktop도 이 방식.

---

## 빠른 시작 (개발자)

### 요구사항

- Node.js 18+
- Rust (rustup) — Windows는 MSVC toolchain
- Microsoft C++ Build Tools (Windows) — "Desktop development with C++"
- Git 2.0+
- WebView2 — Windows 10 1803+ / 11 자동 포함

### 설치 & 실행

```bash
git clone https://github.com/cho1124/Pepper.git
cd Pepper
npm install
npm run dev
```
첫 빌드는 tree-sitter grammar 컴파일로 ~2분.

### 프로덕션 빌드

```bash
npm run build
```
산출물:

- `src-tauri/target/release/app.exe` — 단일 실행 파일
- `src-tauri/target/release/bundle/nsis/*.exe` — NSIS 설치 프로그램
- `src-tauri/target/release/bundle/msi/*.msi` — MSI 설치

---

## 사용 흐름

1. **앱 실행** → 폴더 선택 또는 경로 직접 입력 (이후 최근 레포 목록에서 클릭)
2. **AI 워밍업** — StatusBar 우측 `AI off` 클릭 → 30초 후 `AI · :PORT` 표시 (첫 실행 시 모델 ~2GB 다운로드)
3. **변경사항** 탭 — 파일 클릭 → diff → Stage (hunk 단위 가능) → `✨ AI 생성`으로 커밋 메시지 → 커밋
4. **커밋 로그** 탭 — 커밋 클릭 → diff (↑↓ 또는 j/k) · 우클릭으로 cherry-pick / reset / rebase / interactive rebase
5. **심볼 히스토리** 좌측 사이드바 → 파일 선택 → 함수/클래스 단위 변경 커밋만 → `✨ AI 요약`으로 진화 narrative
6. **페퍼 배지** 평소 작업 중 자동 인지 — 핫 🌶️ (자주 변경 후보 = 리팩토링 후보), stale ⚪🌶️ (안 만져진 영역 = 정리 후보)
7. **설정** — 테마 (4 flavor + AI 생성 + 수동 편집) · AI 모델 관리 · 배경 데코 · 페퍼 배지 임계값

---

## 프로젝트 구조

```
Pepper/
├── src-tauri/                       # Rust 백엔드
│   └── src/
│       ├── main.rs                  # entry
│       ├── lib.rs                   # AppState + 커맨드 등록
│       ├── git.rs                   # 기본 git 명령 (cherry-pick / reset / rebase / fetch 등)
│       ├── stash.rs                 # stash + working tree diff + hunk staging
│       ├── pepper.rs                # 🌶️ 페퍼 score 계산 + stale 파일 검출
│       ├── symbols.rs               # Tree-sitter 심볼 파싱 + git log -L
│       ├── recent.rs                # 최근 레포 (AppData JSON)
│       └── ai/                      # 로컬 AI 모듈
│           ├── catalog.rs           # GGUF 모델 카탈로그
│           ├── download.rs          # llama.cpp + 모델 다운로드 + SHA 검증
│           ├── paths.rs             # AppData/pepper/ + GitScope 마이그레이션
│           ├── server.rs            # llama.cpp sidecar 라이프사이클
│           └── commands.rs          # Tauri invoke 핸들러
└── src/client/                      # React 프론트엔드
    ├── App.tsx                      # 통합 헤더 + 배경 데코 마운트
    ├── api.ts                       # invoke 래퍼 + 공통 타입
    ├── global.css                   # Catppuccin 4 flavor + 디자인 토큰
    ├── lib/
    │   ├── hotspotContext.tsx       # 페퍼 배지 데이터 공급 (핫 + stale)
    │   ├── displaySettings.ts       # 설정 훅 (페퍼 임계값, 행 여백 등)
    │   └── ai/                      # ThemeAiProvider 추상화 (local / Anthropic BYOK)
    └── components/
        ├── WelcomeScreen.tsx · WindowControls.tsx · BackgroundDecor.tsx
        ├── CommitLog.tsx · CommitGraph.tsx · CommitPanel.tsx
        ├── DiffView.tsx · FileTree.tsx · FileHistory.tsx
        ├── StashAccordion.tsx · InteractiveRebaseModal.tsx
        ├── RemoteSyncButton.tsx · BranchSelector.tsx · StatusBar.tsx
        ├── SettingsModal.tsx · ThemeSelector.tsx · ManualPaletteEditor.tsx
        ├── LocalAiSettings.tsx · SpiceLevel.tsx (🌶️ 배지)
        └── Toast.tsx · ConfirmModal.tsx
```

---

## 적대적 검증 회고

이 프로젝트는 **다중 모델 적대적 검증 사이클**을 두 차례 통과했습니다.

### 1차: 보안 감사 (Express → Tauri 결정)

- 자체 + Codex 협업 감사로 P0 보안 이슈 5건 식별
- 결론: HTTP 서버 모델 폐기 → Tauri 로컬 앱으로 재작성

### 2차: 시나리오·결함 검증 (v0.5.0 직후)

- 4 라운드 Executor / Challenger / Arbiter 적대적 사이클
- 총 모순 27건 식별, VALID 판정 100%
- **Frame insight**: "본인용 vs 시장 출시" 이분법이 잘못된 frame이었음 — 실제 시나리오는 그 중간(소규모 신뢰권)이거나 **프로젝트 종결 단계**
- 결함 32건 식별, Critical 5건 + Medium 10건 → v1.0.0 정리 단계에서 D-01/D-06/D-07/D-17 처리

수치는 자기 마케팅이 아니라 **AI 도구 한계(측정 권한 없음) + 평가 기준 일관성 부재**라는 메타 통찰까지 포함합니다. 결과보다 통찰이 큰 케이스.

---

## 라이선스

MIT License
