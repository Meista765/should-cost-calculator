// 브라우저/Node 양쪽에서 동작하는 .md 테이블 파서.
// 사용자가 import한 .md 파일을 정규화된 Db 객체로 변환한다.
import type {
  Assumptions,
  CleanMatrixRow,
  CoilPriceRow,
  CutMaterialKey,
  CutSpeedTable,
  Db,
  FreightRow,
  MaterialGroup,
  MaterialMetaRow,
  NctFeatureTable,
  NctShapeRow,
  NctTapRow,
  OwnVehicleRow,
  PaintConstants,
  PressKind,
  PressRateRow,
  ProcessRateRow,
  WeldSpeedTable,
  WorkerRateRow,
} from '../types/domain';
import { canonicalGrade } from './normalize';

// "gravity" 키는 통합 재질 카탈로그 (구 material_meta 통합본) 파일을 가리킨다.
export type DataKind = 'coil' | 'gravity' | 'press' | 'worker';

function parseTable(md: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const lines = md.split(/\r?\n/);
  let header: string[] | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((s) => s.trim());
    if (cells.length === 0) continue;
    if (cells.every((c) => /^[-:\s]+$/.test(c))) continue;
    if (header === null) {
      header = cells;
      continue;
    }
    if (cells.length !== header.length) continue;
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cells[i];
    rows.push(row);
  }
  return rows;
}

function num(v: string, ctx: string): number {
  const n = Number(String(v).replace(/,/g, '').trim());
  if (!Number.isFinite(n)) throw new Error(`숫자 변환 실패 (${ctx}): ${v}`);
  return n;
}

function firstHeaderCols(md: string): string[] | null {
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((s) => s.trim());
    if (cells.length === 0) continue;
    if (cells.every((c) => /^[-:\s]+$/.test(c))) continue;
    return cells;
  }
  return null;
}

export function detectKind(md: string): DataKind | null {
  const cols = firstHeaderCols(md);
  if (!cols) return null;
  const set = new Set(cols);
  if (set.has('스크랩 KG당 가격(KRW/kg)') || set.has('원코일 KG당 가격(KRW/kg)')) return 'coil';
  if (set.has('비중(g/cm³)') && set.has('강종')) return 'gravity';
  if (set.has('설비임율(KRW/hr)')) return 'press';
  if (set.has('노무임율(KRW/hr)')) return 'worker';
  return null;
}

// 통합 재질 카탈로그 파서. "강종명/절단키/재질군" 열은 선택값 — 누락 시 undefined.
function parseMaterialsTable(md: string): MaterialMetaRow[] {
  const rows = parseTable(md);
  return rows
    .map((r) => {
      const grade = canonicalGrade(r['강종']);
      const gradeRaw = r['강종'].trim();
      const displayRaw = (r['강종명'] ?? r['강종']).trim();
      const displayName = displayRaw === '' || displayRaw === '-' ? r['강종'].trim() : displayRaw;
      const cutRaw = (r['절단키'] ?? '').trim();
      const groupRaw = (r['재질군'] ?? '').trim();
      const cutKey = cutRaw === '' || cutRaw === '-' ? undefined : (cutRaw as CutMaterialKey);
      const group = groupRaw === '' || groupRaw === '-' ? undefined : (groupRaw as MaterialGroup);
      return {
        grade,
        gradeRaw,
        displayName,
        cutKey,
        group,
        density: num(r['비중(g/cm³)'], `material ${r['강종']}`),
      };
    })
    .sort((a, b) => a.grade.localeCompare(b.grade));
}

export function parseCoilMd(md: string): CoilPriceRow[] {
  return parseTable(md)
    .map((r) => ({
      grade: canonicalGrade(r['강종']),
      displayName: r['강종'].trim(),
      thickness: num(r['두께'], `coil ${r['강종']}/${r['두께']}`),
      coilPrice: num(r['원코일 KG당 가격(KRW/kg)'], 'coil price'),
      scrapPrice: num(r['스크랩 KG당 가격(KRW/kg)'], 'scrap price'),
    }))
    .sort((a, b) => a.grade.localeCompare(b.grade) || a.thickness - b.thickness);
}

// 구 parseGravityMd 의 호환 진입점 — 통합 재질 카탈로그를 MaterialMetaRow[] 로 반환한다.
export function parseGravityMd(md: string): MaterialMetaRow[] {
  return parseMaterialsTable(md);
}

export function parsePressMd(md: string): PressRateRow[] {
  return parseTable(md)
    .map((r) => ({
      kind: r['구분'].trim() as PressKind,
      tonnage: num(r['톤수'], `press ${r['구분']}/${r['톤수']}`),
      rate: num(r['설비임율(KRW/hr)'], 'press rate'),
    }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.tonnage - b.tonnage);
}

export function parseWorkerMd(md: string): WorkerRateRow[] {
  return parseTable(md).map((r) => ({
    role: r['직종명'].trim(),
    rate: num(r['시급(KRW/hr)'], `worker ${r['직종명']}`),
    category: r['업종']?.trim() || undefined,
    code: r['직종코드'] != null && r['직종코드'].trim() !== ''
      ? num(r['직종코드'], `worker code ${r['직종명']}`)
      : undefined,
  }));
}

// ----- v10 판금 파서 -----

function parseThkVector(md: string, ctx: string): { key: string; values: number[] }[] {
  const lines = md.split(/\r?\n/);
  const result: { key: string; values: number[] }[] = [];
  let header: string[] | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((s) => s.trim());
    if (cells.length === 0) continue;
    if (cells.every((c) => /^[-:\s]+$/.test(c))) continue;
    if (header === null) {
      header = cells;
      continue;
    }
    if (cells.length !== header.length) continue;
    const values: number[] = [];
    for (let i = 1; i < header.length; i++) {
      values.push(num(cells[i], `${ctx} ${cells[0]}/${header[i]}`));
    }
    result.push({ key: cells[0], values });
  }
  return result;
}

export function parseCutSpeedMd(md: string): CutSpeedTable {
  return parseThkVector(md, 'cutSpeed') as CutSpeedTable;
}
export function parseWeldSpeedMd(md: string): WeldSpeedTable {
  return parseThkVector(md, 'weldSpeed') as WeldSpeedTable;
}

export function parsePierceTimeMd(md: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of parseTable(md)) {
    out[String(num(r['두께'], 'pierce thk'))] = num(r['시간(sec/회)'], 'pierce time');
  }
  return out;
}
export function parseBendTimeMd(md: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of parseTable(md)) {
    out[String(num(r['두께'], 'bend thk'))] = num(r['시간(sec/bend)'], 'bend time');
  }
  return out;
}

export function parseNctFeatMd(md: string): NctFeatureTable {
  const shapes: NctShapeRow[] = [];
  const tap: NctTapRow[] = [];
  for (const r of parseTable(md)) {
    const k = r['형상'].trim();
    const v = num(r['시간(sec/개)'], `nct ${k}`);
    if (k.startsWith('Tap_')) {
      tap.push({ size: k.slice(4), sec: v });
    } else {
      const shape = k === 'Knock-out' ? 'KnockOut' : k;
      shapes.push({ shape, sec: v });
    }
  }
  return { shapes, tap };
}

export function parseCleanMatrixMd(md: string): CleanMatrixRow[] {
  const m = new Map<number, CleanMatrixRow>();
  for (const r of parseTable(md)) {
    const helpers = num(r['조수'], 'clean helpers');
    if (!m.has(helpers)) {
      m.set(helpers, {
        helpers,
        perGroup: {
          탄소강: { method: '', ratePerKg: 0 },
          STS: { method: '', ratePerKg: 0 },
          비철: { method: '', ratePerKg: 0 },
        },
      });
    }
    const row = m.get(helpers)!;
    row.perGroup[r['재질군'].trim() as MaterialGroup] = {
      method: r['공법'].trim(),
      ratePerKg: num(r['단가(원/kg)'], `clean ${helpers}/${r['재질군']}`),
    };
  }
  return [...m.values()].sort((a, b) => a.helpers - b.helpers);
}

export function parseFreightMd(md: string): FreightRow[] {
  return parseTable(md).map((r) => ({
    tonnage: r['차량톤수'].trim(),
    base: num(r['기본료'], `freight ${r['차량톤수']}/base`),
    r50_100: num(r['51-100단가'], `freight ${r['차량톤수']}/r50`),
    r100_300: num(r['101-300단가'], `freight ${r['차량톤수']}/r100`),
    r300plus: num(r['301+단가'], `freight ${r['차량톤수']}/r300`),
    loadFee: num(r['상하차비'], `freight ${r['차량톤수']}/loadFee`),
    maxKg: num(r['최대적재kg'], `freight ${r['차량톤수']}/maxKg`),
    maxM3: num(r['최대m³'], `freight ${r['차량톤수']}/maxM3`),
    note: r['비고'].trim() === '-' ? '' : r['비고'].trim(),
  }));
}

export function parseOwnVehicleMd(md: string): OwnVehicleRow[] {
  return parseTable(md).map((r) => ({
    tonnage: r['차량톤수'].trim(),
    fixPerHour: num(r['고정비(원/hr)'], `own ${r['차량톤수']}/fix`),
    fuelPerKm: num(r['연료(원/km)'], `own ${r['차량톤수']}/fuel`),
  }));
}

export function parseProcessRatesMd(md: string): ProcessRateRow[] {
  return parseTable(md).map((r) => ({
    key: r['공정'].trim() as ProcessRateRow['key'],
    rate: num(r['시간당가공비(원/hr)'], `process ${r['공정']}`),
  }));
}

function kvFromTable(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of parseTable(md)) out[r['항목'].trim()] = r['값'].trim();
  return out;
}

export function parsePaintMd(md: string): PaintConstants {
  const kv = kvFromTable(md);
  return {
    thkUm: num(kv['도막두께(μm)'], 'paint thkUm'),
    densityGcm3: num(kv['도료비중(g/cm³)'], 'paint density'),
    efficiency: num(kv['도장효율(0~1)'], 'paint eff'),
  };
}

export function parseAssumptionsMd(md: string): Assumptions {
  const kv = kvFromTable(md);
  return {
    overheadRate: num(kv['간접비율(0~1)'], 'overheadRate'),
    marginRate: num(kv['이윤율(0~1)'], 'marginRate'),
    setupMin: num(kv['셋업시간(분/배치)'], 'setupMin'),
    scrapRateDefault: num(kv['기본스크랩율(0~1)'], 'scrapRateDefault'),
    avgSpeedKmh: num(kv['평균속도(km/h)'], 'avgSpeedKmh'),
    loadHr: num(kv['상하차시간(h)'], 'loadHr'),
    spotSec: num(kv['점용접시간(sec/점)'], 'spotSec'),
  };
}

// 기존 4개만 받는 buildDb — v10 필드는 빈 값으로 채워 타입 호환.
// parts.gravity 는 통합 재질 카탈로그 파일 (구 material_meta 통합본).
export function buildDb(parts: Partial<Record<DataKind, string>>): Db {
  const missing: DataKind[] = (['coil', 'gravity', 'press', 'worker'] as const).filter(
    (k) => !parts[k],
  );
  if (missing.length) {
    throw new Error(`누락된 데이터 종류: ${missing.join(', ')}`);
  }
  return {
    coil: parseCoilMd(parts.coil!),
    press: parsePressMd(parts.press!),
    worker: parseWorkerMd(parts.worker!),
    materialMeta: parseMaterialsTable(parts.gravity!),
    cutSpeed: [],
    pierceTime: {},
    bendTime: {},
    nctFeat: { shapes: [], tap: [] },
    weldSpeed: [],
    cleanMatrix: [],
    freightMatrix: [],
    ownVehicleMatrix: [],
    processRates: [],
    paint: { thkUm: 0, densityGcm3: 0, efficiency: 0 },
    assumptions: {
      overheadRate: 0, marginRate: 0, setupMin: 30,
      scrapRateDefault: 0.15, avgSpeedKmh: 60, loadHr: 1, spotSec: 1.5,
    },
  };
}

export type FullDbParts = {
  coil: string;
  /** 통합 재질 카탈로그 파일 (Data/Material/steel specific gravity.md). 구 material_meta 통합본. */
  gravity: string;
  press: string;
  worker: string;
  cutSpeed: string; pierceTime: string; bendTime: string;
  nctFeat: string; weldSpeed: string; cleanMatrix: string;
  freight: string; ownVehicle: string; processRates: string;
  paint: string; assumptions: string;
};

export function buildFullDb(p: FullDbParts): Db {
  return {
    coil: parseCoilMd(p.coil),
    press: parsePressMd(p.press),
    worker: parseWorkerMd(p.worker),
    materialMeta: parseMaterialsTable(p.gravity),
    cutSpeed: parseCutSpeedMd(p.cutSpeed),
    pierceTime: parsePierceTimeMd(p.pierceTime),
    bendTime: parseBendTimeMd(p.bendTime),
    nctFeat: parseNctFeatMd(p.nctFeat),
    weldSpeed: parseWeldSpeedMd(p.weldSpeed),
    cleanMatrix: parseCleanMatrixMd(p.cleanMatrix),
    freightMatrix: parseFreightMd(p.freight),
    ownVehicleMatrix: parseOwnVehicleMd(p.ownVehicle),
    processRates: parseProcessRatesMd(p.processRates),
    paint: parsePaintMd(p.paint),
    assumptions: parseAssumptionsMd(p.assumptions),
  };
}
