// 통합 should-cost 계산 엔진.
// 재질·치수·세척·용접·도장·운반·관리비/이윤은 공용으로 계산하고,
// 가공(공법) 영역만 processMethod 에 따라 press / sheet 로 분기한다.
import type {
  CostBreakdown,
  Db,
  ProcessInput,
  UnifiedFormSlice,
} from '../types/domain';
import { lookupPressRate, lookupWorkerRate } from './lookup';
import {
  calcBend,
  calcClean,
  calcLaser,
  calcMaterial,
  calcNct,
  calcPaint,
  calcTransport,
  calcWeld,
  resolveMaterial,
  setupMinFromDb,
} from './calcSheet';
import { applyMarginOverhead } from './applyMargin';

export function calcOneProcessCost(
  machineRate: number,
  workerRate: number,
  uph: number,
): number {
  if (!Number.isFinite(uph) || uph <= 0) return Number.NaN;
  return (machineRate + workerRate) / uph;
}

export function calcPressProcessCost(rows: ProcessInput[], db: Db): {
  total: number;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  let total = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const machine = lookupPressRate(row.kind, row.tonnage, db);
    const worker = lookupWorkerRate(row.workerRole, db);
    const uph = row.uph;
    if (!Number.isFinite(uph) || uph == null || uph <= 0) {
      errors.push(`공정 ${i + 1}: UPH는 0보다 큰 값이어야 합니다.`);
      continue;
    }
    if (machine === undefined) {
      warnings.push(`공정 ${i + 1}: ${row.kind} ${row.tonnage}톤 설비임율 정보 없음`);
      continue;
    }
    if (worker === undefined) {
      warnings.push(`공정 ${i + 1}: ${row.workerRole} 노무임율 정보 없음`);
      continue;
    }
    total += calcOneProcessCost(machine, worker, uph);
  }
  return { total, warnings, errors };
}

export function computeBreakdown(input: UnifiedFormSlice, db: Db): CostBreakdown {
  const warnings: string[] = [];
  const errors: string[] = [];
  const empty: CostBreakdown = {
    rawWeightKg: 0,
    partWeightKg: 0,
    scrapWeightKg: 0,
    materialCost: 0,
    processCost: 0,
    totalCost: 0,
    warnings,
    errors,
  };

  // 1) 재질·두께 필수
  if (!input.material || input.thkMm == null || input.thkMm <= 0) {
    return {
      ...empty,
      unavailable: { reason: 'missing-input', message: '재질과 두께를 입력하세요.' },
    };
  }
  const matMeta = resolveMaterial(input.material, db);
  if (!matMeta) {
    return {
      ...empty,
      unavailable: { reason: 'no-grade', message: `${input.material} 재질 정보가 없습니다.` },
    };
  }

  // 2) scrapRecovery 범위
  if (input.scrapRecovery != null && (input.scrapRecovery < 0 || input.scrapRecovery > 1)) {
    return {
      ...empty,
      unavailable: { reason: 'missing-input', message: '스크랩 회수율은 0~100% 범위여야 합니다.' },
    };
  }

  // 3) 재료 계산
  const mat = calcMaterial(input, db);
  if (!Number.isFinite(mat.orderKg) || !Number.isFinite(mat.netKg)) {
    return {
      ...empty,
      unavailable: { reason: 'missing-input', message: '입력 값이 너무 커서 계산할 수 없습니다.' },
    };
  }
  if (mat.priceWarning) warnings.push(mat.priceWarning);
  if ((input.matPrice == null || input.matPrice <= 0) && mat.matPrice <= 0) {
    warnings.push('재료 단가가 없습니다. 단가 입력 또는 코일 DB 등록이 필요합니다.');
  }
  if (mat.orderKg > 0 && mat.orderKg < mat.netKg) {
    errors.push(
      `원소재 중량(${mat.orderKg.toFixed(4)} kg)이 제품 중량(${mat.netKg.toFixed(4)} kg)보다 작습니다. 가로·세로·두께 또는 체적을 확인하세요.`,
    );
  }

  const setupMin = setupMinFromDb(db);

  // 4) 공법별 가공비
  let pressTotal = 0;
  let laserCost = 0;
  let bendCost = 0;
  let nctEa = 0;
  if (input.processMethod === 'press') {
    const proc = calcPressProcessCost(input.pressProcesses, db);
    warnings.push(...proc.warnings);
    errors.push(...proc.errors);
    pressTotal = proc.total;
  } else {
    const laser = calcLaser(input, db);
    const bend = calcBend(input, db, setupMin);
    const nct = calcNct(input, db, setupMin);
    laserCost = laser.laserCost;
    bendCost = bend.bendCost;
    nctEa = nct.perEa;
  }

  // 5) 공용 라인아이템
  const clean = calcClean(input, db, mat);
  const weld = calcWeld(input, db);
  const paint = calcPaint(input, db);
  const trans = calcTransport(input, db);
  const postEa = input.postCostEa ?? 0;

  const processCost =
    pressTotal + laserCost + bendCost + nctEa + clean.perEa + weld.perEa + paint.perEa;
  const totalCost = mat.netMatCost + processCost;
  const direct = totalCost + trans.perEa + postEa;

  if (!Number.isFinite(direct)) {
    return {
      ...empty,
      unavailable: { reason: 'missing-input', message: '입력 값이 너무 커서 계산할 수 없습니다.' },
    };
  }

  // 6) 일반관리비 · 이윤 → should-cost + 견적 비교
  const margin = applyMarginOverhead({
    direct,
    assumptions: db.assumptions,
    overrides: {
      overheadRate: input.overheadRateOverride,
      marginRate: input.marginRateOverride,
    },
    quotePerEa: input.quotePerEa,
  });

  return {
    rawWeightKg: mat.orderKg,
    partWeightKg: mat.netKg,
    scrapWeightKg: mat.scrapKg,
    materialCost: mat.netMatCost,
    processCost,
    totalCost,
    warnings,
    errors,
    laserCost: input.processMethod === 'sheet' ? laserCost : undefined,
    bendCost: input.processMethod === 'sheet' ? bendCost : undefined,
    nctCost: input.processMethod === 'sheet' ? nctEa : undefined,
    cleanCost: clean.perEa,
    weldCost: weld.perEa,
    paintCost: paint.perEa,
    transportCost: trans.perEa,
    postCost: postEa,
    directCost: direct,
    overheadCost: margin.overheadCost,
    profitCost: margin.profitCost,
    shouldCost: margin.shouldCost,
    appliedOverheadRate: margin.appliedOverheadRate,
    appliedMarginRate: margin.appliedMarginRate,
    quotePerEa: input.quotePerEa,
    verdict: margin.verdict,
    diff: margin.diff,
    diffPct: margin.diffPct,
  };
}
