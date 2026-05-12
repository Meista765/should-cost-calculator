import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeBreakdown } from '../calc';
import { interpolateCoilPrice } from '../lookup';
import { buildDb } from '../parseMarkdown';
import { emptyForm } from '../../state/formReducer';
import type { Db, PressKind, UnifiedFormSlice } from '../../types/domain';

const ROOT = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const db: Db = buildDb({
  coil: read('Data/Material/steel coil cost.md'),
  gravity: read('Data/Material/steel specific gravity.md'),
  press: read('Data/Machine/press machine working cost.md'),
  worker: read('Data/Men/worker cost.md'),
});

const baseProcess = (kind: PressKind, tonnage: number, uph: number) => ({
  kind,
  tonnage,
  uph,
  workerRole: '절단원',
});

describe('computeBreakdown — Press: SPCC 1.0t, 단발 50t (절단원), UPH 180', () => {
  const input: UnifiedFormSlice = {
    ...emptyForm(),
    processMethod: 'press',
    material: 'SPCC',
    thkMm: 1.0,
    xMm: 100,
    yMm: 50,
    volMm3: 3000,
    scrapRecovery: 0.9,
    pressProcessCount: 1,
    pressProcesses: [baseProcess('단발', 50, 180)],
  };
  const r = computeBreakdown(input, db);

  it('원소재 중량 ≈ 0.03925 kg', () => expect(r.rawWeightKg).toBeCloseTo(0.03925, 5));
  it('제품 중량 ≈ 0.02355 kg', () => expect(r.partWeightKg).toBeCloseTo(0.02355, 5));
  it('스크랩 중량 ≈ 0.01413 kg', () => expect(r.scrapWeightKg).toBeCloseTo(0.01413, 5));
  it('재료비 ≈ 28.01 원/EA (coil DB 자동 조회)', () => expect(r.materialCost).toBeCloseTo(28.01, 1));
  it('가공비 ≈ 135.74 원/EA', () => expect(r.processCost).toBeCloseTo(135.74, 1));
  it('재료비+가공비 ≈ 163.75 원/EA', () =>
    expect(r.materialCost + r.processCost).toBeCloseTo(163.75, 1));
});

describe('computeBreakdown — Press: STS304 1.5t, 공정 없음', () => {
  const input: UnifiedFormSlice = {
    ...emptyForm(),
    processMethod: 'press',
    material: 'STS304',
    thkMm: 1.5,
    xMm: 200,
    yMm: 100,
    volMm3: 8000,
    scrapRecovery: 0.9,
    pressProcessCount: 0,
    pressProcesses: [],
  };
  const r = computeBreakdown(input, db);

  it('원소재 중량 ≈ 0.2379 kg', () => expect(r.rawWeightKg).toBeCloseTo(0.2379, 4));
  it('제품 중량 ≈ 0.06344 kg', () => expect(r.partWeightKg).toBeCloseTo(0.06344, 4));
  it('재료비 ≈ 529.92 원/EA', () => expect(r.materialCost).toBeCloseTo(529.92, 1));
});

describe('interpolateCoilPrice', () => {
  it('STS304 1.8 → interpolate, 3270원', () => {
    const r = interpolateCoilPrice('STS304', 1.8, db);
    expect(r.method).toBe('interpolate');
    if (r.method === 'interpolate') {
      expect(r.coilPrice).toBeCloseTo(3270, 0);
      expect(r.warning).toBeTruthy();
    }
  });

  it('STS304 5.0 → unavailable (out-of-range)', () => {
    const r = interpolateCoilPrice('STS304', 5.0, db);
    expect(r.method).toBe('unavailable');
    if (r.method === 'unavailable') {
      expect(r.reason).toBe('out-of-range');
    }
  });

  it('SA240304 5.0 → exact', () => {
    const r = interpolateCoilPrice('SA240304', 5.0, db);
    expect(r.method).toBe('exact');
    if (r.method === 'exact') {
      expect(r.coilPrice).toBe(3250);
    }
  });

  it('SPCC 1.0 → exact 863원', () => {
    const r = interpolateCoilPrice('SPCC', 1.0, db);
    expect(r.method).toBe('exact');
    if (r.method === 'exact') expect(r.coilPrice).toBe(863);
  });
});
