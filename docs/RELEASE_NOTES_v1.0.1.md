# 🌶️ Pepper v1.0.1 — AI 진단 가시성 핫픽스

> v1.0.0 에서 AI 서버가 시작 실패할 때 "30초 안에 응답하지 않았습니다" 만 뜨고 진짜 원인을 알 수 없던 디버깅 사각지대를 해소합니다.

## 🔧 변경

- **llama-server stderr 파일 로깅**: `<DataLocal>/pepper/logs/llama-server.log` 에 spawn마다 헤더(타임스탬프 / 모델 ID / 포트) + stderr 전체 append
- **에러 토스트에 stderr tail 포함**: 시작 실패 시 마지막 40줄 + 로그 파일 경로 노출
- AI 동작 자체에는 변경 없음 — 진단 정보만 추가

## 신고할 때 첨부 부탁

AI 시작 실패 시 다음 두 가지가 있으면 진짜 원인 식별이 쉬워집니다.

1. 토스트 에러 메시지 전문 (`stderr 마지막 N줄` 포함)
2. `%LOCALAPPDATA%\pepper\logs\llama-server.log` 파일

흔한 원인:

- **AVX2 미지원 CPU** — llama.cpp Windows CPU 빌드는 AVX2 가정 (구형 인텔/AMD/가상화 환경)
- **DLL 누락** — Defender / 회사 보안이 일부 .dll 격리
- **모델 파일 corrupt** — 2GB 다운로드 중 끊김 → resume 없음
- **AppData 쓰기 권한** — OneDrive 동기화 폴더 충돌

## 업그레이드

설치 그대로 덮어쓰면 됩니다. 이전 모델/llama.cpp 바이너리는 `<DataLocal>/pepper/` 에 그대로 보존됩니다.

## 다운로드

| 파일 | 용도 |
|---|---|
| `Pepper_1.0.1_x64-setup.exe` | NSIS 설치 (권장) |
| `Pepper_1.0.1_x64_en-US.msi` | MSI 설치 (기업용) |

> ⚠ 코드 서명 없음 — SmartScreen 경고 시 "추가 정보" → "실행"

상세 변경 이력: [CHANGELOG.md](https://github.com/cho1124/Pepper/blob/master/CHANGELOG.md)