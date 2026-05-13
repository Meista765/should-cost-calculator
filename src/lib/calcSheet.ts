// 판금 should-cost v10 계산 헬퍼. 공통/공법별 라인아이템을 한 슬라이스(UnifiedFormSlice)에서 계산.
import type {
  Assumptions,
  CutMaterialKey,
  Db,
  MaterialGroup,
  NctMethod,
  UnifiedFormSlice,
  WeldKind,
} from '../types/domain';
import {
  cutMaterialKey,
  findMaterialMeta,
  interpolateCoilPrice,
  lookupBendTime,
  lookupCleanRow,
  lookupCutSpeed,
  lookupFreight,
  lookupOwnVehicle,
  lookupPierceTime,
  lookupProcessRate,
  lookupWeldSpeed,
} from './lookup';

// ---------- 재질 메타 (통합 materialMeta 카탈로그 조회) ----------
export type ResolvedMaterial = {
  density: number;
  group?: MaterialGroup;
  cutKey?: CutMaterialKey;
  displayName: string;
};

export function resolveMaterial(grade: string, db: Db): ResolvedMaterial | undefined {
  const meta = findMaterialMeta(grade, db);
  if (!meta) return undefined;
  return {
    density: meta.density,
    group: meta.group,
    cutKey: meta.cutKey,
    displayName: meta.displayName,
  };
}

function resolvePrice(
  input: UnifiedFormSlice,
  db: Db,
): { matPrice: number; scrapPrice: number; warning?: string } {
  if (input.priceOverride) {
    return { matPrice: input.matPrice ?? 0, scrapPrice: input.scrapPrice ?? 0 };
  }
  if (input.material && input.thkMm != null && input.thkMm > 0) {
    const r = interpolateCoilPrice(input.material, input.thkMm, db);
    if (r.method !== 'unavailable') {
      return { matPrice: r.coilPrice, scrapPrice: r.scrapPrice, warning: r.warning };
    }
  }
  return { matPrice: 0, scrapPrice: 0 };
}

// ---------- 재료 ----------
export type MaterialResult = {
  density: number;
  orderKg: number;
  netKg: number;
  scrapKg: number;
  scrapRecover: number;
  netMatCost: number;
  matPrice: number;
  scrapPrice: number;
  volumeMissing: boolean;
  priceWarning?: string;
};

export function calcMaterial(inp: UnifiedFormSlice, db: Db): MaterialResult {
  const thk = inp.thkMm ?? 0;
  const X = inp.xMm ?? 0;
  const Y = inp.yMm ?? 0;
  const vol = inp.volMm3 ?? 0;
  const recovery = inp.scrapRecovery ?? 1;

  const meta = resolveMaterial(inp.material ?? '', db);
  const density = meta?.density ?? 7.85;

  const orderKg = (X * Y * thk * density) / 1_000_000;

  const volumeMissing = vol <= 0;
  const netKg = volumeMissing ? orderKg : (vol * density) / 1_000_000;

  const scrapGross = Math.max(orderKg - netKg, 0);
  const scrapKg = scrapGross * recovery;
  const { matPrice, scrapPrice, warning } = resolvePrice(inp, db);
  const scrapRecover = scrapKg * scrapPrice;
  const netMatCost = Math.max(orderKg * matPrice - scrapRecover, 0);

  return {
    density,
    orderKg,
    netKg,
    scrapKg,
    scrapRecover,
    netMatCost,
    matPrice,
    scrapPrice,
    volumeMissing,
    priceWarning: warning,
  };
}

// ---------- 레이저 ----------
export type LaserResult = {
  cutSpeed: number;
  pierceSec: number;
  cutMin: number;
  laserCost: number;
};

export function calcLaser(inp: UnifiedFormSlice, db: Db): LaserResult {
  const mat = inp.material ?? '';
  const thk = inp.thkMm ?? 0;
  const perimeter = inp.perimeterMm ?? 0;
  const pierceN = inp.pierceN ?? 0;
  const zero: LaserResult = { cutSpeed: 0, pierceSec: 0, cutMin: 0, laserCost: 0 };
  if (perimeter <= 0 || thk <= 0) return zero;

  const cutKey = cutMaterialKey(mat, db);
  if (!cutKey) return zero;
  const speed = lookupCutSpeed(cutKey, thk, db);
  if (speed === 0) return zero;

  const pierceSec = lookupPierceTime(thk, db);
  const cutMin = perimeter / speed + (pierceN * pierceSec) / 60;
  const rateKey = thk > 6 ? '레이저절단_6kW' : '레이저절단_4kW';
  const rate = lookupProcessRate(rateKey, db);
  const laserCost = (cutMin * rate) / 60;

  return { cutSpeed: speed, pierceSec, cutMin, laserCost };
}

// ---------- 절곡 ----------
export type BendResult = { bendSec: number; bendMin: number; bendCost: number };

export function calcBend(inp: UnifiedFormSlice, db: Db, setupMin: number): BendResult {
  const thk = inp.thkMm ?? 0;
  const bendN = inp.bendN ?? 0;
  const batch = inp.batchQty ?? 1;
  if (bendN <= 0) return { bendSec: 0, bendMin: 0, bendCost: 0 };

  const bendSec = lookupBendTime(thk, db);
  const bendMin = (batch > 0 ? setupMin / batch : 0) + (bendN * bendSec) / 60;
  const rate = lookupProcessRate('벤딩_프레스브레이크', db);
  const bendCost = (bendMin * rate) / 60;
  return { bendSec, bendMin, bendCost };
}

// ---------- 운반 ----------
export type TransportResult = {
  perTrip: number;
  trips: number;
  total: number;
  perEa: number;
  loadSource: 'hierarchy' | 'direct' | 'none';
  effectiveLoad: number;
  eaPerBox?: number;
  boxPerPallet?: number;
  palletPerCar?: number;
  boxesPerTrip?: number;
  kgPerTrip?: number;
  m3PerTrip?: number;
  maxKg?: number;
  maxM3?: number;
  overWeight: boolean;
  overVolume: boolean;
};

export function calcTransport(inp: UnifiedFormSlice, db: Db): TransportResult {
  const method = inp.transMethod ?? '';
  const tonnage = inp.transTon ?? '';
  const distance = inp.transKm ?? 0;
  const roundTrip = inp.transRound !== false;
  const batch = inp.batchQty ?? 1;

  const eaPerBox = inp.transEaPerBox ?? 0;
  const boxPerPallet = inp.transBoxPerPallet ?? 0;
  const palletPerCar = inp.transPalletPerCar ?? 0;
  const hierarchyComplete = eaPerBox > 0 && boxPerPallet > 0 && palletPerCar > 0;
  const hierarchyLoad = hierarchyComplete ? eaPerBox * boxPerPallet * palletPerCar : 0;
  const directLoad = inp.transLoad ?? 0;
  const effectiveLoad = hierarchyLoad > 0 ? hierarchyLoad : directLoad;
  const loadSource: 'hierarchy' | 'direct' | 'none' =
    hierarchyLoad > 0 ? 'hierarchy' : directLoad > 0 ? 'direct' : 'none';

  const boxesPerTrip = boxPerPallet > 0 && palletPerCar > 0 ? boxPerPallet * palletPerCar : 0;
  const kgPerTrip =
    boxesPerTrip > 0 && (inp.transBoxWeightKg ?? 0) > 0
      ? boxesPerTrip * (inp.transBoxWeightKg as number)
      : undefined;
  const m3PerTrip =
    boxesPerTrip > 0 && (inp.transBoxVolumeM3 ?? 0) > 0
      ? boxesPerTrip * (inp.transBoxVolumeM3 as number)
      : undefined;

  const traceBase = {
    loadSource,
    effectiveLoad,
    eaPerBox: eaPerBox > 0 ? eaPerBox : undefined,
    boxPerPallet: boxPerPallet > 0 ? boxPerPallet : undefined,
    palletPerCar: palletPerCar > 0 ? palletPerCar : undefined,
    boxesPerTrip: boxesPerTrip > 0 ? boxesPerTrip : undefined,
    kgPerTrip,
    m3PerTrip,
  } as const;

  const zero: TransportResult = {
    perTrip: 0,
    trips: 0,
    total: 0,
    perEa: 0,
    ...traceBase,
    overWeight: false,
    overVolume: false,
  };

  if (!method || distance <= 0 || effectiveLoad <= 0) return zero;

  let perTrip = 0;
  let maxKg: number | undefined;
  let maxM3: number | undefined;
  if (method === '용달') {
    const row = lookupFreight(tonnage, db);
    if (!row) return zero;
    const d = distance;
    let base: number;
    if (d <= 50) base = row.base;
    else if (d <= 100) base = row.base + (d - 50) * row.r50_100;
    else if (d <= 300) base = row.base + 50 * row.r50_100 + (d - 100) * row.r100_300;
    else
      base =
        row.base +
        50 * row.r50_100 +
        200 * row.r100_300 +
        (d - 300) * row.r300plus;
    perTrip = (base + row.loadFee) * (roundTrip ? 1.6 : 1.0);
    maxKg = row.maxKg;
    maxM3 = row.maxM3;
  } else if (method === '자체') {
    const row = lookupOwnVehicle(tonnage, db);
    if (!row) return zero;
    const rtKm = distance * (roundTrip ? 2 : 1);
    perTrip =
      row.fixPerHour * (rtKm / db.assumptions.avgSpeedKmh + db.assumptions.loadHr) +
      row.fuelPerKm * rtKm;
  } else {
    return zero;
  }

  const trips = Math.ceil(batch / effectiveLoad);
  const total = perTrip * trips;
  const perEa = batch > 0 ? total / batch : 0;
  const overWeight = maxKg != null && kgPerTrip != null && kgPerTrip > maxKg;
  const overVolume = maxM3 != null && m3PerTrip != null && m3PerTrip > maxM3;
  return {
    perTrip,
    trips,
    total,
    perEa,
    ...traceBase,
    maxKg,
    maxM3,
    overWeight,
    overVolume,
  };
}

// ---------- NCT ----------
export type NctResult = {
  featSec: number;
  nctMin: number;
  nctCostBatch: number;
  perEa: number;
};

function nctShapeSec(feat: Db['nctFeat'], name: string): number {
  return feat.shapes.find((s) => s.shape === name)?.sec ?? 0;
}

function nctTapSec(feat: Db['nctFeat'], size: string): number {
  return feat.tap.find((t) => t.size === size)?.sec ?? 0;
}

// method → DB shapes 항목 이름 (Tap 제외 — Tap은 별도 db.nctFeat.tap 사용)
export const NCT_SHAPE_NAME: Record<Exclude<NctMethod, 'Tap'>, string> = {
  Embossing: 'Embossing',
  Burring: 'Burring',
  Louver: 'Louver',
  KnockOut: 'KnockOut',
};

export function calcNct(inp: UnifiedFormSlice, db: Db, setupMin: number): NctResult {
  const rows = inp.nctRows ?? [];
  const batch = inp.batchQty ?? 1;

  let shapeFeatSec = 0;
  let shapeTotalCount = 0;
  for (const r of rows) {
    if (r.method === 'Tap') continue;
    const n = r.count ?? 0;
    if (n <= 0) continue;
    shapeFeatSec += n * nctShapeSec(db.nctFeat, NCT_SHAPE_NAME[r.method]);
    shapeTotalCount += n;
  }

  let tapTotalCount = 0;
  let tapTotalSec = 0;
  for (const r of rows) {
    if (r.method !== 'Tap' || !r.tapSize) continue;
    const n = r.count ?? 0;
    if (n <= 0) continue;
    tapTotalCount += n;
    tapTotalSec += n * nctTapSec(db.nctFeat, r.tapSize);
  }

  if (shapeTotalCount + tapTotalCount === 0) {
    return { featSec: 0, nctMin: 0, nctCostBatch: 0, perEa: 0 };
  }

  const featSec = shapeFeatSec + tapTotalSec;
  const nctMin = (batch > 0 ? setupMin / batch : 0) + featSec / 60;
  const rate = lookupProcessRate('NCT_펀치프레스', db);
  const nctCostBatch = ((setupMin + (featSec * batch) / 60) * rate) / 60;
  const perEa = batch > 0 ? nctCostBatch / batch : 0;
  return { featSec, nctMin, nctCostBatch, perEa };
}

// ---------- 세척 ----------
export type CleanResult = { method: string; rate: number; perEa: number };

export function calcClean(
  inp: UnifiedFormSlice,
  db: Db,
  mat: MaterialResult,
): CleanResult {
  const use = inp.cleanUse === true;
  const n = inp.cleanN ?? 0;
  if (!use || n <= 0) return { method: '', rate: 0, perEa: 0 };
  if (mat.volumeMissing) return { method: '', rate: 0, perEa: 0 };

  const meta = resolveMaterial(inp.material ?? '', db);
  if (!meta?.group) return { method: '', rate: 0, perEa: 0 };
  const row = lookupCleanRow(n, db);
  if (!row) return { method: '', rate: 0, perEa: 0 };
  const cell = row.perGroup[meta.group];
  if (!cell) return { method: '', rate: 0, perEa: 0 };
  const perEa = mat.netKg * cell.ratePerKg;
  return { method: cell.method, rate: cell.ratePerKg, perEa };
}

// ---------- 용접 ----------
export type WeldResult = { weldMin: number; perEa: number };

const WELD_RATE_KEY: Record<WeldKind, import('../types/domain').ProcessRateKey> = {
  TIG: '용접_TIG',
  MIG: '용접_MIG',
  MAG: '용접_MAG',
  CO2: '용접_CO2',
  Robot: '용접_로봇',
  Spot: '용접_TIG',
};

export function calcWeld(inp: UnifiedFormSlice, db: Db): WeldResult {
  const kind = inp.weldKind;
  if (!kind) return { weldMin: 0, perEa: 0 };

  const length = inp.weldLenMm ?? 0;
  const spots = inp.weldSpots ?? 0;
  let pos = inp.weldPosFactor ?? 1.0;
  if (pos === 0) pos = 1.0;
  const thk = inp.thkMm ?? 0;

  let weldMin = 0;
  if (kind === 'Spot') {
    weldMin = (spots * db.assumptions.spotSec / 60) * pos;
  } else {
    const speed = lookupWeldSpeed(kind, thk, db);
    if (speed === 0 || length <= 0) return { weldMin: 0, perEa: 0 };
    weldMin = (length / speed) * pos;
  }
  const rate = lookupProcessRate(WELD_RATE_KEY[kind], db);
  const perEa = (weldMin * rate) / 60;
  return { weldMin, perEa };
}

// ---------- 분체 도장 ----------
export type PaintResult = {
  paintGEa: number;
  paintMatEa: number;
  paintLaborEa: number;
  perEa: number;
};

export function calcPaint(inp: UnifiedFormSlice, db: Db): PaintResult {
  const zero: PaintResult = { paintGEa: 0, paintMatEa: 0, paintLaborEa: 0, perEa: 0 };
  if (inp.paintUse !== true) return zero;

  const area = inp.paintAreaMm2 ?? 0;
  const thkUm = inp.paintThkUm ?? db.paint.thkUm;
  const price = inp.paintPricePerKg ?? 0;
  const minutes = inp.paintTimeMin ?? 0;

  const eff = db.paint.efficiency;
  const gEa = eff === 0 ? 0 : (area / 1_000_000) * thkUm * db.paint.densityGcm3 / eff;
  const matEa = (gEa * price) / 1000;
  const laborEa =
    (minutes *
      (lookupProcessRate('도장_부스', db) + lookupProcessRate('도장_소결로', db))) /
    60;
  return {
    paintGEa: gEa,
    paintMatEa: matEa,
    paintLaborEa: laborEa,
    perEa: matEa + laborEa,
  };
}

// 가공계산을 위한 공용 assumptions 접근자.
export function setupMinFromDb(db: Db): number {
  return (db.assumptions as Assumptions).setupMin;
}
