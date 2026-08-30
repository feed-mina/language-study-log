# Language Study Log

ChatGPT 예약 작업이 만든 영어·일본어·TOEIC 학습 자료를 GitHub에 날짜별로 보관하고, D1과 학습 사이트에 자동 반영하는 Cloudflare Worker 앱입니다.

## 구성

- Vinext/Next 화면과 API를 하나의 Cloudflare Worker로 배포
- ChatGPT 예약 작업으로 매일 영어·일본어, 월–토 TOEIC 자료 생성
- `study-logs/YYYY/MM/DD/{kind}.md`에 사람이 읽는 본문과 검증용 JSON 보관
- GitHub Actions가 학습 파일을 검증하고 기존 D1에 멱등 업서트
- D1에 일정, 생성 콘텐츠, 파일 메타데이터, 발송 이력 저장
- R2에 MP3, PDF, 이미지 저장
- 날짜를 선택하면 영어·일본어·TOEIC 전체 자료와 정답을 사이트에 표시
- 지나간 미완료 일정을 최대 7개까지 모아 보여주고, 한 번에 선택한 날짜로 다시 예약
- 수동 API로 Workers AI 생성 및 Telegram 발송 가능
- FSRS로 카드별 다음 복습일 계산
- 소스 코드의 `main` push는 검사 후 Worker 배포, 학습 파일만 바뀐 push는 D1 동기화만 실행

예약 작업의 기준 시간대는 `Asia/Seoul`입니다.

| 학습 | 한국 시각 | 파일명 |
|---|---:|---|
| 영어 | 매일 06:30 | `english.md` |
| 일본어 | 매일 08:00 | `japanese.md` |
| TOEIC | 월–토 18:00 | `toeic.md` |

Cloudflare Cron은 같은 날짜의 자료를 중복 생성하지 않도록 비활성화했습니다. GitHub 보관 형식과 검증 규칙은 [`docs/chatgpt-study-sync.md`](docs/chatgpt-study-sync.md)에 정리되어 있습니다.

GitHub Actions는 `wrangler.jsonc`에 연결된 Cloudflare D1을 갱신합니다. 화면과 API는 모두 `language-study-log.evolvix.workers.dev` Worker에서 제공합니다. 자료 조회는 공개하고, 일정과 개인 학습 기록의 추가·완료·이동·삭제는 관리자 로그인 또는 Bearer 토큰으로 보호합니다.

## API

| Method | 경로 | 용도 | 인증 |
|---|---|---|---|
| `GET` | `/api/health` | D1 및 바인딩 상태 확인 | 없음 |
| `GET` | `/api/materials?date=YYYY-MM-DD&kind=english` | 날짜별 생성 자료 조회 | 없음 |
| `GET`, `HEAD` | `/api/assets/:id` | R2 파일 조회 | 없음 |
| `GET` | `/api/reviews/due?language=english&limit=20` | 오늘 복습할 카드 조회 | 없음 |
| `GET` | `/api/dashboard` | 일정과 개인 학습 기록 조회 | 없음 |
| `POST`, `PATCH`, `DELETE` | `/api/dashboard` | 일정과 개인 학습 기록 추가·변경·삭제 | 관리자 세션 또는 Bearer 토큰 |
| `GET`, `POST`, `DELETE` | `/api/dashboard/session` | 관리자 세션 확인·로그인·로그아웃 | 로그인 시 `ADMIN_TOKEN` |
| `POST` | `/api/admin/generate` | 자료 생성 및 선택적 Telegram 발송 | Bearer 토큰 |
| `POST` | `/api/admin/send/:contentId` | 기존 자료 Telegram 재발송 | Bearer 토큰 |
| `POST` | `/api/admin/reviews/:cardId` | 복습 평가 저장 | Bearer 토큰 |
| `PUT` | `/api/admin/assets/:kind/:filename` | MP3/PDF/이미지 업로드(최대 20 MiB) | Bearer 토큰 |
| `POST` | `/api/telegram/connect` | 최근 `/start` 사용자와 Telegram 연결 | Bearer 토큰 |

브라우저에서는 상단의 `관리자 로그인`에 `ADMIN_TOKEN`을 입력합니다. 성공하면 12시간 동안 서명된 `HttpOnly` 쿠키로 편집할 수 있으며 토큰 원문은 브라우저 저장소에 보관하지 않습니다. 자동화나 명령줄에서는 기존과 같이 `Authorization: Bearer $ADMIN_TOKEN`을 사용할 수 있습니다.

## 놓친 예약을 관리하는 방식

알림 시각을 반드시 지키는 방식 대신 **생성 → 다시 잡기 → 완료**의 세 단계로 운영합니다.

1. 예약 작업은 정해진 시각에 학습 자료를 생성하고 사이트는 날짜별 자료를 보관합니다.
2. 과거 일정이 미완료인 채 남으면 대시보드의 `놓친 공부, 다시 잡기`에 최근 7개가 표시됩니다.
3. 전부 만회하려 하지 않고 하나를 골라 `이 날짜로 옮기기`를 누른 뒤, 실제로 공부한 후 완료 표시나 학습 기록을 남깁니다.

이 방식은 알림을 놓친 사실과 학습 자료의 소실을 분리합니다. 알림은 시작을 돕는 신호일 뿐이고, 사이트는 놓친 작업을 다시 선택할 수 있는 인박스 역할을 합니다.

자료 생성 예시:

```bash
curl -X POST https://YOUR_WORKER.workers.dev/api/admin/generate \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-08-23","kind":"english","sendTelegram":true}'
```

파일 업로드 예시:

```bash
curl -X PUT https://YOUR_WORKER.workers.dev/api/admin/assets/english/practice.mp3 \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: audio/mpeg" \
  --data-binary @practice.mp3
```

복습 평가는 `{"rating":"again|hard|good|easy"}` 형식으로 전송합니다.

## Cloudflare 및 Telegram 최초 설정

1. `wrangler login` 후 D1과 R2를 만듭니다.

```bash
npx wrangler d1 create language-study-log-db
npx wrangler r2 bucket create language-study-log-assets
```

2. 반환된 D1 ID를 `wrangler.jsonc`의 `database_id`에 기록합니다.
3. Telegram의 `@BotFather`에서 개인 봇을 만든 뒤 새 봇과의 채팅에서 `/start`를 한 번 보냅니다.
4. 실제 값이 콘솔 기록이나 Git에 남지 않도록 Wrangler의 대화형 입력으로 Worker 비밀 값을 저장합니다. Bot Token은 채팅이나 저장소에 붙여 넣지 않습니다.

```bash
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put TELEGRAM_BOT_TOKEN
```

5. 배포 후 아래 연결 API를 한 번 호출합니다. Worker는 Telegram에 보관된 가장 최근의 개인 `/start` 메시지를 확인하고 Chat ID를 D1에 저장한 뒤 확인 메시지를 발송합니다. Chat ID를 직접 복사하거나 별도 서비스에 제공할 필요가 없습니다.

```bash
curl -X POST https://language-study-log.evolvix.workers.dev/api/telegram/connect \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

연결 상태는 `GET /api/telegram/status`에서 `token`, `connected` 불리언 값으로만 확인할 수 있습니다. 기존 `TELEGRAM_CHAT_ID` Secret은 필요한 경우 수동 대상 지정용 호환 옵션으로 계속 지원합니다.

6. GitHub 저장소 Actions secrets에 아래 값을 등록합니다.

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

설정 전에도 GitHub Actions의 린트·타입·빌드는 실행되며, Cloudflare 배포 단계만 안전하게 건너뜁니다. 학습 파일 D1 동기화는 두 값이 없으면 실패하므로, 예약 작업을 연결하기 전에 설정해야 합니다.

예약 작업 프롬프트에는 이 두 값이나 `ADMIN_TOKEN`을 넣지 않습니다. GitHub Actions만 저장소 Secret을 읽으며, 예약 작업은 공개 학습 Markdown 한 파일만 수정합니다.

Telegram Bot API 참고 문서:

- <https://core.telegram.org/bots/api>
- <https://core.telegram.org/bots/faq>

오픈소스 채택 범위와 이후 구현 순서는 [`docs/open-source-reference.md`](docs/open-source-reference.md)에 기록합니다.

## 개발과 검증

```bash
npm ci
npm run worker:types
npm run check
```

실제 비밀 값은 `.dev.vars`에만 두고 커밋하지 않습니다. 형식은 `.dev.vars.example`을 참고하세요.
