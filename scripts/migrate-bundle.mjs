// 1회용: 기존 v1 encrypted.json 을 v2 envelope (admin/user 두 비번) 으로 변환.
// 마크다운이 없는 환경에서 ciphertext만 가지고 마이그레이션할 때 사용한다.
// 일반적인 갱신은 npm run encrypt:data 로 충분.
//
// 사용법:
//   PowerShell:
//     $env:OLD_PW = "<기존 비번>"
//     $env:ADMIN_PW = "<새 관리자 비번>"
//     $env:USER_PW = "<새 사용자 비번>"
//     node scripts/migrate-bundle.mjs
//
// 출력: src/data/encrypted.json (v2). 기존 파일은 백업되지 않으므로 사전에 복사 권장.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const IN = resolve(ROOT, 'src/data/encrypted.json');
const OUT = IN;

const OLD = process.env.OLD_PW;
const ADMIN = process.env.ADMIN_PW;
const USER = process.env.USER_PW;
if (!OLD || !ADMIN || !USER) {
  console.error('환경변수 OLD_PW, ADMIN_PW, USER_PW 모두 필요합니다.');
  process.exit(1);
}
if (ADMIN === USER) {
  console.error('관리자 비번과 사용자 비번이 동일합니다.');
  process.exit(1);
}

function fromB64(s) {
  return Uint8Array.from(Buffer.from(s, 'base64'));
}
const toB64 = (b) => Buffer.from(b).toString('base64');

const bundle = JSON.parse(readFileSync(IN, 'utf8'));
if (bundle.version === '2') {
  console.error('이미 v2 번들입니다. 마이그레이션 불필요.');
  process.exit(1);
}
if (!bundle.salt || !bundle.iv || !bundle.ciphertext) {
  console.error('v1 번들 형식이 아닙니다.');
  process.exit(1);
}

const ITERATIONS = bundle.kdfIterations ?? 600_000;
const enc = new TextEncoder();

// 1) v1 복호화
const baseKey = await webcrypto.subtle.importKey(
  'raw',
  enc.encode(OLD),
  { name: 'PBKDF2' },
  false,
  ['deriveKey'],
);
const v1Key = await webcrypto.subtle.deriveKey(
  { name: 'PBKDF2', salt: fromB64(bundle.salt), iterations: ITERATIONS, hash: 'SHA-256' },
  baseKey,
  { name: 'AES-GCM', length: 256 },
  false,
  ['decrypt'],
);
let plaintext;
try {
  plaintext = await webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(bundle.iv) },
    v1Key,
    fromB64(bundle.ciphertext),
  );
} catch {
  console.error('OLD_PW로 복호화 실패. 비밀번호 확인.');
  process.exit(1);
}

// 2) 새 DEK로 payload 재암호화
const dekRaw = webcrypto.getRandomValues(new Uint8Array(32));
const dataIv = webcrypto.getRandomValues(new Uint8Array(12));
const dek = await webcrypto.subtle.importKey(
  'raw',
  dekRaw,
  { name: 'AES-GCM', length: 256 },
  true,
  ['encrypt', 'decrypt'],
);
const ciphertext = new Uint8Array(
  await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv: dataIv }, dek, plaintext),
);

// 3) admin/user 두 wrapper 생성
async function wrap(pw) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const wrapIv = webcrypto.getRandomValues(new Uint8Array(12));
  const bk = await webcrypto.subtle.importKey(
    'raw',
    enc.encode(pw),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  const wk = await webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    bk,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const wrappedDek = new Uint8Array(
    await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv: wrapIv }, wk, dekRaw),
  );
  return { kdfSalt: toB64(salt), wrapIv: toB64(wrapIv), wrappedDek: toB64(wrappedDek) };
}

const adminWrap = await wrap(ADMIN);
const userWrap = await wrap(USER);

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
console.log(`[migrate-bundle] v1 → v2 완료 → ${OUT}`);
console.log('[migrate-bundle] 주의: v1의 평문 DB는 v10 sheet 데이터가 없을 수 있으므로');
console.log('  관리자 모드로 들어가 누락 항목을 채우거나, npm run encrypt:data 로 재빌드 권장.');
