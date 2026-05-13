// 통합 should-cost 계산 엔진.
// 재질·치수·세척·용접·도장·운반·관리비/이윤은 공용으로 계산하고,
// 가공(공법) 영역만 processMethod 에 따라 press / sheet 로 분기한다.
import type {
  BendDetail,
  CleanDetail,
  CostBreakdown,
  Db,
  LaserDetail,
  MarginDetail,
  MaterialDetail,
  NctDetail,
  NctMethod,
  NctShapeTotal,
  NctTapTotal,
  PaintDetail,
  PressDetail,
  PressRowDetail,
  ProcessInput,
  ProcessRateKey,
  UnifiedFormSlice,
  WeldDetail,
  WeldKind,
} from '../types/domain';
import {
  lookupPressRate,
  lookupProcessRate,
  lookupWeldSpeed,
  lookupWorkerRate,
} from './lookup';
import {
  calcBend,
  calcClean,
  calcLaser,
  calcMaterial,
  calcNct,
  calcPaint,
  calcTransport,
  calcWeld,
  NCT_SHAPE_NAME,
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
  rows: PressRowDetail[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  const details: PressRowDetail[] = [];
  let total = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const machine = lookupPressRate(row.kind, row.tonnage, db);
    const worker = lookupWorkerRate(row.workerRole, db);
    const uph = row.uph;
    const base = {
      index: i,
      kind: row.kind,
      tonnage: row.tonnage,
      uph,
      machineRate: machine,
      workerRate: worker,
      workerRole: row.workerRole,
    };
    if (!Number.isFinite(uph) || uph == null || uph <= 0) {
      errors.push(`공정 ${i + 1}: UPH는 0보다 큰 값이어야 합니다.`);
      details.push({ ...base, perEa: 0, ok: false, reason: 'UPH 미입력' });
      continue;
    }
    if (machine === undefined) {
      warnings.push(`공정 ${i + 1}: ${row.kind} ${row.tonnage}톤 설비임율 정보 없음`);
      details.push({ ...base, perEa: 0, ok: false, reason: '설비요율 없음' });
      continue;
    }
    if (worker === undefined) {
      warnings.push(`공정 ${i + 1}: ${row.workerRole} 노무임율 정보 없음`);
      details.push({ ...base, perEa: 0, ok: false, reason: '노무요율 없음' });
      continue;
    }
    const perEa = calcOneProcessCost(machine, worker, uph);
    total += perEa;
    details.push({ ...base, perEa, ok: true });
  }
  return { total, warnings, errors, rows: details };
}

export function computeBreakdown(input: UnifiedFormSlice, db: Db): CostBreakdown {
  const warnings: string[] = [];
  const errors: string[] = [];

  // 프레스 가공비는 재료 사양과 독립적이다 — 재료 미입력으로 unavailable
  // 상태여도 공정별 미리보기는 계산되어야 한다.
  let pressTotal = 0;
  let pressDetail: PressDetail | undefined;
  if (input.processMethod === 'press') {
    const proc = calcPressProcessCost(input.pressProcesses, db);
    pressTotal = proc.total;
    pressDetail = { rows: proc.rows, total: proc.total };
    warnings.push(...proc.warnings);
    errors.push(...proc.errors);
  }

  const empty: CostBreakdown = {
    rawWeightKg: 0,
    partWeightKg: 0,
    scrapWeightKg: 0,
    materialCost: 0,
    processCost: 0,
    totalCost: 0,
    warnings,
    errors,
    pressDetail,
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

  // 4) 공법별 가공비 — 프레스는 상단에서 이미 계산됨 (재료 독립)
  let laserCost = 0;
  let bendCost = 0;
  let nctEa = 0;
  let laserDetail: LaserDetail | undefined;
  let bendDetail: BendDetail | undefined;
  let nctDetail: NctDetail | undefined;
  if (input.processMethod !== 'press') {
    const laser = calcLaser(input, db);
    const bend = calcBend(input, db, setupMin);
    const nct = calcNct(input, db, setupMin);
    laserCost = laser.laserCost;
    bendCost = bend.bendCost;
    nctEa = nct.perEa;

    const laserRateKey: ProcessRateKey =
      (input.thkMm ?? 0) > 6 ? '레이저절단_6kW' : '레이저절단_4kW';
    laserDetail = {
      cutSpeed: laser.cutSpeed,
      pierceSec: laser.pierceSec,
      cutMin: laser.cutMin,
      laserCost: laser.laserCost,
      rate: lookupProcessRate(laserRateKey, db),
      rateKey: laserRateKey,
      perimeterMm: input.perimeterMm ?? 0,
      pierceN: input.pierceN ?? 0,
    };
    bendDetail = {
      bendSec: bend.bendSec,
      bendMin: bend.bendMin,
      bendCost: bend.bendCost,
      rate: lookupProcessRate('벤딩_프레스브레이크', db),
      bendN: input.bendN ?? 0,
      setupMin,
      batchQty: input.batchQty ?? 0,
    };
    const rows = input.nctRows ?? [];
    const shapeSec = (name: string) =>
      db.nctFeat.shapes.find((s) => s.shape === name)?.sec ?? 0;
    const tapSec = (size: string) =>
      db.nctFeat.tap.find((t) => t.size === size)?.sec ?? 0;

    const shapeCounts = new Map<Exclude<NctMethod, 'Tap'>, number>();
    const tapCounts = new Map<string, number>();
    for (const r of rows) {
      const n = r.count ?? 0;
      if (n <= 0) continue;
      if (r.method === 'Tap') {
        if (!r.tapSize) continue;
        tapCounts.set(r.tapSize, (tapCounts.get(r.tapSize) ?? 0) + n);
      } else {
        shapeCounts.set(r.method, (shapeCounts.get(r.method) ?? 0) + n);
      }
    }
    const shapeTotals: NctShapeTotal[] = [];
    for (const [method, count] of shapeCounts) {
      const shape = NCT_SHAPE_NAME[method];
      const sec = shapeSec(shape);
      shapeTotals.push({ method, shape, count, sec, totalSec: count * sec });
    }
    const tapTotals: NctTapTotal[] = [];
    for (const [size, count] of tapCounts) {
      const sec = tapSec(size);
      tapTotals.push({ size, count, sec, totalSec: count * sec });
    }
    nctDetail = {
      featSec: nct.featSec,
      nctMin: nct.nctMin,
      nctCostBatch: nct.nctCostBatch,
      perEa: nct.perEa,
      rate: lookupProcessRate('NCT_펀치프레스', db),
      setupMin,
      batchQty: input.batchQty ?? 0,
      shapeTotals,
      tapTotals,
    };
  }

  // 5) 공용 라인아이템
  const clean = calcClean(input, db, mat);
  const weld = calcWeld(input, db);
  const paint = calcPaint(input, db);
  const trans = calcTransport(input, db);
  if (trans.overWeight && trans.kgPerTrip != null && trans.maxKg != null) {
    warnings.push(
      `회당 적재 무게 ${trans.kgPerTrip.toLocaleString()}kg가 ${input.transTon ?? '선택 차량'} 한계 ${trans.maxKg.toLocaleString()}kg를 초과합니다.`,
    );
  }
  if (trans.overVolume && trans.m3PerTrip != null && trans.maxM3 != null) {
    warnings.push(
      `회당 적재 부피 ${trans.m3PerTrip.toLocaleString()}m³가 ${input.transTon ?? '선택 차량'} 한계 ${trans.maxM3.toLocaleString()}m³를 초과합니다.`,
    );
  }
  const postEa = (input.postCostRows ?? []).reduce(
    (sum, r) => sum + (Number.isFinite(r.costEa) ? r.costEa : 0),
    0,
  );

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

  // 6) 일반관리비 · 이윤 → should-cost
  const margin = applyMarginOverhead({
    direct,
    assumptions: db.assumptions,
    overrides: {
      overheadRate: input.overheadRateOverride,
      marginRate: input.marginRateOverride,
    },
  });

  // --- 섹션별 표시용 detail 빌드 ---
  const materialDetail: MaterialDetail = {
    density: mat.density,
    orderKg: mat.orderKg,
    netKg: mat.netKg,
    scrapKg: mat.scrapKg,
    scrapRecover: mat.scrapRecover,
    netMatCost: mat.netMatCost,
    matPrice: mat.matPrice,
    scrapPrice: mat.scrapPrice,
    scrapRecovery: input.scrapRecovery ?? 1,
    scrapRateDefault: db.assumptions.scrapRateDefault,
    xMm: input.xMm ?? 0,
    yMm: input.yMm ?? 0,
    thkMm: input.thkMm ?? 0,
    volMm3: input.volMm3 ?? 0,
    netFromVolume: (input.volMm3 ?? 0) > 0,
    volumeMissing: mat.volumeMissing,
    priceWarning: mat.priceWarning,
  };

  let cleanDetail: CleanDetail | undefined;
  if (clean.perEa > 0 || (input.cleanUse && (input.cleanN ?? 0) > 0)) {
    const metaForClean = resolveMaterial(input.material ?? '', db);
    cleanDetail = {
      method: clean.method,
      rate: clean.rate,
      perEa: clean.perEa,
      netKg: mat.netKg,
      helpers: input.cleanN ?? 0,
      group: metaForClean?.group,
    };
  }

  let weldDetail: WeldDetail | undefined;
  if (input.weldKind) {
    const kind = input.weldKind as WeldKind;
    const weldRateKeyMap: Record<WeldKind, ProcessRateKey> = {
      TIG: '용접_TIG',
      MIG: '용접_MIG',
      MAG: '용접_MAG',
      CO2: '용접_CO2',
      Robot: '용접_로봇',
      Spot: '용접_TIG',
    };
    const rateKey = weldRateKeyMap[kind];
    const weldRate = lookupProcessRate(rateKey, db);
    const speed =
      kind === 'Spot' ? 0 : lookupWeldSpeed(kind, input.thkMm ?? 0, db);
    let pos = input.weldPosFactor ?? 1.0;
    if (pos === 0) pos = 1.0;
    weldDetail = {
      kind,
      weldMin: weld.weldMin,
      perEa: weld.perEa,
      rate: weldRate,
      rateKey,
      posFactor: pos,
      spots: input.weldSpots ?? 0,
      spotSec: db.assumptions.spotSec,
      lengthMm: input.weldLenMm ?? 0,
      speed,
    };
  }

  let paintDetail: PaintDetail | undefined;
  if (input.paintUse) {
    paintDetail = {
      paintGEa: paint.paintGEa,
      paintMatEa: paint.paintMatEa,
      paintLaborEa: paint.paintLaborEa,
      perEa: paint.perEa,
      areaMm2: input.paintAreaMm2 ?? 0,
      thkUm: input.paintThkUm ?? db.paint.thkUm,
      densityGcm3: db.paint.densityGcm3,
      efficiency: db.paint.efficiency,
      pricePerKg: input.paintPricePerKg ?? 0,
      timeMin: input.paintTimeMin ?? 0,
      boothRate: lookupProcessRate('도장_부스', db),
      furnaceRate: lookupProcessRate('도장_소결로', db),
    };
  }

  const rawSum = direct + margin.overheadCost + margin.profitCost;
  const marginDetail: MarginDetail = {
    direct,
    materialCost: mat.netMatCost,
    processCost,
    transportCost: trans.perEa,
    postCost: postEa,
    overheadRate: margin.appliedOverheadRate,
    marginRate: margin.appliedMarginRate,
    overheadCost: margin.overheadCost,
    profitCost: margin.profitCost,
    rawSum,
    shouldCost: margin.shouldCost,
  };

  return {
    rawWeightKg: mat.orderKg,
    partWeightKg: mat.volumeMissing ? 0 : mat.netKg,
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
    transportDetail: {
      perTrip: trans.perTrip,
      trips: trans.trips,
      total: trans.total,
      perEa: trans.perEa,
      loadSource: trans.loadSource,
      effectiveLoad: trans.effectiveLoad,
      eaPerBox: trans.eaPerBox,
      boxPerPallet: trans.boxPerPallet,
      palletPerCar: trans.palletPerCar,
      boxesPerTrip: trans.boxesPerTrip,
      kgPerTrip: trans.kgPerTrip,
      m3PerTrip: trans.m3PerTrip,
      maxKg: trans.maxKg,
      maxM3: trans.maxM3,
      overWeight: trans.overWeight,
      overVolume: trans.overVolume,
    },
    postCost: postEa,
    directCost: direct,
    overheadCost: margin.overheadCost,
    profitCost: margin.profitCost,
    shouldCost: margin.shouldCost,
    appliedOverheadRate: margin.appliedOverheadRate,
    appliedMarginRate: margin.appliedMarginRate,
    materialDetail,
    laserDetail,
    bendDetail,
    nctDetail,
    cleanDetail,
    weldDetail,
    paintDetail,
    pressDetail,
    marginDetail,
  };
}
