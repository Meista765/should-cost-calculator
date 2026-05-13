// 이중 envelope (admin/user) AES-GCM-256 + PBKDF2 번들 복호화.
// v1 레거시 번들도 지원 (마이그레이션 전 임시 호환).
import type { Db } from '../types/domain';

export type WrapperRole = 'admin' | 'user';

export type EncryptedBundleV2 = {
  version: '2';
  encryptedAt: string;
  algorithm: 'AES-GCM-256';
  kdf: 'PBKDF2';
  kdfHash: 'SHA-256';
  kdfIterations: number;
  dataIv: string;          // b64
  ciphertext: string;      // b64
  wrappers: Array<{
    role: WrapperRole;
    kdfSalt: string;       // b64
    wrapIv: string;        // b64
    wrappedDek: string;    // b64
  }>;
};

export type EncryptedBundleV1 = {
  version: '1' | string;
  encryptedAt: string;
  algorithm: 'AES-GCM-256';
  kdf: 'PBKDF2';
  kdfHash: 'SHA-256';
  kdfIterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

export type EncryptedBundle = EncryptedBundleV2 | EncryptedBundleV1;

function fromB64(s: string): ArrayBuffer {
  const bin = atob(s);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

function toB64(buf: Uint8Array | ArrayBuffer): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

function u8ToBuffer(u: Uint8Array): ArrayBuffer {
  if (u.byteOffset === 0 && u.byteLength === u.buffer.byteLength && u.buffer instanceof ArrayBuffer) {
    return u.buffer;
  }
  const copy = new ArrayBuffer(u.byteLength);
  new Uint8Array(copy).set(u);
  return copy;
}

export function isV2(b: EncryptedBundle): b is EncryptedBundleV2 {
  return (b as EncryptedBundleV2).version === '2' && Array.isArray((b as EncryptedBundleV2).wrappers);
}

async function derivePbkdf2Key(
  password: string,
  salt: ArrayBuffer | Uint8Array,
  iterations: number,
  hash: string,
  usage: 'encrypt' | 'decrypt',
): Promise<CryptoKey> {
  const pwBytes = u8ToBuffer(new TextEncoder().encode(password));
  const saltBuf = salt instanceof Uint8Array ? u8ToBuffer(salt) : salt;
  const baseKey = await crypto.subtle.importKey(
    'raw',
    pwBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBuf, iterations, hash },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

export type DecryptResult = {
  db: Db;
  role: WrapperRole;
  dek: CryptoKey;    // 메모리에서만 사용. 직렬화 금지.
};

// 기존 nctFeat 형태 ({Embossing:..., tap:{M3:...}}) 를 신 배열 형식 ({shapes:[], tap:[]}) 으로 변환.
// 이미 신 형식이면 무변경. encrypted.json 재암호화 전까지의 호환 레이어.
function migrateNctFeat(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return { shapes: [], tap: [] };
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r.shapes) && Array.isArray(r.tap)) return raw;
  const shapes: Array<{ shape: string; sec: number }> = [];
  for (const k of ['Embossing', 'Burring', 'Louver', 'Countersink', 'KnockOut']) {
    if (typeof r[k] === 'number') shapes.push({ shape: k, sec: r[k] as number });
  }
  const tap: Array<{ size: string; sec: number }> = [];
  if (r.tap && typeof r.tap === 'object' && !Array.isArray(r.tap)) {
    for (const [size, sec] of Object.entries(r.tap as Record<string, unknown>)) {
      if (typeof sec === 'number') tap.push({ size, sec });
    }
  }
  return { shapes, tap };
}

function normalizeDb(raw: unknown): Db {
  if (!raw || typeof raw !== 'object') return raw as Db;
  const r = raw as Record<string, unknown>;
  if (r.nctFeat) r.nctFeat = migrateNctFeat(r.nctFeat);
  return raw as Db;
}

export async function decryptBundle(
  bundle: EncryptedBundle,
  password: string,
): Promise<DecryptResult> {
  if (!isV2(bundle)) {
    // 레거시 v1: PBKDF2 → 직접 payload 복호화. role='admin' (기존 동작 호환).
    return decryptLegacyV1(bundle, password);
  }
  for (const w of bundle.wrappers) {
    try {
      const wrapKey = await derivePbkdf2Key(
        password,
        fromB64(w.kdfSalt),
        bundle.kdfIterations,
        bundle.kdfHash,
        'decrypt',
      );
      const dekRaw = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromB64(w.wrapIv) },
        wrapKey,
        fromB64(w.wrappedDek),
      );
      const dek = await crypto.subtle.importKey(
        'raw',
        dekRaw,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt'],
      );
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromB64(bundle.dataIv) },
        dek,
        fromB64(bundle.ciphertext),
      );
      const text = new TextDecoder().decode(plaintext);
      const db = normalizeDb(JSON.parse(text));
      return { db, role: w.role, dek };
    } catch {
      continue;
    }
  }
  throw new Error('비밀번호가 올바르지 않습니다.');
}

async function decryptLegacyV1(
  bundle: EncryptedBundleV1,
  password: string,
): Promise<DecryptResult> {
  const aesKey = await derivePbkdf2Key(
    password,
    fromB64(bundle.salt),
    bundle.kdfIterations,
    bundle.kdfHash,
    'decrypt',
  );
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(bundle.iv) },
      aesKey,
      fromB64(bundle.ciphertext),
    );
  } catch {
    throw new Error('비밀번호가 올바르지 않습니다.');
  }
  const text = new TextDecoder().decode(plaintext);
  const db = normalizeDb(JSON.parse(text));
  // 레거시는 단일 비번 — admin으로 취급, dek는 임시(이후 v2로 마이그레이션 필요).
  const dummyDek = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  return { db, role: 'admin', dek: dummyDek };
}

// 관리자만 호출. payload(=DEK로 암호화된 ciphertext)는 무변경, wrappers의 해당 role 항목만 재생성.
export async function rotatePassword(
  bundle: EncryptedBundleV2,
  dek: CryptoKey,
  role: WrapperRole,
  newPassword: string,
): Promise<EncryptedBundleV2> {
  const dekRaw = await crypto.subtle.exportKey('raw', dek);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const saltBuf = u8ToBuffer(salt);
  const wrapIvBuf = u8ToBuffer(wrapIv);
  const wrapKey = await derivePbkdf2Key(
    newPassword,
    saltBuf,
    bundle.kdfIterations,
    bundle.kdfHash,
    'encrypt',
  );
  const wrappedDek = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wrapIvBuf }, wrapKey, dekRaw),
  );
  const newWrapper = {
    role,
    kdfSalt: toB64(salt),
    wrapIv: toB64(wrapIv),
    wrappedDek: toB64(wrappedDek),
  };
  const wrappers = bundle.wrappers.map((w) => (w.role === role ? newWrapper : w));
  return {
    ...bundle,
    encryptedAt: new Date().toISOString(),
    wrappers,
  };
}

// 관리자가 DB를 편집 후 호출. DEK는 그대로, payload만 재암호화.
// 방어적 가드: user role 보유자는 DEK를 갖더라도 재암호화 차단.
//   (서버측 X-Admin-Key 검증과 별개로 코드 레벨에서도 권한 분리)
export async function reencryptDb(
  db: Db,
  dek: CryptoKey,
  baseBundle: EncryptedBundleV2,
  role: WrapperRole,
): Promise<EncryptedBundleV2> {
  if (role !== 'admin') {
    throw new Error('admin role required to re-encrypt bundle');
  }
  const dataIv = crypto.getRandomValues(new Uint8Array(12));
  const dataIvBuf = u8ToBuffer(dataIv);
  const plaintext = u8ToBuffer(new TextEncoder().encode(JSON.stringify(db)));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: dataIvBuf }, dek, plaintext),
  );
  return {
    ...baseBundle,
    encryptedAt: new Date().toISOString(),
    dataIv: toB64(dataIv),
    ciphertext: toB64(ciphertext),
  };
}

// 빌드 스크립트와 동일한 강도 정책 (UI 측에서도 사용).
export function checkPasswordStrength(pw: string): { ok: boolean; reasons: string[] } {
  const r: string[] = [];
  if (pw.length < 16) r.push(`최소 16자 (현재 ${pw.length}자)`);
  if (!/[a-z]/.test(pw)) r.push('소문자 포함');
  if (!/[A-Z]/.test(pw)) r.push('대문자 포함');
  if (!/[0-9]/.test(pw)) r.push('숫자 포함');
  if (!/[^A-Za-z0-9]/.test(pw)) r.push('특수문자 포함');
  return { ok: r.length === 0, reasons: r };
}
