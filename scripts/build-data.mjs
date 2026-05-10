// Data/*.md 파이프 테이블을 src/data/*.json 으로 변환한다.
// 빌드 시 자동 실행 (predev/prebuild). 수동 실행: npm run build:data
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATA = (p) => resolve(ROOT, 'Data', p);
const OUT = (p) => resolve(ROOT, 'src/data', p);

mkdirSync(resolve(ROOT, 'src/data'), { recursive: true });

function parseTable(md) {
  const rows = [];
  const lines = md.split(/\r?\n/);
  let header = null;
  for (const line of lines) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((s) => s.trim());
    if (cells.length === 0) continue;
    if (cells.every((c) => /^[-:\s]+$/.test(c))) continue; // separator
    if (header === null) {
      header = cells;
      continue;
    }
    if (cells.length !== header.length) continue;
    const row = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cells[i];
    rows.push(row);
  }
  return rows;
}

function num(v, ctx) {
  const n = Number(String(v).replace(/,/g, '').trim());
  if (!Number.isFinite(n)) throw new Error(`숫자 변환 실패 (${ctx}): ${v}`);
  return n;
}

// 강종명 정규화: 공백/괄호 제거. displayName은 원본 보존.
export function canonicalGrade(s) {
  return String(s).replace(/[\s()]/g, '');
}

// === 1) Coil prices ===
const coilMd = readFileSync(DATA('Material/steel coil cost.md'), 'utf8');
const coilRowsRaw = parseTable(coilMd);
const coilRows = coilRowsRaw.map((r) => ({
  grade: canonicalGrade(r['강종']),
  displayName: r['강종'].trim(),
  thickness: num(r['두께'], `coil ${r['강종']}/${r['두께']}`),
  coilPrice: num(r['원코일 KG당 가격(KRW/kg)'], `coil price ${r['강종']}/${r['두께']}`),
  scrapPrice: num(r['스크랩 KG당 가격(KRW/kg)'], `scrap price ${r['강종']}/${r['두께']}`),
}));
coilRows.sort((a, b) => a.grade.localeCompare(b.grade) || a.thickness - b.thickness);

// === 2) Specific gravity ===
const gravMd = readFileSync(DATA('Material/steel specific gravity.md'), 'utf8');
const gravRowsRaw = parseTable(gravMd);
const gravRows = gravRowsRaw.map((r) => ({
  grade: canonicalGrade(r['강종']),
  displayName: r['강종'].trim(),
  gravity: num(r['비중(g/cm³)'], `gravity ${r['강종']}`),
}));
gravRows.sort((a, b) => a.grade.localeCompare(b.grade));

// === 3) Press machine working cost ===
const pressMd = readFileSync(DATA('Machine/press machine working cost.md'), 'utf8');
const pressRowsRaw = parseTable(pressMd);
const pressRows = pressRowsRaw.map((r) => ({
  kind: r['구분'].trim(),
  tonnage: num(r['톤수'], `press ${r['구분']}/${r['톤수']}`),
  rate: num(r['설비임율(KRW/hr)'], `press rate ${r['구분']}/${r['톤수']}`),
}));
const KIND_OK = new Set(['단발', '프로']);
for (const p of pressRows) {
  if (!KIND_OK.has(p.kind)) console.warn(`[press] 알 수 없는 구분: ${p.kind}`);
}
pressRows.sort(
  (a, b) => a.kind.localeCompare(b.kind) || a.tonnage - b.tonnage,
);

// === 4) Worker cost ===
const workerMd = readFileSync(DATA('Men/worker cost.md'), 'utf8');
const workerRowsRaw = parseTable(workerMd);
const workerRows = workerRowsRaw.map((r) => ({
  role: r['직종명'].trim(),
  rate: num(r['노무임율(KRW/hr)'], `worker ${r['직종명']}`),
}));

// === 검증 워닝 ===
const gradesInCoil = new Set(coilRows.map((r) => r.grade));
const gradesInGrav = new Set(gravRows.map((r) => r.grade));
const onlyInCoil = [...gradesInCoil].filter((g) => !gradesInGrav.has(g)).sort();
const onlyInGrav = [...gradesInGrav].filter((g) => !gradesInCoil.has(g)).sort();
if (onlyInCoil.length) console.warn('[warn] 가격표에는 있으나 비중표에 없는 강종:', onlyInCoil);
if (onlyInGrav.length) console.warn('[warn] 비중표에는 있으나 가격표에 없는 강종:', onlyInGrav);

// 중복 (grade, thickness)
const seen = new Map();
for (const r of coilRows) {
  const k = `${r.grade}@${r.thickness}`;
  if (seen.has(k)) {
    console.warn(`[warn] coil 중복: ${r.displayName} ${r.thickness}t`);
  }
  seen.set(k, r);
}

// outlier (인접 행 대비 ±50% 이상 벗어남)
const byGrade = new Map();
for (const r of coilRows) {
  if (!byGrade.has(r.grade)) byGrade.set(r.grade, []);
  byGrade.get(r.grade).push(r);
}
for (const [grade, rows] of byGrade) {
  if (rows.length < 3) continue;
  for (let i = 1; i < rows.length - 1; i++) {
    const prev = rows[i - 1].coilPrice;
    const next = rows[i + 1].coilPrice;
    const cur = rows[i].coilPrice;
    const neighborAvg = (prev + next) / 2;
    if (neighborAvg > 0 && Math.abs(cur - neighborAvg) / neighborAvg > 0.5) {
      console.warn(
        `[warn] coil outlier: ${grade} ${rows[i].thickness}t = ${cur} (이웃 평균 ${Math.round(neighborAvg)})`,
      );
    }
  }
}

if (workerRows.length === 0) console.warn('[warn] worker 행이 없습니다.');

// === 출력 ===
const version = new Date().toISOString().slice(0, 10);
const write = (file, obj) =>
  writeFileSync(OUT(file), JSON.stringify({ version, ...obj }, null, 2) + '\n', 'utf8');

write('coilPrices.json', { rows: coilRows });
write('specificGravity.json', { rows: gravRows });
write('pressRates.json', { rows: pressRows });
write('workerRates.json', { rows: workerRows });

console.log(
  `[build-data] coil=${coilRows.length}, gravity=${gravRows.length}, press=${pressRows.length}, worker=${workerRows.length}`,
);
