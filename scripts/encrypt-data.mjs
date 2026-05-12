// Data/*.md (기존 4개 + 판금 v10 12개)를 단일 db 객체로 합쳐
// AES-GCM-256 + 이중 비밀번호 envelope으로 src/data/encrypted.json에 저장한다.
//
// 사용법 (셸 무관):
//   1) 대화형 (권장 — 비번 마스킹 + 명령 히스토리에 안 남음):
//        npm run encrypt:data
//   2) npm 인자:
//        npm run encrypt:data -- "<관리자 비번>" "<사용자 비번>"
//   3) 환경변수 (CI 용):
//        BUILD_ADMIN_PASSWORD / BUILD_USER_PASSWORD
//
// 비밀번호는 16자 이상 + 소문자·대문자·숫자·특수문자 모두 포함이어야 하며 둘이 같으면 거부한다.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import readline from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATA = (p) => resolve(ROOT, 'Data', p);
const OUT = resolve(ROOT, 'src/data/encrypted.json');

// stdin 프롬프트: 입력 시 별표로 마스킹.
function promptHidden(label) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(`${label}: `, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    // mute stdout echo (별표 표시).
    rl._writeToOutput = (s) => {
      if (typeof s !== 'string') return;
      if (s.includes('\n') || s.includes(':')) {
        rl.output.write(s);
      } else {
        rl.output.write('*');
      }
    };
  });
}

let adminPw = process.argv[2] || process.env.BUILD_ADMIN_PASSWORD;
let userPw = process.argv[3] || process.env.BUILD_USER_PASSWORD;

if (!adminPw || !userPw) {
  if (!process.stdin.isTTY) {
    console.error('비밀번호 미제공. 다음 중 하나로 실행하세요:');
    console.error('  npm run encrypt:data                          (대화형)');
    console.error('  npm run encrypt:data -- "<admin>" "<user>"     (인자)');
    console.error('  BUILD_ADMIN_PASSWORD=.. BUILD_USER_PASSWORD=.. npm run encrypt:data');
    process.exit(1);
  }
  console.log('비밀번호를 입력하세요. (16자 이상, 소문자·대문자·숫자·특수문자 포함)');
  if (!adminPw) adminPw = await promptHidden('관리자 비밀번호');
  if (!userPw) userPw = await promptHidden('사용자 비밀번호');
}

if (adminPw === userPw) {
  console.error('관리자 비번과 사용자 비번이 동일합니다. 분리해서 설정하세요.');
  process.exit(1);
}

function assertStrongPassword(pw, label) {
  const errors = [];
  if (pw.length < 16) errors.push(`최소 16자 (현재 ${pw.length}자)`);
  if (!/[a-z]/.test(pw)) errors.push('소문자 포함');
  if (!/[A-Z]/.test(pw)) errors.push('대문자 포함');
  if (!/[0-9]/.test(pw)) errors.push('숫자 포함');
  if (!/[^A-Za-z0-9]/.test(pw)) errors.push('특수문자 포함');
  if (errors.length > 0) {
    console.error(`${label} 강도 부족: ` + errors.join(', '));
    process.exit(1);
  }
}
assertStrongPassword(adminPw, 'BUILD_ADMIN_PASSWORD');
assertStrongPassword(userPw, 'BUILD_USER_PASSWORD');

// === 공통 파서 ===
function parseTable(md) {
  const rows = [];
  const lines = md.split(/\r?\n/);
  let header = null;
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

function canonicalGrade(s) {
  return s.replace(/[\s()]/g, '');
}

// === 코일가 + 통합 재질 카탈로그 + 프레스/작업자 ===
const coilMd = readFileSync(DATA('Material/steel coil cost.md'), 'utf8');
const materialsMd = readFileSync(DATA('Material/steel specific gravity.md'), 'utf8');
const pressMd = readFileSync(DATA('Machine/press machine working cost.md'), 'utf8');
const workerMd = readFileSync(DATA('Men/worker cost.md'), 'utf8');

const coil = parseTable(coilMd)
  .map((r) => ({
    grade: canonicalGrade(r['강종']),
    displayName: r['강종'].trim(),
    thickness: num(r['두께'], `coil ${r['강종']}/${r['두께']}`),
    coilPrice: num(r['원코일 KG당 가격(KRW/kg)'], 'coil price'),
    scrapPrice: num(r['스크랩 KG당 가격(KRW/kg)'], 'scrap price'),
  }))
  .sort((a, b) => a.grade.localeCompare(b.grade) || a.thickness - b.thickness);

// 통합 재질 카탈로그 — 강종/강종명/절단키/재질군/비중. 절단키·재질군은 선택값(빈 셀 → undefined).
function trimOrUndef(v) {
  const t = (v ?? '').trim();
  return t === '' || t === '-' ? undefined : t;
}
const materialMeta = parseTable(materialsMd)
  .map((r) => ({
    grade: canonicalGrade(r['강종']),
    displayName: (trimOrUndef(r['강종명']) ?? r['강종'].trim()),
    cutKey: trimOrUndef(r['절단키']),
    group: trimOrUndef(r['재질군']),
    density: num(r['비중(g/cm³)'], `material ${r['강종']}`),
  }))
  .sort((a, b) => a.grade.localeCompare(b.grade));

const press = parseTable(pressMd)
  .map((r) => ({
    kind: r['구분'].trim(),
    tonnage: num(r['톤수'], `press ${r['구분']}/${r['톤수']}`),
    rate: num(r['설비임율(KRW/hr)'], 'press rate'),
  }))
  .sort((a, b) => a.kind.localeCompare(b.kind) || a.tonnage - b.tonnage);

const worker = parseTable(workerMd).map((r) => ({
  role: r['직종명'].trim(),
  rate: num(r['노무임율(KRW/hr)'], `worker ${r['직종명']}`),
}));

// === 판금 v10 11개 .md (material_meta 는 통합 카탈로그로 흡수됨) ===
const SHEET = (n) => readFileSync(DATA(`Sheet/${n}.md`), 'utf8');

// THK_LIST는 헤더에서 추출 (앞쪽 첫 컬럼이 절단키 또는 종류이므로 그 외)
function parseThkVector(md, keyHeader) {
  const lines = md.split(/\r?\n/);
  const result = [];
  let header = null;
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
    const obj = { key: cells[0], values: [] };
    for (let i = 1; i < header.length; i++) {
      obj.values.push(num(cells[i], `${keyHeader} ${cells[0]}/${header[i]}`));
    }
    result.push(obj);
  }
  return result;
}

const cutSpeed = parseThkVector(SHEET('cut_speed'), 'cutSpeed');
const weldSpeed = parseThkVector(SHEET('weld_speed'), 'weldSpeed');

const pierceTime = {};
for (const r of parseTable(SHEET('pierce_time'))) {
  pierceTime[String(num(r['두께'], 'pierce thk'))] = num(r['시간(sec/회)'], 'pierce time');
}
const bendTime = {};
for (const r of parseTable(SHEET('bend_time'))) {
  bendTime[String(num(r['두께'], 'bend thk'))] = num(r['시간(sec/bend)'], 'bend time');
}

const nctRows = parseTable(SHEET('nct_feat'));
const nctFeat = {
  Embossing: 0,
  Burring: 0,
  Louver: 0,
  Countersink: 0,
  KnockOut: 0,
  tap: { M3: 0, M4: 0, M5: 0, M6: 0, M8: 0 },
};
for (const r of nctRows) {
  const k = r['형상'].trim();
  const v = num(r['시간(sec/개)'], `nct ${k}`);
  if (k === 'Embossing') nctFeat.Embossing = v;
  else if (k === 'Burring') nctFeat.Burring = v;
  else if (k === 'Louver') nctFeat.Louver = v;
  else if (k === 'Countersink') nctFeat.Countersink = v;
  else if (k === 'Knock-out' || k === 'KnockOut') nctFeat.KnockOut = v;
  else if (k.startsWith('Tap_')) {
    const size = k.slice(4);
    nctFeat.tap[size] = v;
  }
}

const cleanRowsMap = new Map();
for (const r of parseTable(SHEET('clean_matrix'))) {
  const helpers = num(r['조수'], 'clean helpers');
  if (!cleanRowsMap.has(helpers)) {
    cleanRowsMap.set(helpers, {
      helpers,
      perGroup: { 탄소강: { method: '', ratePerKg: 0 }, STS: { method: '', ratePerKg: 0 }, 비철: { method: '', ratePerKg: 0 } },
    });
  }
  const row = cleanRowsMap.get(helpers);
  row.perGroup[r['재질군'].trim()] = {
    method: r['공법'].trim(),
    ratePerKg: num(r['단가(원/kg)'], `clean ${helpers}/${r['재질군']}`),
  };
}
const cleanMatrix = [...cleanRowsMap.values()].sort((a, b) => a.helpers - b.helpers);

const freightMatrix = parseTable(SHEET('freight')).map((r) => ({
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

const ownVehicleMatrix = parseTable(SHEET('own_vehicle')).map((r) => ({
  tonnage: r['차량톤수'].trim(),
  fixPerHour: num(r['고정비(원/hr)'], `own ${r['차량톤수']}/fix`),
  fuelPerKm: num(r['연료(원/km)'], `own ${r['차량톤수']}/fuel`),
}));

const processRates = parseTable(SHEET('process_rates')).map((r) => ({
  key: r['공정'].trim(),
  rate: num(r['시간당가공비(원/hr)'], `process ${r['공정']}`),
}));

const paintRows = parseTable(SHEET('paint'));
const paintMap = Object.fromEntries(paintRows.map((r) => [r['항목'].trim(), r['값'].trim()]));
const paint = {
  thkUm: num(paintMap['도막두께(μm)'], 'paint thkUm'),
  densityGcm3: num(paintMap['도료비중(g/cm³)'], 'paint density'),
  efficiency: num(paintMap['도장효율(0~1)'], 'paint eff'),
};

const assumptionsRows = parseTable(SHEET('assumptions'));
const aMap = Object.fromEntries(assumptionsRows.map((r) => [r['항목'].trim(), r['값'].trim()]));
const assumptions = {
  overheadRate: num(aMap['간접비율(0~1)'], 'overheadRate'),
  marginRate: num(aMap['이윤율(0~1)'], 'marginRate'),
  setupMin: num(aMap['셋업시간(분/배치)'], 'setupMin'),
  minPartCost: num(aMap['최소가공비(원/부품)'], 'minPartCost'),
  scrapRateDefault: num(aMap['기본스크랩율(0~1)'], 'scrapRateDefault'),
  avgSpeedKmh: num(aMap['평균속도(km/h)'], 'avgSpeedKmh'),
  loadHr: num(aMap['상하차시간(h)'], 'loadHr'),
  spotSec: num(aMap['점용접시간(sec/점)'], 'spotSec'),
};

const db = {
  coil, press, worker,
  materialMeta, cutSpeed, pierceTime, bendTime, nctFeat, weldSpeed,
  cleanMatrix, freightMatrix, ownVehicleMatrix, processRates, paint, assumptions,
};

// === 이중 envelope 암호화 ===
const enc = new TextEncoder();
const plaintext = enc.encode(JSON.stringify(db));
const ITERATIONS = 600_000;
const toB64 = (b) => Buffer.from(b).toString('base64');

// 1) 랜덤 DEK 생성 → payload AES-GCM 암호화
const dekRaw = webcrypto.getRandomValues(new Uint8Array(32));
const dataIv = webcrypto.getRandomValues(new Uint8Array(12));
const dekKey = await webcrypto.subtle.importKey(
  'raw',
  dekRaw,
  { name: 'AES-GCM', length: 256 },
  true,
  ['encrypt', 'decrypt'],
);
const ciphertext = new Uint8Array(
  await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv: dataIv }, dekKey, plaintext),
);

// 2) 각 비번으로 PBKDF2 키 도출 → DEK를 AES-GCM 래핑
async function wrapDek(password) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const wrapIv = webcrypto.getRandomValues(new Uint8Array(12));
  const baseKey = await webcrypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  const wrapKey = await webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const wrappedDek = new Uint8Array(
    await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv: wrapIv }, wrapKey, dekRaw),
  );
  return { kdfSalt: toB64(salt), wrapIv: toB64(wrapIv), wrappedDek: toB64(wrappedDek) };
}

const adminWrap = await wrapDek(adminPw);
const userWrap = await wrapDek(userPw);

const out = {
  version: '2',
  encryptedAt: new Date().toISOString(),
  algorithm: 'AES-GCM-256',
  kdf: 'PBKDF2',
  kdfHash: 'SHA-256',
  kdfIterations: ITERATIONS,
  dataIv: toB64(dataIv),
  ciphertext: toB64(ciphertext),
  wrappers: [
    { role: 'admin', ...adminWrap },
    { role: 'user', ...userWrap },
  ],
};

mkdirSync(resolve(ROOT, 'src/data'), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');

console.log(
  `[encrypt-data] coil=${coil.length}, materialMeta=${materialMeta.length}, press=${press.length}, worker=${worker.length}`,
);
console.log(
  `[encrypt-data] v10: cutSpeed=${cutSpeed.length}, weldSpeed=${weldSpeed.length}, cleanMatrix=${cleanMatrix.length}, freight=${freightMatrix.length}, own=${ownVehicleMatrix.length}, processRates=${processRates.length}`,
);
console.log(`[encrypt-data] v2 envelope → ${OUT} (payload ${ciphertext.length} bytes, 2 wrappers)`);
