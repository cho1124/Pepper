# Pepper 스크린샷·데모 GIF 가이드

> 포폴 종결판(v1.0.0) 출시 시 README와 GitHub Release에 첨부할 스크린샷/GIF 촬영 체크리스트.

## 저장 위치 & 명명

- 디렉터리: `docs/screenshots/`
- PNG 명명: `NN-name.png` (e.g. `01-welcome.png`)
- GIF 명명: `NN-name.gif` (e.g. `02-ai-commit.gif`)
- 최대 폭: 1600px (Retina 시 2x = 800pt 표시)
- GIF: 10초 이하, 12fps, 8MB 이하 (GitHub 인라인 표시 한도 ~10MB)

## 권장 도구 (Windows)

- **ScreenToGif** (무료, MS Store/공식) — 영역 캡처 + GIF 인코딩 + 프레임 편집 한 번에
- 또는 OBS Studio → mp4 → ezgif.com 으로 GIF 변환
- 정적 캡처는 `Win + Shift + S` (Snipping Tool)

## 촬영 전 환경

1. 깨끗한 dummy 레포 준비 (커밋 50개 이상, 브랜치 2~3개)
2. Catppuccin Mocha 테마 + 배경 데코 OFF (이미지 노이즈 최소화)
3. 사이드바 폭 260px (기본값) / 윈도우 1280×800
4. AI 워밍업 완료 (`AI · :PORT` 상태)
5. 페퍼 배지 토글 ON (핫 + stale 둘 다)

## 촬영 체크리스트

### 정적 PNG (필수 5장)

- [ ] `01-welcome.png` — 웰컴 화면 (최근 레포 1~2개 + 폴더 선택 버튼)
- [ ] `02-overview.png` — 메인 뷰 (커밋 로그 + diff + 페퍼 배지 보이는 상태)
- [ ] `03-symbol-history.png` — 좌측 심볼 사이드바 + 선택된 함수의 커밋만 필터링된 모습
- [ ] `04-settings-theme.png` — 설정 모달 외형 탭 (테마 + 배경 데코)
- [ ] `05-conflicts.png` — 충돌 해결 패널 (cherry-pick/rebase 중, Take ours/theirs 버튼 가시화)

### 데모 GIF (각 5~10초, 필수 3개)

- [ ] `g01-pepper-badges.gif` — 파일 트리/변경사항 패널에서 🌶️ 배지 인라인 표시 + 설정창 슬라이더 조정 시 즉시 반영
- [ ] `g02-ai-commit.gif` — 변경사항 탭에서 파일 stage → 힌트 입력 → `✨ AI 생성` → conventional commit subject/body 자동 분리
- [ ] `g03-hunk-staging.gif` — DiffView에서 hunk 단위 stage / unstage 버튼 클릭 + Ctrl/Shift 다중 선택

### 선택 GIF (추가 3개)

- [ ] `g04-symbol-ai-summary.gif` — 심볼 선택 → `✨ AI 요약` → narrative 출력
- [ ] `g05-interactive-rebase.gif` — 커밋 로그 우클릭 → Interactive rebase 모달 → drop/squash/reorder
- [ ] `g06-decor-ai.gif` — 설정창 배경 데코 → "고양이가 떠다니는" → 자동 매핑된 PawPrint/Cat 아이콘 시각화

## README에 삽입할 위치

배지 줄 아래 (현재 `<!-- 스크린샷/데모 GIF 자리 -->` 주석):

```markdown
![Pepper overview](docs/screenshots/02-overview.png)
```

각 차별점 절 아래 GIF 직접 삽입:

```markdown
### 3️⃣ 페퍼 배지
... (텍스트)
![Pepper badges in action](docs/screenshots/g01-pepper-badges.gif)
```

## v1.0.0 Release notes

GitHub Release 본문 상단에도 한두 장 첨부 — `02-overview.png`와 `g01-pepper-badges.gif` 권장.

## 비고

- 데모 레포는 공개 가능한 것으로 (`Pepper` 자신 또는 `archive/express-version` 활용 가능)
- 한국어 UI 그대로 노출 OK (포폴 타겟이 국내 위주라면 오히려 강점)
- 자격 증명/실 경로/실 이메일이 화면에 보이는 경우 흐림 처리