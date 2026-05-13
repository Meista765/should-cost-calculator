import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFullDb } from '../parseMarkdown';
import {
  calcBend,
  calcClean,
  calcLaser,
  calcMaterial,
  calcNct,
  calcPaint,
  calcTransport,
  calcWeld,
} from '../calcSheet';
import { computeBreakdown } from '../calc';
import { cutMaterialKey, lookupThk, lookupThkIndex } from '../lookup';
import { emptyForm } from '../../state/formReducer';
import type { Db, UnifiedFormSlice } from '../../types/domain';

const ROOT = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const db: Db = buildFullDb({
  coil: read('Data/Material/steel coil cost.md'),
  gravity: read('Data/Material/steel specific gravity.md'),
  press: read('Data/Machine/press machine working cost.md'),
  worker: read('Data/Men/worker cost.md'),
  cutSpeed: read('Data/Sheet/cut_speed.md'),
  pierceTime: read('Data/Sheet/pierce_time.md'),
  bendTime: read('Data/Sheet/bend_time.md'),
  nctFeat: read('Data/Sheet/nct_feat.md'),
  weldSpeed: read('Data/Sheet/weld_speed.md'),
  cleanMatrix: read('Data/Sheet/clean_matrix.md'),
  freight: read('Data/Sheet/freight.md'),
  ownVehicle: read('Data/Sheet/own_vehicle.md'),
  processRates: read('Data/Sheet/process_rates.md'),
  paint: read('Data/Sheet/paint.md'),
  assumptions: read('Data/Sheet/assumptions.md'),
});

describe('lookup helpers', () => {
  it('lookupThk("가까운 큰 값")', () => {
    expect(lookupThk(0.7)).toBe(0.8);
    expect(lookupThk(1.0)).toBe(1.0);
    expect(lookupThk(15)).toBe(12.0);
  });
  it('lookupThkIndex', () => {
    expect(lookupThkIndex(2.0)).toBe(7);
  });
  it('cutMaterialKey STS304L → SUS304', () => {
    expect(cutMaterialKey('STS304L', db)).toBe('SUS304');
  });
  it('cutMaterialKey STS304 → SUS304 (등록 강종)', () => {
    expect(cutMaterialKey('STS304', db)).toBe('SUS304');
  });
});

// calc.py: SAMPLE_INPUT (계산기 v10 self-test 입력) — Sheet 공법
const SAMPLE: UnifiedFormSlice = {
  ...emptyForm(),
  processMethod: 'sheet',
  scrapRecovery: 0.9,
  material: 'STS304',
  thkMm: 2.0,
  xMm: 200,
  yMm: 150,
  volMm3: 50000,
  perimeterMm: 900,
  pierceN: 6,
  bendN: 2,
  batchQty: 100,
  postCostRows: [],
  priceOverride: true,
  matPrice: 4500,
  scrapPrice: 2500,
  transMethod: '용달',
  transTon: '1톤 카고',
  transKm: 80,
  transRound: true,
  transLoad: 100,
  nctRows: [
    { method: 'Embossing', count: 4 },
    { method: 'Burring', count: 2 },
    { method: 'Louver', count: 4 },
    { method: 'Tap', tapSize: 'M5', count: 4 },
  ],
  cleanUse: true,
  cleanN: 4,
  weldKind: 'CO2',
  weldLenMm: 200,
  weldSpots: 0,
  weldPosFactor: 1,
  paintUse: true,
  paintAreaMm2: 100000,
  paintThkUm: 70,
  paintPricePerKg: 8000,
  paintTimeMin: 1,
};

describe('calc.py SAMPLE-001 일치성 (±0.5 KRW 허용)', () => {
  const mat = calcMaterial(SAMPLE, db);
  const laser = calcLaser(SAMPLE, db);
  const bend = calcBend(SAMPLE, db, db.assumptions.setupMin);
  const trans = calcTransport(SAMPLE, db);
  const nct = calcNct(SAMPLE, db, db.assumptions.setupMin);
  const clean = calcClean(SAMPLE, db, mat);
  const weld = calcWeld(SAMPLE, db);
  const paint = calcPaint(SAMPLE, db);
  const r = computeBreakdown(SAMPLE, db);

  it('원소재중량 ≈ 0.4758 kg', () => expect(mat.orderKg).toBeCloseTo(0.4758, 4));
  it('순중량 ≈ 0.3965 kg', () => expect(mat.netKg).toBeCloseTo(0.3965, 4));
  it('순재료비 ≈ 1942.85 원', () => expect(mat.netMatCost).toBeCloseTo(1942.85, 1));
  it('레이저 ≈ 274.83 원', () => expect(laser.laserCost).toBeCloseTo(274.83, 0));
  it('벤딩 ≈ 521.86 원', () => expect(bend.bendCost).toBeCloseTo(521.86, 0));
  it('운반/EA ≈ 1968 원', () => expect(trans.perEa).toBeCloseTo(1968, 0));
  it('NCT/EA ≈ 402.94 원', () => expect(nct.perEa).toBeCloseTo(402.94, 0));
  it('세척/EA ≈ 198.25 원', () => expect(clean.perEa).toBeCloseTo(198.25, 0));
  it('용접/EA ≈ 297.60 원', () => expect(weld.perEa).toBeCloseTo(297.60, 0));
  // paint.md 도료비중 갱신(1.5→1.6) 반영. paint 변동분이 direct/overhead/profit/should 에 누적.
  it('도장/EA ≈ 1153.79 원', () => expect(paint.perEa).toBeCloseTo(1153.79, 0));
  it('직접비 ≈ 6760.13 원', () => expect(r.directCost!).toBeCloseTo(6760.13, 0));
  it('간접비 ≈ 1216.82 원', () => expect(r.overheadCost!).toBeCloseTo(1216.82, 0));
  it('이윤 ≈ 797.70 원', () => expect(r.profitCost!).toBeCloseTo(797.70, 0));
  it('should-cost ≈ 8774.65 원', () => expect(r.shouldCost!).toBeCloseTo(8774.65, 0));
});

describe('적용 플래그 OFF 시 비용 0 (Foldable 카드 접힘 상태)', () => {
  const mat = calcMaterial(SAMPLE, db);

  it('세척: cleanUse=false → 0', () => {
    expect(calcClean({ ...SAMPLE, cleanUse: false }, db, mat).perEa).toBe(0);
  });
  it('세척: cleanUse=true 이지만 cleanN 미선택 → 0', () => {
    expect(calcClean({ ...SAMPLE, cleanUse: true, cleanN: undefined }, db, mat).perEa).toBe(0);
  });
  it('용접: weldKind="" → 0', () => {
    expect(calcWeld({ ...SAMPLE, weldKind: '' }, db).perEa).toBe(0);
  });
  it('분체 도장: paintUse=false → 0', () => {
    expect(calcPaint({ ...SAMPLE, paintUse: false }, db).perEa).toBe(0);
  });
});

describe('calcTransport 적재 계층', () => {
  const base: UnifiedFormSlice = {
    ...emptyForm(),
    material: 'STS304',
    thkMm: 2.0,
    xMm: 200,
    yMm: 150,
    volMm3: 50000,
    batchQty: 100,
    priceOverride: true,
    matPrice: 4500,
    scrapPrice: 2500,
    transMethod: '용달',
    transTon: '5톤 카고',
    transKm: 80,
    transRound: true,
  };

  it('계층 3개 모두 입력 → hierarchyLoad 사용 (loadSource=hierarchy)', () => {
    const t = calcTransport(
      { ...base, transEaPerBox: 50, transBoxPerPallet: 12, transPalletPerCar: 6, transLoad: 999 },
      db,
    );
    expect(t.loadSource).toBe('hierarchy');
    expect(t.effectiveLoad).toBe(50 * 12 * 6);
    expect(t.boxesPerTrip).toBe(12 * 6);
    expect(t.trips).toBe(1);
  });

  it('계층 일부만 입력 → transLoad 직접 사용 (loadSource=direct)', () => {
    const t = calcTransport(
      { ...base, transEaPerBox: 50, transBoxPerPallet: 12, transLoad: 100 },
      db,
    );
    expect(t.loadSource).toBe('direct');
    expect(t.effectiveLoad).toBe(100);
  });

  it('박스 무게 × 박스수가 freight maxKg 초과 → overWeight=true & warning', () => {
    const t = calcTransport(
      {
        ...base,
        transEaPerBox: 50,
        transBoxPerPallet: 12,
        transPalletPerCar: 6,
        transBoxWeightKg: 10, // 72박스 × 10kg = 720kg → 5톤(5000kg) 미만 → 정상
      },
      db,
    );
    expect(t.overWeight).toBe(false);
    const t2 = calcTransport(
      {
        ...base,
        transEaPerBox: 50,
        transBoxPerPallet: 12,
        transPalletPerCar: 6,
        transBoxWeightKg: 100, // 72박스 × 100kg = 7200kg → 5000kg 초과
      },
      db,
    );
    expect(t2.overWeight).toBe(true);
    const br = computeBreakdown(
      {
        ...base,
        transEaPerBox: 50,
        transBoxPerPallet: 12,
        transPalletPerCar: 6,
        transBoxWeightKg: 100,
      },
      db,
    );
    expect(br.warnings.some((w) => w.includes('적재 무게'))).toBe(true);
  });

  it('계층 미입력 + transLoad만 → 기존 동작 (회귀)', () => {
    const t = calcTransport({ ...base, transLoad: 100 }, db);
    expect(t.loadSource).toBe('direct');
    expect(t.effectiveLoad).toBe(100);
    expect(t.trips).toBe(1);
  });

  it('방식 미적용 → zero (loadSource는 입력에 따름)', () => {
    const t = calcTransport({ ...base, transMethod: undefined, transLoad: 100 }, db);
    expect(t.perTrip).toBe(0);
    expect(t.trips).toBe(0);
  });
});

describe('priceOverride 토글', () => {
  const baseInput: UnifiedFormSlice = {
    ...emptyForm(),
    processMethod: 'sheet',
    material: 'STS304',
    thkMm: 2.0,
    xMm: 200,
    yMm: 150,
    scrapRecovery: 0.9,
  };

  it('OFF: 사용자 단가는 무시되고 coil DB 자동조회가 사용된다', () => {
    const off = calcMaterial(
      { ...baseInput, priceOverride: false, matPrice: 9999, scrapPrice: 9999 },
      db,
    );
    const lookup = calcMaterial({ ...baseInput, priceOverride: false }, db);
    expect(off.matPrice).toBe(lookup.matPrice);
    expect(off.scrapPrice).toBe(lookup.scrapPrice);
    expect(off.matPrice).not.toBe(9999);
  });

  it('ON: 사용자 단가가 그대로 사용된다', () => {
    const on = calcMaterial(
      { ...baseInput, priceOverride: true, matPrice: 3300, scrapPrice: 1100 },
      db,
    );
    expect(on.matPrice).toBe(3300);
    expect(on.scrapPrice).toBe(1100);
  });

  it('ON + 단가 0: 0원이 그대로 적용되어 재료비도 0이 된다', () => {
    const zero = calcMaterial(
      { ...baseInput, priceOverride: true, matPrice: 0, scrapPrice: 0 },
      db,
    );
    expect(zero.matPrice).toBe(0);
    expect(zero.scrapPrice).toBe(0);
    expect(zero.netMatCost).toBe(0);
  });
});

describe('체적 미입력 시 보수적 상한 처리', () => {
  const noVol: UnifiedFormSlice = { ...SAMPLE, volMm3: 0 };
  const mat = calcMaterial(noVol, db);

  it('volumeMissing 플래그가 켜진다', () => {
    expect(mat.volumeMissing).toBe(true);
  });
  it('netKg 가 orderKg 와 동일 (상한값)', () => {
    expect(mat.netKg).toBeCloseTo(mat.orderKg, 6);
  });
  it('scrapKg 는 0', () => {
    expect(mat.scrapKg).toBe(0);
  });
  it('netMatCost = orderKg × matPrice (스크랩 미반영)', () => {
    expect(mat.netMatCost).toBeCloseTo(mat.orderKg * mat.matPrice, 4);
  });
  it('청소비는 0 (체적 미입력 시 계산 불가)', () => {
    const clean = calcClean({ ...noVol, cleanUse: true, cleanN: 4 }, db, mat);
    expect(clean.perEa).toBe(0);
  });
});

describe('체적 입력 시 volumeMissing=false', () => {
  it('정상 입력 시 플래그가 꺼지고 기존 공식이 적용된다', () => {
    const mat = calcMaterial(SAMPLE, db);
    expect(mat.volumeMissing).toBe(false);
    expect(mat.netKg).toBeCloseTo(0.3965, 4);
  });
});
