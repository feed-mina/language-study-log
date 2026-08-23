---
title: 비즈니스 언어 학습 기능 오픈소스 참조
date: 2026-08-23
status: 적용 중
project: language-study-log
---

# 비즈니스 언어 학습 기능 오픈소스 참조

이 문서는 `language-study-log`에 비즈니스 영어·일본어 학습, 반복 복습, 역할극과 문장 교정을 추가할 때 참고하는 공개 저장소와 채택 범위를 기록한다. 원본 프로젝트를 통째로 결합하지 않고 현재의 Cloudflare Worker, D1, R2, Workers AI, Telegram 구조에 필요한 부분만 독립적으로 적용한다.

## 채택 원칙

- 별도 Java 또는 Python 서버를 운영하지 않는다.
- Cloudflare Worker에서 실행 가능한 TypeScript 코드를 우선한다.
- D1을 학습 카드·복습 이력·실수 기록의 원본 저장소로 사용한다.
- R2에는 생성된 MP3와 업로드 파일만 저장한다.
- Telegram은 알림과 짧은 학습 자료 전달에 사용하고, 전체 기록은 사이트에 남긴다.
- AGPL 코드는 직접 복사하지 않고 공개된 아이디어와 사용자 흐름만 독립적으로 구현한다.
- 외부 학습 자료를 반입할 때는 라이선스와 출처를 데이터 행 또는 저장소 고지에 남긴다.

## 1. ts-fsrs

- 저장소: <https://github.com/open-spaced-repetition/ts-fsrs>
- 라이선스: MIT
- 역할: 카드별 다음 복습 시각 계산
- 적용 방식: `ts-fsrs` 패키지의 `createEmptyCard()`, `repeat()`, `next()` 사용
- 제외: 초기 단계에서는 Rust/WASM 기반 `@open-spaced-repetition/binding` 최적화 패키지 제외

### 참고 파일

- 패키지 사용법: <https://github.com/open-spaced-repetition/ts-fsrs/blob/main/packages/fsrs/README.md>
- 타입과 상태: <https://github.com/open-spaced-repetition/ts-fsrs/tree/main/packages/fsrs>

| 사용자 선택 | FSRS 평가 |
| --- | --- |
| 다시 | `Rating.Again` |
| 어려움 | `Rating.Hard` |
| 보통 | `Rating.Good` |
| 쉬움 | `Rating.Easy` |

카드 상태는 D1의 `study_cards`에 저장하고, 선택 이력은 `review_logs`에 append한다. 기본 목표 기억률은 90%, 최대 복습 간격은 365일로 시작한다.

## 2. nihongo-it-anki

- 저장소: <https://github.com/KakkoiDev/nihongo-it-anki>
- 라이선스: MIT
- 역할: 업무 일본어 자료 구조, 검증 규칙, 일본어 TTS 전처리 참고
- 적용 방식: 검토된 텍스트만 출처와 함께 D1로 반입하고 음성은 Workers AI로 다시 생성
- 제외: Anki 생성기, Python 런타임, Edge TTS, 기존 MP3, Anki 마이그레이션

### 우선 검토할 덱

| Tier | 주제 | 문장 수 |
| ---: | --- | ---: |
| 7 | 면접 | 30 |
| 8 | 문제 해결 | 30 |
| 12 | 실시간 회의 | 100 |
| 13 | 회사 생활·1:1 미팅 | 60 |
| 14 | 비즈니스 이메일 | 40 |
| 15 | 티켓·커밋·PR | 40 |

첫 반입 후보는 Tier 12·14·15의 180개 문장이다. 반입 전에 자연스러움, 경어, 번역과 실제 사용 맥락을 검토한다.

### 참고 파일

- 덱 구성: <https://github.com/KakkoiDev/nihongo-it-anki/blob/master/decks/it-vocab/deck.toml>
- 회의 자료: <https://github.com/KakkoiDev/nihongo-it-anki/blob/master/decks/it-vocab/tier12-vocabulary.csv>
- 비즈니스 이메일: <https://github.com/KakkoiDev/nihongo-it-anki/blob/master/decks/it-vocab/tier14-vocabulary.csv>
- 티켓·커밋·PR: <https://github.com/KakkoiDev/nihongo-it-anki/blob/master/decks/it-vocab/tier15-vocabulary.csv>
- 자료 검증: <https://github.com/KakkoiDev/nihongo-it-anki/blob/master/scripts/validate.py>
- TTS 전처리: <https://github.com/KakkoiDev/nihongo-it-anki/blob/master/scripts/pronunciation.py>
- 발음 감사 방법: <https://github.com/KakkoiDev/nihongo-it-anki/blob/master/docs/tts-audio-debugging.md>

CSV의 `Sentence`, `Translation`, `Cloze`, `Pronunciation`, `Note`, `Register`, `KeyMeaning`, `PitchAccent`를 검증한다. TTS에는 기술 약어의 일본어 읽기 전처리와 알려진 오독 교정 아이디어만 선별 적용한다.

## 3. Kaiwa

- 저장소: <https://github.com/yeshsanchez/Kaiwa>
- 라이선스: AGPL-3.0
- 역할: 역할극, 교정, 힌트, 세션 요약, 최근 실수 재활용 흐름 참고
- 적용 방식: 동작과 데이터 흐름만 참고하여 TypeScript로 독립 구현
- 제외: 원본 Python 코드 직접 복사, Ollama, whisper.cpp, VoiceVox, 자체 SM-2 구현

### 참고 파일

- 역할극 데이터 구조: <https://github.com/yeshsanchez/Kaiwa/blob/main/server/scenarios.py>
- 대화·교정·힌트·요약 프롬프트 구조: <https://github.com/yeshsanchez/Kaiwa/blob/main/server/prompts.py>
- 세션과 교정 API 흐름: <https://github.com/yeshsanchez/Kaiwa/blob/main/server/main.py>
- 실수·단어·복습 저장 구조: <https://github.com/yeshsanchez/Kaiwa/blob/main/server/db.py>

독립 구현할 역할극 필드는 `language`, `category`, `title`, `learnerRole`, `aiRole`, `situation`, `goal`, `targetExpressions`, `level`, `register`다. 교정 결과는 원문, 수정문, 오류 유형, 짧은 한국어 설명, 더 전문적인 표현을 구조화된 JSON으로 저장한다. 최근 실수는 다음 역할극 프롬프트에 소량 재투입하고 FSRS 카드로 전환한다.

## 사용하지 않는 LanguageTool

LanguageTool은 성숙한 영어 교정 프로젝트지만 Java 서버가 필요하므로 현재 경량 구성에서는 제외한다. 영어·일본어 교정은 Workers AI에 엄격한 JSON 응답 스키마와 길이 제한을 적용하여 구현한다.

## 목표 데이터 흐름

```text
Cron
  ↓
새 학습 자료 + 오늘 복습할 FSRS 카드 선택
  ↓
D1: 콘텐츠·카드·복습·실수 이력
R2: 생성 MP3
  ↓
Telegram: 짧은 자료 + MP3 + 사이트 버튼
  ↓
사이트: 다시 / 어려움 / 보통 / 쉬움
  ↓
FSRS가 다음 복습일 계산
  ↓
역할극 답변 교정 → 틀린 표현을 새 복습 카드로 저장
```

## 구현 순서와 상태

- [x] 오픈소스 참조 범위와 라이선스 경계 문서화
- [x] Gmail 전송 계층을 Telegram Bot 전송 계층으로 교체
- [x] `ts-fsrs`와 D1 카드·복습 이력 기반 추가
- [ ] Telegram Bot Token과 Chat ID 연결 및 실수신 검증
- [ ] 검토된 업무 일본어 Tier 12·14·15 반입
- [ ] Telegram 복습 평가 버튼과 안전한 webhook 연결
- [ ] 회의·이메일·면접 역할극 추가
- [ ] Workers AI 구조화 교정과 실수 카드 자동 생성
- [ ] 일본어 기술 용어 TTS 전처리 추가
- [ ] 영어 비즈니스 역할극 확장

완료 표시는 코드 작성만이 아니라 검사, 마이그레이션, 배포 또는 실제 외부 서비스 검증 단계를 구분해 갱신한다.
