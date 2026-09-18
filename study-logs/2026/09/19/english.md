---
date: "2026-09-19"
kind: "english"
source: "chatgpt-automation"
automation_id: "6a88f71bcde08191a07c7b9ec1daab1f"
generated_at: "2026-09-19T07:11:21+09:00"
---
# 실무 영어 5문장 — 요구사항 충돌·성능 재현·범위 관리·산정 검토·장애 회고

요구사항의 우선순위 결정, 특정 조건의 성능 저하 재현, 릴리스 범위 통제, 일정 산정의 전제 검토, 장애 원인과 예방 조치 기록에 활용할 수 있는 실무 영어 5문장을 연습합니다.

## 전체 학습 항목

### 1. 요구사항 충돌

**These two requirements conflict, so we need to decide which one takes precedence.**  
이 두 요구사항은 서로 충돌하므로 어느 쪽을 우선할지 결정해야 합니다.

문법: conflict는 자동사로 ‘서로 충돌하다’, take precedence는 ‘우선하다’라는 뜻입니다. which one takes precedence는 decide의 목적어 역할을 하는 간접의문문입니다. 발음: requirements는 ‘리콰이어먼츠’, precedence는 ‘프레서던스’에 가깝습니다. 상황: 동시에 만족시키기 어려운 요구사항의 우선순위를 정할 때 씁니다.

### 2. 성능 저하 재현

**I can reproduce the slowdown only when the cache is empty.**  
캐시가 비어 있을 때만 성능 저하를 재현할 수 있습니다.

문법: only when은 ‘~할 때만’이라는 제한 조건을 나타냅니다. reproduce는 오류나 현상을 같은 조건에서 다시 발생시키는 뜻입니다. 발음: reproduce는 ‘리프로듀스’, cache는 ‘캐시’에 가깝습니다. 상황: 성능 문제가 특정 초기 상태나 데이터 조건에서만 발생한다고 보고할 때 씁니다.

### 3. 릴리스 범위 관리

**Let's keep this change out of the current release unless it becomes critical.**  
이 변경 사항이 반드시 필요해지지 않는 한 현재 릴리스에서는 제외합시다.

문법: keep A out of B는 ‘A를 B에서 제외하다’, unless는 ‘~하지 않는 한’입니다. becomes는 주어 it에 맞춘 3인칭 단수형입니다. 발음: current는 ‘커런트’, critical은 ‘크리티컬’에 가깝습니다. 상황: 위험하거나 필수적이지 않은 변경을 다음 릴리스로 미룰 때 씁니다.

### 4. 산정 근거 검토

**Could you review the assumptions behind this estimate?**  
이 산정의 근거가 된 전제들을 검토해 주실 수 있나요?

문법: Could you + 동사원형은 정중한 요청이며, behind는 여기서 ‘배경이나 근거가 되는’이라는 뜻입니다. 발음: assumptions는 ‘어섬프션즈’, estimate는 명사로 ‘에스터밋’에 가깝습니다. 상황: 일정이나 비용 산정이 어떤 전제에 기반했는지 검토를 요청할 때 씁니다.

### 5. 장애 회고 기록

**We'll document the root cause and the preventive actions in the incident report.**  
장애 보고서에 근본 원인과 예방 조치를 기록하겠습니다.

문법: document는 여기서 ‘문서로 기록하다’라는 동사이며, the root cause와 the preventive actions가 and로 병렬 연결됩니다. 발음: preventive는 ‘프리벤티브’, incident는 ‘인시던트’에 가깝습니다. 상황: 장애 대응 후 원인과 재발 방지 조치를 공식 기록으로 남길 때 씁니다.

## 구조화 데이터

```json
{
  "title": "실무 영어 5문장 — 요구사항 충돌·성능 재현·범위 관리·산정 검토·장애 회고",
  "summary": "요구사항의 우선순위 결정, 특정 조건의 성능 저하 재현, 릴리스 범위 통제, 일정 산정의 전제 검토, 장애 원인과 예방 조치 기록에 활용할 수 있는 실무 영어 5문장을 연습합니다.",
  "speakingSentence": "These two requirements conflict, so we need to decide which one takes precedence.",
  "speakingMeaning": "이 두 요구사항은 서로 충돌하므로 어느 쪽을 우선할지 결정해야 합니다.",
  "items": [
    {
      "prompt": "These two requirements conflict, so we need to decide which one takes precedence.",
      "answer": "이 두 요구사항은 서로 충돌하므로 어느 쪽을 우선할지 결정해야 합니다.",
      "explanation": "문법: conflict는 자동사로 ‘서로 충돌하다’, take precedence는 ‘우선하다’라는 뜻입니다. which one takes precedence는 decide의 목적어 역할을 하는 간접의문문입니다. 발음: requirements는 ‘리콰이어먼츠’, precedence는 ‘프레서던스’에 가깝습니다. 상황: 동시에 만족시키기 어려운 요구사항의 우선순위를 정할 때 씁니다."
    },
    {
      "prompt": "I can reproduce the slowdown only when the cache is empty.",
      "answer": "캐시가 비어 있을 때만 성능 저하를 재현할 수 있습니다.",
      "explanation": "문법: only when은 ‘~할 때만’이라는 제한 조건을 나타냅니다. reproduce는 오류나 현상을 같은 조건에서 다시 발생시키는 뜻입니다. 발음: reproduce는 ‘리프로듀스’, cache는 ‘캐시’에 가깝습니다. 상황: 성능 문제가 특정 초기 상태나 데이터 조건에서만 발생한다고 보고할 때 씁니다."
    },
    {
      "prompt": "Let's keep this change out of the current release unless it becomes critical.",
      "answer": "이 변경 사항이 반드시 필요해지지 않는 한 현재 릴리스에서는 제외합시다.",
      "explanation": "문법: keep A out of B는 ‘A를 B에서 제외하다’, unless는 ‘~하지 않는 한’입니다. becomes는 주어 it에 맞춘 3인칭 단수형입니다. 발음: current는 ‘커런트’, critical은 ‘크리티컬’에 가깝습니다. 상황: 위험하거나 필수적이지 않은 변경을 다음 릴리스로 미룰 때 씁니다."
    },
    {
      "prompt": "Could you review the assumptions behind this estimate?",
      "answer": "이 산정의 근거가 된 전제들을 검토해 주실 수 있나요?",
      "explanation": "문법: Could you + 동사원형은 정중한 요청이며, behind는 여기서 ‘배경이나 근거가 되는’이라는 뜻입니다. 발음: assumptions는 ‘어섬프션즈’, estimate는 명사로 ‘에스터밋’에 가깝습니다. 상황: 일정이나 비용 산정이 어떤 전제에 기반했는지 검토를 요청할 때 씁니다."
    },
    {
      "prompt": "We'll document the root cause and the preventive actions in the incident report.",
      "answer": "장애 보고서에 근본 원인과 예방 조치를 기록하겠습니다.",
      "explanation": "문법: document는 여기서 ‘문서로 기록하다’라는 동사이며, the root cause와 the preventive actions가 and로 병렬 연결됩니다. 발음: preventive는 ‘프리벤티브’, incident는 ‘인시던트’에 가깝습니다. 상황: 장애 대응 후 원인과 재발 방지 조치를 공식 기록으로 남길 때 씁니다."
    }
  ]
}
```