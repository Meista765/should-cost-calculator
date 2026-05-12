// 판금 should-cost v10 계산 헬퍼. 공통/공법별 라인아이템을 한 슬라이스(UnifiedFormSlice)에서 계산.
import type {
  Assumptions,
  CutMaterialKey,
  Db,
  MaterialGroup,
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
  let matPrice = input.matPrice;
  let scrapPrice = input.scrapPrice;
  let warning: string | undefined;
  const needLookup = matPrice == null || matPrice <= 0;
  if (needLookup && input.material && input.thkMm != null && input.thkMm > 0) {
    const r = interpolateCoilPrice(input.material, input.thkMm, db);
    if (r.method !== 'unavailable') {
      if (matPrice == null || matPrice <= 0) matPrice = r.coilPrice;
      if (scrapPrice == null || scrapPrice <= 0) scrapPrice = r.scrapPrice;
      if (r.warning) warning = r.warning;
    }
  }
  return { matPrice: matPrice ?? 0, scrapPrice: scrapPrice ?? 0, warning };
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

  let netKg: number;
  if (vol > 0) {
    netKg = (vol * density) / 1_000_000;
  } else {
    netKg = orderKg * (1 - db.assumptions.scrapRateDefault);
  }

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
};

export function calcTransport(inp: UnifiedFormSlice, db: Db): TransportResult {
  const zero: TransportResult = { perTrip: 0, trips: 0, total: 0, perEa: 0 };
  const method = inp.transMethod ?? '';
  const tonnage = inp.transTon ?? '';
  const distance = inp.transKm ?? 0;
  const roundTrip = inp.transRound !== false;
  const loadPerTrip = inp.transLoad ?? 0;
  const nightSurcharge = inp.transNight ?? 0;
  const batch = inp.batchQty ?? 1;

  if (!method || distance <= 0 || loadPerTrip <= 0) return zero;

  let perTrip = 0;
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
    perTrip = (base + row.loadFee) * (roundTrip ? 1.6 : 1.0) * (1 + nightSurcharge);
  } else if (method === '자체') {
    const row = lookupOwnVehicle(tonnage, db);
    if (!row) return zero;
    const rtKm = distance * (roundTrip ? 2 : 1);
    perTrip =
      row.fixPerHour * (rtKm / db.assumptions.avgSpeedKmh + db.assumptions.loadHr) +
      row.fuelPerKm * rtKm;
    perTrip *= 1 + nightSurcharge;
  } else {
    return zero;
  }

  const trips = loadPerTrip > 0 ? Math.ceil(batch / loadPerTrip) : 0;
  const total = perTrip * trips;
  const perEa = batch > 0 ? total / batch : 0;
  return { perTrip, trips, total, perEa };
}

// ---------- NCT ----------
export type NctResult = {
  featSec: number;
  nctMin: number;
  nctCostBatch: number;
  perEa: number;
};

export function calcNct(inp: UnifiedFormSlice, db: Db, setupMin: number): NctResult {
  const em = inp.nctEm ?? 0;
  const bur = inp.nctBur ?? 0;
  const tap = inp.nctTap ?? 0;
  const lou = inp.nctLou ?? 0;
  const tapSize = inp.nctTapSize ?? 'M5';
  const batch = inp.batchQty ?? 1;

  if (em + bur + tap + lou === 0) {
    return { featSec: 0, nctMin: 0, nctCostBatch: 0, perEa: 0 };
  }

  const tapSec = db.nctFeat.tap[tapSize] ?? db.nctFeat.tap['M5'];
  const featSec =
    em * db.nctFeat.Embossing +
    bur * db.nctFeat.Burring +
    tap * tapSec +
    lou * db.nctFeat.Louver;

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
