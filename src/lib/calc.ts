// 순수 계산 함수. README의 공식을 그대로 따른다.
import type {
  CostBreakdown,
  Db,
  FormSlice,
  ProcessInput,
} from '../types/domain';
import {
  interpolateCoilPrice,
  lookupGravity,
  lookupPressRate,
  lookupWorkerRate,
} from './lookup';

export function calcRawWeight(
  width: number,
  pitch: number,
  thickness: number,
  gravity: number,
): number {
  return (width * pitch * thickness * gravity) / 1e6;
}

export function calcPartWeight(volumeMm3: number, gravity: number): number {
  return (volumeMm3 * gravity) / 1e6;
}

export function calcScrapWeight(
  rawKg: number,
  partKg: number,
  recovery: number,
): number {
  return Math.max(0, (rawKg - partKg) * recovery);
}

export function calcMaterialCost(
  rawKg: number,
  coilPrice: number,
  scrapKg: number,
  scrapPrice: number,
): number {
  return rawKg * coilPrice - scrapKg * scrapPrice;
}

export function calcOneProcessCost(
  machineRate: number,
  workerRate: number,
  uph: number,
): number {
  if (uph <= 0) return Number.NaN;
  return (machineRate + workerRate) / uph;
}

export function calcProcessCost(rows: ProcessInput[], db: Db): {
  total: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  let total = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const machine = lookupPressRate(row.kind, row.tonnage, db);
    const worker = lookupWorkerRate(row.workerRole, db);
    if (machine === undefined) {
      warnings.push(`공정 ${i + 1}: ${row.kind} ${row.tonnage}톤 설비임율 정보 없음`);
      continue;
    }
    if (worker === undefined) {
      warnings.push(`공정 ${i + 1}: ${row.workerRole} 노무임율 정보 없음`);
      continue;
    }
    total += calcOneProcessCost(machine, worker, row.uph);
  }
  return { total, warnings };
}

export function computeBreakdown(input: FormSlice, db: Db): CostBreakdown {
  const warnings: string[] = [];
  const empty: CostBreakdown = {
    rawWeightKg: 0,
    partWeightKg: 0,
    scrapWeightKg: 0,
    materialCost: 0,
    processCost: 0,
    totalCost: 0,
    warnings,
  };

  if (
    input.width == null ||
    input.pitch == null ||
    input.thickness == null ||
    input.partVolume == null ||
    !input.grade
  ) {
    return {
      ...empty,
      unavailable: { reason: 'missing-input', message: '재료비 계산을 위해 폭/피치/두께/체적/강종을 입력하세요.' },
    };
  }

  const gravityInfo = lookupGravity(input.grade, db);
  if (!gravityInfo) {
    return {
      ...empty,
      unavailable: { reason: 'no-grade', message: `${input.grade} 강종의 비중 정보가 없습니다.` },
    };
  }
  if (gravityInfo.warning) warnings.push(gravityInfo.warning);

  const priceInfo = interpolateCoilPrice(input.grade, input.thickness, db);
  if (priceInfo.method === 'unavailable') {
    const reason = priceInfo.reason;
    const msg =
      reason === 'no-grade'
        ? `${input.grade} 가격 정보가 없습니다.`
        : `${input.grade} ${input.thickness}t는 등록된 두께 범위를 벗어나 가격 산정 불가합니다.`;
    return {
      ...empty,
      unavailable: { reason, message: msg },
    };
  }
  if (priceInfo.warning) warnings.push(priceInfo.warning);

  const rawWeightKg = calcRawWeight(
    input.width,
    input.pitch,
    input.thickness,
    gravityInfo.gravity,
  );
  const partWeightKg = calcPartWeight(input.partVolume, gravityInfo.gravity);
  const scrapWeightKg = calcScrapWeight(rawWeightKg, partWeightKg, input.scrapRecovery);
  const materialCost = calcMaterialCost(
    rawWeightKg,
    priceInfo.coilPrice,
    scrapWeightKg,
    priceInfo.scrapPrice,
  );

  const proc = calcProcessCost(input.processes, db);
  warnings.push(...proc.warnings);

  return {
    rawWeightKg,
    partWeightKg,
    scrapWeightKg,
    materialCost,
    processCost: proc.total,
    totalCost: materialCost + proc.total,
    warnings,
  };
}
