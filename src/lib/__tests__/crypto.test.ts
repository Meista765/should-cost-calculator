// crypto.ts envelope round-trip 검증.
// node 환경에서 globalThis.crypto = webcrypto 로 polyfill (vitest config).
import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  decryptBundle,
  reencryptDb,
  rotatePassword,
  type EncryptedBundleV2,
} from '../crypto';
import type { Db } from '../../types/domain';

const ADMIN = 'AdminPasswordA1!_secure_long';
const USER = 'UserPasswordU2#_also_long_pw';

// 빌드 스크립트와 동일한 로직으로 v2 envelope 생성.
async function buildV2Bundle(db: Db): Promise<EncryptedBundleV2> {
  const ITERATIONS = 600_000;
  const enc = new TextEncoder();
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
    await webcrypto.subtle.encrypt(
      { name: 'AES-GCM', iv: dataIv },
      dek,
      enc.encode(JSON.stringify(db)),
    ),
  );
  async function wrap(password: string) {
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
      await webcrypto.subtle.encrypt(
        { name: 'AES-GCM', iv: wrapIv },
        wrapKey,
        dekRaw,
      ),
    );
    const toB64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
    return { kdfSalt: toB64(salt), wrapIv: toB64(wrapIv), wrappedDek: toB64(wrappedDek) };
  }
  const toB64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
  const adminWrap = await wrap(ADMIN);
  const userWrap = await wrap(USER);
  return {
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
}

const MINI_DB = {
  coil: [],
  press: [],
  worker: [],
  materialMeta: [{ grade: 'STS304', gradeRaw: 'STS304', displayName: 'STS304', cutKey: 'SUS304', group: 'STS', density: 7.93 }],
  cutSpeed: [],
  pierceTime: {},
  bendTime: {},
  nctFeat: { shapes: [], tap: [] },
  weldSpeed: [],
  cleanMatrix: [],
  freightMatrix: [],
  ownVehicleMatrix: [],
  processRates: [],
  paint: { thkUm: 70, densityGcm3: 1.5, efficiency: 0.65 },
  assumptions: { overheadRate: 0.18, marginRate: 0.10, setupMin: 30, scrapRateDefault: 0.15, avgSpeedKmh: 60, loadHr: 1, spotSec: 1.5 },
} as unknown as Db;

beforeAll(() => {
  // node 환경에서 brower crypto API 사용 가능하게.
  if (!globalThis.crypto) {
    (globalThis as { crypto: typeof webcrypto }).crypto = webcrypto;
  }
});

describe('envelope round-trip', () => {
  it('admin pw 로 unlock → role=admin, db 일치', async () => {
    const b = await buildV2Bundle(MINI_DB);
    const r = await decryptBundle(b, ADMIN);
    expect(r.role).toBe('admin');
    expect(r.db.materialMeta[0].grade).toBe('STS304');
  });
  it('user pw 로 unlock → role=user, 동일 db', async () => {
    const b = await buildV2Bundle(MINI_DB);
    const r = await decryptBundle(b, USER);
    expect(r.role).toBe('user');
    expect(r.db.materialMeta[0].grade).toBe('STS304');
  });
  it('잘못된 pw → 예외', async () => {
    const b = await buildV2Bundle(MINI_DB);
    await expect(decryptBundle(b, 'wrong-password!!')).rejects.toThrow();
  });
});

describe('비밀번호 회전', () => {
  it('admin pw 회전 → 새 pw 성공, 옛 pw 실패, user pw 무변경', async () => {
    let b = await buildV2Bundle(MINI_DB);
    const r1 = await decryptBundle(b, ADMIN);
    const NEW_ADMIN = 'NewAdminPwA3@_strong_pwd';
    b = await rotatePassword(b, r1.dek, 'admin', NEW_ADMIN);
    // 새 admin pw OK
    const r2 = await decryptBundle(b, NEW_ADMIN);
    expect(r2.role).toBe('admin');
    // 옛 admin pw 실패
    await expect(decryptBundle(b, ADMIN)).rejects.toThrow();
    // user pw 유지
    const r3 = await decryptBundle(b, USER);
    expect(r3.role).toBe('user');
  });
});

describe('DB 재암호화', () => {
  it('관리자가 DB 편집 → 재암호화 → 두 비번 모두 새 DB 복호화', async () => {
    let b = await buildV2Bundle(MINI_DB);
    const r1 = await decryptBundle(b, ADMIN);
    const edited: Db = { ...r1.db, paint: { thkUm: 99, densityGcm3: 2.0, efficiency: 0.8 } };
    b = await reencryptDb(edited, r1.dek, b, r1.role);
    const r2 = await decryptBundle(b, USER);
    expect(r2.db.paint.thkUm).toBe(99);
    expect(r2.db.paint.efficiency).toBe(0.8);
  });

  it('user role 로 reencryptDb 호출 시 throw — 권한 분리 가드', async () => {
    const b = await buildV2Bundle(MINI_DB);
    const r = await decryptBundle(b, USER);
    expect(r.role).toBe('user');
    const edited: Db = { ...r.db, paint: { thkUm: 1, densityGcm3: 1, efficiency: 0.1 } };
    // user 비번으로 unlock 한 사람은 DEK 를 가지고 있더라도 reencryptDb 호출 차단.
    await expect(reencryptDb(edited, r.dek, b, r.role)).rejects.toThrow(/admin role required/);
  });
});
