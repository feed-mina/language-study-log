# language-study-log — easy-guide 쉬운 업데이트 설명

한국시간 2026년 9월 18~19일 업데이트 보고서. 활동 집계 마감은 9월 19일 21:24:15입니다.

영어·일본어·TOEIC 자료를 날짜별로 보관하고 학습 사이트에 연결하는 저장소입니다. 이번 이틀 동안 각 종류가 하루 한 파일씩, 총 6개 추가됐습니다.

| 항목 | 기준 |
|---|---|
| 보고서 범위 | 이번 기간의 변경과 관련 기능. 전체 시스템 설명은 아래 기존 상세 문서로 연결합니다. |
| 확인 브랜치 | main |
| 소스 기준 | `4cea725e235e` |
| 검증 범위 | 이번에 원본 변환 스크립트로 두 날짜의 파일 6개를 검사해 Validated 6 study log file(s)를 확인했습니다. 해당 커밋 6개 자동 동기화 작업도 모두 success입니다. |
| 보고서 세트 | [쉬운 설명](easy-guide.md) · [수정·검증 지시](fix-guide.md) · [코드 인수인계](screen-code-handover.md) |

## 이번에 달라진 것

- 9월 18일 영어·일본어·TOEIC 자료 3개를 추가했습니다.
- 9월 19일 같은 세 종류 자료 3개를 추가했습니다. 화면 기능 코드 변경은 없습니다.
- 해당 6개 커밋의 Sync ChatGPT study logs 작업이 모두 success로 완료된 기록을 확인했습니다.

## 1. 용어와 원리

| 용어 | 쉬운 뜻과 이번 작업에서의 역할 |
|---|---|
| Frontmatter (문서 머리말 정보) | 날짜·종류·생성 시각 같은 검증 정보를 문서 맨 위에 적습니다. |
| Upsert (없으면 추가, 있으면 갱신) | 같은 날짜·종류의 자료가 중복으로 쌓이지 않게 저장하는 방식입니다. |
| GitHub Actions | 파일이 올라오면 검증·동기화 명령을 자동 실행하는 작업입니다. |

## 2. 익숙한 상황에 빗대어 보기

매일 세 과목의 학습지를 날짜별 서랍에 넣는 방식입니다. 영어·일본어는 각각 5문항, TOEIC은 10문항인지 검사한 뒤 사이트 장부로 옮깁니다. 학습지가 배달됐다는 것과 실제로 공부를 마쳤다는 것은 다릅니다.

이 비유는 역할을 이해하기 위한 설명입니다. 실제 저장·승인·실행 조건은 코드 인수인계 보고서를 기준으로 확인합니다.

## 3. 서로 어떻게 연결되는가

학습 Markdown에는 읽는 본문과 검증용 JSON이 함께 있습니다. 변환 스크립트가 경로·날짜·문항을 검사하고 SQL을 만들며 자동 작업이 D1에 반영합니다. 이번 6건은 파일 형식 검사와 자동 작업 성공까지 확인했습니다.

| 산출물 | 읽고 판단할 일 |
|---|---|
| easy-guide | 무엇이 달라졌고 어디까지 가능한지 이해 |
| fix-guide | 학습 자료 형식·날짜·동기화 누락 점검 |
| screen-code-handover | 화면·함수·입력·출력·저장 위치를 따라 유지보수 |

## 4. 직접 확인하는 순서

1. 9월 18일과 19일 폴더에서 세 과목 파일을 확인합니다. 성공 기준: 각 날짜마다 세 파일이 있습니다.
2. Actions에서 해당 커밋의 동기화 결과를 엽니다. 성공 기준: Sync ChatGPT study logs가 success입니다.
3. 사이트에서 날짜별 자료를 확인합니다. 자료가 안 보이면 화면 기능을 고치기 전에 커밋·동기화·조회 날짜를 확인합니다.

## 확인한 활동

| 한국시간 | 커밋 | 기록된 작업 | 구분 |
|---|---|---|---|
| 09/19 18:03 | [4cea725](https://github.com/feed-mina/language-study-log/commit/4cea725e235e3c3e7348ab2b929ce61f412ca0ae) | docs(study-log): sync toeic 2026-09-19 | 변경 기록 |
| 09/19 08:26 | [a445c0a](https://github.com/feed-mina/language-study-log/commit/a445c0ab66005c7d4d68db8d190d4d3d39e2ff7d) | docs(study-log): sync japanese 2026-09-19 | 변경 기록 |
| 09/19 07:11 | [3b4b710](https://github.com/feed-mina/language-study-log/commit/3b4b7103f198767080a41b788dc8dcb16e6c5e35) | docs(study-log): sync english 2026-09-19 | 변경 기록 |
| 09/18 18:03 | [7e66583](https://github.com/feed-mina/language-study-log/commit/7e665835eafb2127e19b9f0705a45d94347cb734) | docs(study-log): sync toeic 2026-09-18 | 변경 기록 |
| 09/18 08:19 | [73b7277](https://github.com/feed-mina/language-study-log/commit/73b7277424f2852fbb70c10aff6c3dde765ee73d) | docs(study-log): sync japanese 2026-09-18 | 변경 기록 |
| 09/18 07:21 | [b986a00](https://github.com/feed-mina/language-study-log/commit/b986a004470a43040bb5d6e49c2ea3d016e542c3) | docs(study-log): sync english 2026-09-18 | 변경 기록 |

커밋은 파일 변경 기록이고 병합은 작업 브랜치를 합친 기록입니다. 둘을 별개의 기능 수로 세지 않습니다. 에이전트가 작성한 커밋도 사용자 저장소의 작업으로 포함했습니다.

## 기존 상세 자료

- [운영·학습 흐름](https://github.com/feed-mina/language-study-log/blob/4cea725e235e3c3e7348ab2b929ce61f412ca0ae/README.md)
- [9월 19일 TOEIC 동기화 성공](https://github.com/feed-mina/language-study-log/actions/runs/35433674548)
