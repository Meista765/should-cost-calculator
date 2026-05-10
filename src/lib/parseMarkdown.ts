// 브라우저/Node 양쪽에서 동작하는 .md 테이블 파서.
// 사용자가 import한 4개 .md 파일을 정규화된 Db 객체로 변환한다.
import type {
  CoilPriceRow,
  Db,
  MaterialGravityRow,
  PressKind,
  PressRateRow,
  WorkerRateRow,
} from '../types/domain';
import { canonicalGrade } from './normalize';

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
  if (set.has('비중(g/cm³)')) return 'gravity';
  if (set.has('설비임율(KRW/hr)')) return 'press';
  if (set.has('노무임율(KRW/hr)')) return 'worker';
  return null;
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

export function parseGravityMd(md: string): MaterialGravityRow[] {
  return parseTable(md)
    .map((r) => ({
      grade: canonicalGrade(r['강종']),
      displayName: r['강종'].trim(),
      gravity: num(r['비중(g/cm³)'], `gravity ${r['강종']}`),
    }))
    .sort((a, b) => a.grade.localeCompare(b.grade));
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
    rate: num(r['노무임율(KRW/hr)'], `worker ${r['직종명']}`),
  }));
}

export function buildDb(parts: Partial<Record<DataKind, string>>): Db {
  const missing: DataKind[] = (['coil', 'gravity', 'press', 'worker'] as const).filter(
    (k) => !parts[k],
  );
  if (missing.length) {
    throw new Error(`누락된 데이터 종류: ${missing.join(', ')}`);
  }
  return {
    coil: parseCoilMd(parts.coil!),
    gravity: parseGravityMd(parts.gravity!),
    press: parsePressMd(parts.press!),
    worker: parseWorkerMd(parts.worker!),
  };
}
