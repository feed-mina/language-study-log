# Language Study Log

영어·일본어·TOEIC 학습 자료를 정해진 시간에 생성해 이메일로 보내고, 학습 일정과 기록을 한 사이트에서 관리하는 Cloudflare Worker 앱입니다.

## 구성

- Vinext/Next 화면과 API를 하나의 Cloudflare Worker로 배포
- Cron Triggers로 매일 영어·일본어, 월–토 TOEIC 작업 실행
- Workers AI로 학습 콘텐츠와 영어 한 문장 MP3 생성
- D1에 일정, 생성 콘텐츠, 파일 메타데이터, 발송 이력 저장
- R2에 MP3, PDF, 이미지 저장
- Cloudflare Email Service로 본문과 영어 MP3 발송
- `main` 브랜치 push 시 GitHub Actions가 검사 후 자동 배포

예약 시각은 Cloudflare Cron의 UTC 기준입니다.

| 학습 | 한국 시각 | Cron UTC |
|---|---:|---|
| 영어 | 매일 06:30 | `30 21 * * *` |
| 일본어 | 매일 08:00 | `0 23 * * *` |
| TOEIC | 월–토 18:00 | `0 9 * * mon-sat` |

## API

| Method | 경로 | 용도 | 인증 |
|---|---|---|---|
| `GET` | `/api/health` | D1 및 바인딩 상태 확인 | 없음 |
| `GET` | `/api/materials?date=YYYY-MM-DD&kind=english` | 날짜별 생성 자료 조회 | 없음 |
| `GET`, `HEAD` | `/api/assets/:id` | R2 파일 조회 | 없음 |
| `POST` | `/api/admin/generate` | 자료 생성 및 선택적 이메일 발송 | Bearer 토큰 |
| `POST` | `/api/admin/send/:contentId` | 기존 자료 이메일 재발송 | Bearer 토큰 |
| `PUT` | `/api/admin/assets/:kind/:filename` | MP3/PDF/이미지 업로드(최대 20 MiB) | Bearer 토큰 |

자료 생성 예시:

```bash
curl -X POST https://YOUR_WORKER.workers.dev/api/admin/generate \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-08-23","kind":"english","sendEmail":true}'
```

파일 업로드 예시:

```bash
curl -X PUT https://YOUR_WORKER.workers.dev/api/admin/assets/english/practice.mp3 \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: audio/mpeg" \
  --data-binary @practice.mp3
```

## Cloudflare 최초 설정

1. `wrangler login` 후 D1과 R2를 만듭니다.

```bash
npx wrangler d1 create language-study-log-db
npx wrangler r2 bucket create language-study-log-assets
```

2. 반환된 D1 ID를 `wrangler.jsonc`의 `database_id`에 기록합니다.
3. 발신 도메인을 Cloudflare Email Service에 등록한 뒤 Worker 비밀 값을 저장합니다.

```bash
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put STUDY_EMAIL_TO
npx wrangler secret put STUDY_EMAIL_FROM
```

4. GitHub 저장소 Actions secrets에 아래 값을 등록합니다.

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

설정 전에도 GitHub Actions의 린트·타입·빌드는 실행되며, Cloudflare 배포 단계만 안전하게 건너뜁니다.

Email Service 비밀 값이 아직 없으면 예약 작업은 학습 자료와 영어 MP3를 생성해 D1/R2에 저장하고 이메일 발송만 건너뜁니다.

## 개발과 검증

```bash
npm ci
npm run worker:types
npm run check
```

실제 비밀 값은 `.dev.vars`에만 두고 커밋하지 않습니다. 형식은 `.dev.vars.example`을 참고하세요.
