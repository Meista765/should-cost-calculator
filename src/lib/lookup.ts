// DB 조회 및 강종-두께 보간.
import type { CoilPriceRow, Db, PressKind } from '../types/domain';
import { GRAVITY_FALLBACK } from './normalize';

export type GravityResult = { gravity: number; warning?: string };

export function lookupGravity(grade: string, db: Db): GravityResult | undefined {
  const direct = db.gravity.find((g) => g.grade === grade);
  if (direct) return { gravity: direct.gravity };
  const fallback = GRAVITY_FALLBACK[grade];
  if (fallback) {
    const ref = db.gravity.find((g) => g.grade === fallback.grade);
    if (ref) return { gravity: ref.gravity, warning: `비중 추정값 사용: ${fallback.reason}` };
  }
  return undefined;
}

export function lookupCoilPrice(
  grade: string,
  thickness: number,
  db: Db,
): CoilPriceRow | undefined {
  return db.coil.find((r) => r.grade === grade && r.thickness === thickness);
}

export function lookupPressRate(
  kind: PressKind,
  tonnage: number,
  db: Db,
): number | undefined {
  const row = db.press.find((r) => r.kind === kind && r.tonnage === tonnage);
  return row?.rate;
}

export function lookupWorkerRate(role: string, db: Db): number | undefined {
  const row = db.worker.find((r) => r.role === role);
  return row?.rate;
}

export type InterpolateResult =
  | {
      method: 'exact' | 'interpolate';
      coilPrice: number;
      scrapPrice: number;
      warning?: string;
    }
  | {
      method: 'unavailable';
      reason: 'no-grade' | 'out-of-range';
    };

export function interpolateCoilPrice(
  grade: string,
  thickness: number,
  db: Db,
): InterpolateResult {
  const rows = db.coil
    .filter((r) => r.grade === grade)
    .sort((a, b) => a.thickness - b.thickness);
  if (rows.length === 0) return { method: 'unavailable', reason: 'no-grade' };

  const exact = rows.find((r) => r.thickness === thickness);
  if (exact) {
    return {
      method: 'exact',
      coilPrice: exact.coilPrice,
      scrapPrice: exact.scrapPrice,
    };
  }

  const tMin = rows[0].thickness;
  const tMax = rows[rows.length - 1].thickness;
  if (thickness < tMin || thickness > tMax) {
    return { method: 'unavailable', reason: 'out-of-range' };
  }

  let lo = rows[0];
  let hi = rows[rows.length - 1];
  for (let i = 0; i < rows.length - 1; i++) {
    if (rows[i].thickness <= thickness && rows[i + 1].thickness >= thickness) {
      lo = rows[i];
      hi = rows[i + 1];
      break;
    }
  }
  const ratio = (thickness - lo.thickness) / (hi.thickness - lo.thickness);
  return {
    method: 'interpolate',
    coilPrice: lo.coilPrice + ratio * (hi.coilPrice - lo.coilPrice),
    scrapPrice: lo.scrapPrice + ratio * (hi.scrapPrice - lo.scrapPrice),
    warning: '사급 대상 자재가 아니므로 유사 사양 가격 정보로 대체',
  };
}

export function thicknessOptionsFor(grade: string, db: Db): number[] {
  const set = new Set<number>();
  for (const r of db.coil) if (r.grade === grade) set.add(r.thickness);
  return [...set].sort((a, b) => a - b);
}

export function gradesAvailableForThickness(
  thickness: number,
  db: Db,
  mode: 'exact' | 'interpolate',
): { grade: string; displayName: string; method: 'exact' | 'interpolate' }[] {
  const byGrade = new Map<string, { displayName: string; thicknesses: number[] }>();
  for (const r of db.coil) {
    if (!byGrade.has(r.grade)) byGrade.set(r.grade, { displayName: r.displayName, thicknesses: [] });
    byGrade.get(r.grade)!.thicknesses.push(r.thickness);
  }
  const out: { grade: string; displayName: string; method: 'exact' | 'interpolate' }[] = [];
  for (const [grade, info] of byGrade) {
    const ts = info.thicknesses.sort((a, b) => a - b);
    const exact = ts.includes(thickness);
    if (exact) {
      out.push({ grade, displayName: info.displayName, method: 'exact' });
    } else if (mode === 'interpolate') {
      if (thickness >= ts[0] && thickness <= ts[ts.length - 1]) {
        out.push({ grade, displayName: info.displayName, method: 'interpolate' });
      }
    }
  }
  return out.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko'));
}

export function listAllGrades(db: Db): { grade: string; displayName: string }[] {
  const seen = new Map<string, string>();
  for (const r of db.coil) if (!seen.has(r.grade)) seen.set(r.grade, r.displayName);
  return [...seen.entries()]
    .map(([grade, displayName]) => ({ grade, displayName }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko'));
}
