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
  scrapRecovery: 1,
  material: 'STS304',
  thkMm: 2.0,
  xMm: 200,
  yMm: 150,
  volMm3: 50000,
  perimeterMm: 900,
  pierceN: 6,
  bendN: 2,
  batchQty: 100,
  postCostEa: 0,
  matPrice: 4500,
  scrapPrice: 2500,
  transMethod: '용달',
  transTon: '1톤 카고',
  transKm: 80,
  transRound: true,
  transLoad: 100,
  transNight: 0,
  nctEm: 4,
  nctBur: 2,
  nctTap: 4,
  nctLou: 4,
  nctTapSize: 'M5',
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

  it('발주중량 ≈ 0.4758 kg', () => expect(mat.orderKg).toBeCloseTo(0.4758, 4));
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
