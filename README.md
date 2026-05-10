# Should-Cost Calculator

판금 프레스 3D 설계 변경에 따른 가격 AS-IS / TO-BE 계산기.
React + Vite + TypeScript SPA, GitHub Pages에 정적 배포된다.

## 기술 스택 / 실행

- **런타임**: React 18, TypeScript 5, Vite 5
- **테스트**: Vitest (Node 환경)

```bash
npm install
npm run encrypt:data   # Data/*.md → src/data/encrypted.json (BUILD_DB_PASSWORD 필요)
npm run dev            # 로컬 개발 서버
npm run build          # tsc -b && vite build
npm test               # vitest run (로컬 전용, Data/*.md 필요)
```
## 입력 항목

### 사용자 입력
- **원소재**: 폭(mm), 피치(mm), 두께(mm), 스크랩 회수율(%, 기본 90%)
- **제품**: 너비/길이/높이(mm), 표면적(mm²), 체적(mm³)
- **설비**: 총 공정 수(1~20, 기본 1), 시간당 생산 수량(UPH, 프로 기본 720, 단발 기본 180)

### DB 조회
- **원소재**: 강종(드롭다운), 비중(g/cm³), 원코일 KG당 가격(KRW/kg), 스크랩 KG당 가격(KRW/kg)
- **설비**: 구분(프로/단발), 톤수, 설비임율(KRW/hr), 노무임율(KRW/hr) — 기본 직종은 절단원

## 계산식

```
원소재 중량(kg) = 폭 × 피치 × 두께 × 비중 / 10⁶
제품 중량(kg)   = 체적 × 비중 / 10⁶
스크랩 중량(kg) = max(0, (원소재 중량 − 제품 중량)) × 스크랩 회수율
재료비(KRW/EA)  = 원소재 중량 × 원코일 단가 − 스크랩 중량 × 스크랩 단가
공정 1건(KRW/EA) = (설비임율 + 노무임율) / UPH
가공비(KRW/EA)   = Σ 공정 1건
총원가(KRW/EA)   = 재료비 + 가공비
```

해당 두께가 DB에 없으면 동일 강종 내에서 선형 보간하고, 보간한 결과는 UI에 "보간 추정" 배지로 표시한다.

## UI 구성

- **AsIsForm + ResultsPanel** — AS-IS 입력과 단가 분해 결과(중량/재료비/가공비/총원가).
- **CaseOneSimulator** — AS-IS 입력만으로 자동 시뮬레이션.
  - ① 동일 강종에서 두께 변경: 체적은 V₀ / t₀ × t로 보정.
  - ② 동일 두께에서 강종 변경: 재료비/가공비/총원가 비교 + AS-IS 대비 증감 배지.
- **CaseTwoComparison** — 옵션. TO-BE 사양을 직접 입력했을 때 재료비·가공비 변화량을 분리 표시.