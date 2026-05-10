// Data/*.md 4개를 단일 db 객체로 합쳐 AES-GCM-256으로 암호화한 뒤
// src/data/encrypted.json에 저장한다. 결과물은 commit/push 가능 (평문 가격 없음).
//
// 사용법:
//   PowerShell:  $env:BUILD_DB_PASSWORD = "<공유 비밀번호>"; npm run encrypt:data
//   bash:        BUILD_DB_PASSWORD='<공유 비밀번호>' npm run encrypt:data
//
// 비밀번호는 사내에 공유한다. 변경 시 다시 실행 → commit/push → 사내 공지.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATA = (p) => resolve(ROOT, 'Data', p);
const OUT = resolve(ROOT, 'src/data/encrypted.json');

const password = process.env.BUILD_DB_PASSWORD;
if (!password) {
  console.error('환경변수 BUILD_DB_PASSWORD가 필요합니다.');
  console.error('  PowerShell:  $env:BUILD_DB_PASSWORD = "your-password"');
  console.error('  bash:        export BUILD_DB_PASSWORD=your-password');
  process.exit(1);
}

// 공개 GitHub Pages에 ciphertext가 노출되므로 비밀번호 강도가 사실상 유일한 방어선이다.
// 16자 이상 + 4종(소문자/대문자/숫자/특수문자) 모두 포함하도록 강제한다.
function assertStrongPassword(pw) {
  const errors = [];
  if (pw.length < 16) errors.push(`최소 16자 (현재 ${pw.length}자)`);
  if (!/[a-z]/.test(pw)) errors.push('소문자 포함');
  if (!/[A-Z]/.test(pw)) errors.push('대문자 포함');
  if (!/[0-9]/.test(pw)) errors.push('숫자 포함');
  if (!/[^A-Za-z0-9]/.test(pw)) errors.push('특수문자 포함');
  if (errors.length > 0) {
    console.error('BUILD_DB_PASSWORD 강도 부족: ' + errors.join(', '));
    console.error('  공개 저장소에 ciphertext가 노출되므로 짧거나 단순한 비밀번호는 오프라인 무차별 대입에 취약합니다.');
    process.exit(1);
  }
}
assertStrongPassword(password);

// === .md 파싱 (build-data.mjs와 동일 로직) ===
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

const coilMd = readFileSync(DATA('Material/steel coil cost.md'), 'utf8');
const gravMd = readFileSync(DATA('Material/steel specific gravity.md'), 'utf8');
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

const gravity = parseTable(gravMd)
  .map((r) => ({
    grade: canonicalGrade(r['강종']),
    displayName: r['강종'].trim(),
    gravity: num(r['비중(g/cm³)'], `gravity ${r['강종']}`),
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

const db = { coil, gravity, press, worker };

// === 암호화 ===
const enc = new TextEncoder();
const plaintext = enc.encode(JSON.stringify(db));
const salt = webcrypto.getRandomValues(new Uint8Array(16));
const iv = webcrypto.getRandomValues(new Uint8Array(12));
const ITERATIONS = 600_000;

const baseKey = await webcrypto.subtle.importKey(
  'raw',
  enc.encode(password),
  { name: 'PBKDF2' },
  false,
  ['deriveKey'],
);
const aesKey = await webcrypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  baseKey,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt'],
);
const ciphertext = new Uint8Array(
  await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext),
);

const toB64 = (b) => Buffer.from(b).toString('base64');

const out = {
  version: '1',
  encryptedAt: new Date().toISOString(),
  algorithm: 'AES-GCM-256',
  kdf: 'PBKDF2',
  kdfHash: 'SHA-256',
  kdfIterations: ITERATIONS,
  salt: toB64(salt),
  iv: toB64(iv),
  ciphertext: toB64(ciphertext),
};

mkdirSync(resolve(ROOT, 'src/data'), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');

console.log(
  `[encrypt-data] coil=${coil.length}, gravity=${gravity.length}, press=${press.length}, worker=${worker.length}`,
);
console.log(`[encrypt-data] 암호화된 번들 → src/data/encrypted.json (${ciphertext.length} bytes)`);
console.log('[encrypt-data] git add src/data/encrypted.json && git commit -m "data: refresh" && git push');
