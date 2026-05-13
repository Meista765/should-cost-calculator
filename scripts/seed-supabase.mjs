// 최초 1회: src/data/encrypted.json 을 Supabase bundles 테이블에 id=1 row 로 삽입.
// secret key (또는 legacy service_role key) 가 필요하므로 admin 본인 PC 에서만 실행.
//
// ⚠ SECURITY:
//   SUPABASE_SECRET_KEY 는 RLS 를 우회하므로 .env.local 에 영속 저장하지 말 것.
//   이 스크립트 실행 시점에만 인라인 환경변수로 주입하고, 사용 직후 셸 히스토리에서 제거.
//   CI/원격 자동화 절대 금지 — 운영 환경에서는 외부 시크릿 매니저 사용.
//
// 사용법 (새 키 모델, 인라인 주입):
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SECRET_KEY=sb_secret_... \
//   node scripts/seed-supabase.mjs [--label "초기 시드"]
//
// legacy 키 모델도 호환:
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/seed-supabase.mjs
//
// 이후의 갱신은 AdminPanel 의 "저장 & 재암호화" 가 Edge Function 으로 처리. 이 스크립트는 재실행하지 말 것.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BUNDLE_PATH = resolve(ROOT, 'src/data/encrypted.json');

const SUPA_URL = process.env.SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SECRET) {
  console.error('SUPABASE_URL + (SUPABASE_SECRET_KEY 또는 legacy SUPABASE_SERVICE_ROLE_KEY) env 가 필요합니다.');
  process.exit(1);
}

const labelIdx = process.argv.indexOf('--label');
const label = labelIdx > -1 ? process.argv[labelIdx + 1] : 'seed';

const bundleRaw = readFileSync(BUNDLE_PATH, 'utf8');
const bundle = JSON.parse(bundleRaw);
if (bundle.version !== '2' || !Array.isArray(bundle.wrappers)) {
  console.error('v2 envelope 가 아닙니다. npm run encrypt:data 를 먼저 실행하세요.');
  process.exit(1);
}

async function sha256Hex(s) {
  const buf = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const etag = await sha256Hex(bundle.ciphertext);

// 이미 row 가 있으면 거부 (idempotency — 실수로 덮어쓰기 방지).
const getRes = await fetch(`${SUPA_URL}/rest/v1/bundles?id=eq.1&select=id,version,etag`, {
  headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
});
if (!getRes.ok) {
  console.error(`[seed] bundles SELECT 실패: ${getRes.status} ${await getRes.text()}`);
  process.exit(1);
}
const rows = await getRes.json();
if (Array.isArray(rows) && rows.length > 0) {
  console.error('[seed] 이미 row 가 있습니다. Edge Function 으로 갱신하세요. (강제 재시드는 SQL 로 수동 DELETE 후 재실행)');
  console.error(`        현재 version=${rows[0].version}, etag=${rows[0].etag}`);
  process.exit(1);
}

const insertRes = await fetch(`${SUPA_URL}/rest/v1/bundles`, {
  method: 'POST',
  headers: {
    apikey: SECRET,
    Authorization: `Bearer ${SECRET}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  },
  body: JSON.stringify({ id: 1, version: 1, etag, payload: bundle, updated_by_label: label }),
});
if (!insertRes.ok) {
  console.error(`[seed] INSERT 실패: ${insertRes.status} ${await insertRes.text()}`);
  process.exit(1);
}
const inserted = await insertRes.json();
console.log(`[seed] OK — version=1 etag=${etag}`);
console.log(`[seed] row:`, inserted[0] ? { id: inserted[0].id, version: inserted[0].version, etag: inserted[0].etag, updated_by_label: inserted[0].updated_by_label } : inserted);
