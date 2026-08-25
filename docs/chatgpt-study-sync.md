# ChatGPT 예약 학습 동기화

ChatGPT 예약 작업은 실행할 때마다 학습 내용을 아래 한 파일에 보관합니다.

```text
study-logs/YYYY/MM/DD/{english|japanese|toeic}.md
```

한 날짜와 학습 종류에는 파일이 하나만 있습니다. 같은 작업을 다시 실행하면 기존 파일을 조회한 뒤, 같은 `automation_id`인 경우에만 갱신합니다. 파일 삭제는 D1에서 자동 삭제하지 않습니다.

## 파일 계약

파일은 사람이 읽는 Markdown과 페이지 표시용 JSON을 함께 담습니다.

````markdown
---
date: "2026-08-25"
kind: "english"
source: "chatgpt-automation"
automation_id: "예약 작업 ID"
generated_at: "2026-08-25T06:30:00+09:00"
---

# 오늘의 영어

학습 요약

## 전체 학습 항목

1. 학습 문장과 설명

## 구조화 데이터

```json
{
  "title": "오늘의 영어",
  "summary": "학습 요약",
  "speakingSentence": "Could you clarify the deadline?",
  "speakingMeaning": "마감일을 명확히 알려주시겠어요?",
  "items": [
    {
      "prompt": "Could you clarify the deadline?",
      "answer": "마감일을 명확히 알려주시겠어요?",
      "explanation": "정중하게 확인을 요청하는 표현입니다."
    }
  ]
}
```
````

실제 파일의 학습 항목 수는 영어 5개, 일본어 5개, TOEIC 10개입니다. 각 항목에는 `prompt`, `answer`, `explanation`이 모두 있어야 합니다. 동기화 전에 날짜, 경로, 필드 길이, JSON 형식과 일반적인 비밀 값 패턴을 검사합니다.

## 자동 반영 흐름

1. 예약 작업이 `main` 브랜치에 그날의 Markdown 파일 하나만 생성하거나 갱신합니다.
2. `Sync ChatGPT study logs` GitHub Actions가 파일을 검증합니다.
3. 검증된 구조화 데이터만 기존 D1의 `study_content`에 날짜와 종류 기준으로 업서트합니다.
4. 사이트가 `/api/materials?date=YYYY-MM-DD`에서 자료를 읽어 영어, 일본어, TOEIC 카드로 표시합니다.

동일 파일을 다시 처리해도 D1 행은 중복 생성되지 않습니다. 학습 파일만 바뀐 커밋은 전체 Worker 배포를 실행하지 않습니다.

## 공개 저장소 안전 규칙

`feed-mina/language-study-log`는 공개 저장소이므로 예약 작업에는 다음 내용을 넣지 않습니다.

- GitHub 토큰, API 키, 비밀번호 또는 인증 헤더
- 회사명, 고객명, 내부 시스템명과 비공개 주소
- Telegram Chat ID와 개인 메시지
- 사용자가 제출한 답안, 음성 또는 개인정보

GitHub 연결이 실패해도 ChatGPT 대화의 학습 알림은 정상적으로 제공하며, 비밀 값을 사용자에게 요구하지 않습니다.
