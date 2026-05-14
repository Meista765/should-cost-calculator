// DB 조회 및 강종-두께 보간.
import type {
  CoilPriceRow,
  CutMaterialKey,
  Db,
  MaterialMetaRow,
  PressKind,
  Thk,
} from '../types/domain';
import { THK_LIST } from '../types/domain';

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
  if (!Number.isFinite(thickness)) return { method: 'unavailable', reason: 'out-of-range' };
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

// 통합 폼 재질 드롭다운 — materialMeta 카탈로그 전체.
export type MaterialOption = {
  grade: string;            // 매칭 키 (option value)
  gradeRaw: string;         // 표시용 (공백 보존)
  group?: import('../types/domain').MaterialGroup;
  density: number;
};

const GROUP_ORDER: Record<string, number> = { '탄소강': 0, '컬러강판': 1, 'STS': 2, '비철': 3 };

export function listAllMaterials(db: Db): MaterialOption[] {
  return [...db.materialMeta]
    .sort((a, b) => {
      const ga = GROUP_ORDER[a.group ?? ''] ?? 99;
      const gb = GROUP_ORDER[b.group ?? ''] ?? 99;
      if (ga !== gb) return ga - gb;
      return a.grade.localeCompare(b.grade, 'en');
    })
    .map((m) => ({ grade: m.grade, gradeRaw: m.gradeRaw, group: m.group, density: m.density }));
}

// ----- v10 판금 헬퍼 -----

// VLOOKUP TRUE 모드 동일: 두께를 THK_LIST의 "가까운 큰 값"으로 매핑.
export function lookupThk(thk: number): Thk {
  for (const t of THK_LIST) {
    if (thk <= t + 1e-9) return t;
  }
  return THK_LIST[THK_LIST.length - 1];
}

export function lookupThkIndex(thk: number): number {
  const t = lookupThk(thk);
  return THK_LIST.indexOf(t);
}

export function findMaterialMeta(grade: string, db: Db): MaterialMetaRow | undefined {
  return db.materialMeta.find((m) => m.grade === grade);
}

// MATERIAL_DB에 등록된 강종이면 그 cutKey를 사용. 미등록 시 prefix 규칙 적용.
export function cutMaterialKey(grade: string, db: Db): CutMaterialKey | undefined {
  const meta = findMaterialMeta(grade, db);
  if (meta) return meta.cutKey;
  if (grade.startsWith('STS')) {
    const rest = grade.slice(3);
    if (rest === '304L') return 'SUS304';
    if (rest === '316L') return 'SUS316';
    if (rest === '444') return 'SUS430';
    const fallback = ('SUS' + rest) as CutMaterialKey;
    return fallback;
  }
  return undefined;
}

export function lookupPierceTime(thk: number, db: Db): number {
  const t = lookupThk(thk);
  return db.pierceTime[String(t)] ?? 0;
}

export function lookupBendTime(thk: number, db: Db): number {
  const t = lookupThk(thk);
  return db.bendTime[String(t)] ?? 0;
}

export function lookupCutSpeed(cutKey: CutMaterialKey, thk: number, db: Db): number {
  const row = db.cutSpeed.find((r) => r.key === cutKey);
  if (!row) return 0;
  const idx = lookupThkIndex(thk);
  return row.values[idx] ?? 0;
}

export function lookupWeldSpeed(
  kind: Exclude<import('../types/domain').WeldKind, 'Spot'>,
  thk: number,
  db: Db,
): number {
  const row = db.weldSpeed.find((r) => r.key === kind);
  if (!row) return 0;
  const idx = lookupThkIndex(thk);
  return row.values[idx] ?? 0;
}

export function lookupProcessRate(
  key: import('../types/domain').ProcessRateKey,
  db: Db,
): number {
  const row = db.processRates.find((r) => r.key === key);
  if (row) return row.rate;
  // 번들이 stale 상태에서 점용접 행이 없을 때 TIG로 폴백 — 재암호화 전에도 동작 보장.
  if (key === '용접_점용접') {
    const tig = db.processRates.find((r) => r.key === '용접_TIG');
    return tig?.rate ?? 0;
  }
  return 0;
}

export function lookupFreight(tonnage: string, db: Db) {
  return db.freightMatrix.find((r) => r.tonnage === tonnage);
}

export function lookupOwnVehicle(tonnage: string, db: Db) {
  return db.ownVehicleMatrix.find((r) => r.tonnage === tonnage);
}

export function lookupCleanRow(helpers: number, db: Db) {
  return db.cleanMatrix.find((r) => r.helpers === helpers);
}
