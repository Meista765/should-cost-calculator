// remoteBundle.ts — fetch mock 기반 happy path / 409 / 오프라인 / 미설정 시나리오.
// vitest globals + node 환경에서 webcrypto polyfill 필요.
import { webcrypto } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EncryptedBundleV2 } from '../crypto';

const SAMPLE_BUNDLE: EncryptedBundleV2 = {
  version: '2',
  encryptedAt: '2026-05-12T00:00:00.000Z',
  algorithm: 'AES-GCM-256',
  kdf: 'PBKDF2',
  kdfHash: 'SHA-256',
  kdfIterations: 600_000,
  dataIv: 'AAAA',
  ciphertext: 'BBBB',
  wrappers: [
    { role: 'admin', kdfSalt: 's', wrapIv: 'i', wrappedDek: 'd' },
    { role: 'user',  kdfSalt: 's', wrapIv: 'i', wrappedDek: 'd' },
  ],
};

beforeAll(() => {
  if (!globalThis.crypto) {
    (globalThis as { crypto: typeof webcrypto }).crypto = webcrypto;
  }
});

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function stubRemote() {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_xxx');
}

describe('isRemoteConfigured', () => {
  it('환경변수 미설정 시 false', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const mod = await import('../remoteBundle');
    expect(mod.isRemoteConfigured()).toBe(false);
  });
  it('legacy VITE_SUPABASE_ANON_KEY 만 있어도 true (호환)', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'legacy-anon-jwt');
    const mod = await import('../remoteBundle');
    expect(mod.isRemoteConfigured()).toBe(true);
  });
  it('둘 다 있으면 true', async () => {
    stubRemote();
    const mod = await import('../remoteBundle');
    expect(mod.isRemoteConfigured()).toBe(true);
  });
});

describe('fetchRemoteBundle', () => {
  it('200 + v2 envelope → bundle/etag/version 반환', async () => {
    stubRemote();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ payload: SAMPLE_BUNDLE, etag: 'etag-1', version: 7 }],
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchRemoteBundle } = await import('../remoteBundle');
    const r = await fetchRemoteBundle();
    expect(r).not.toBeNull();
    expect(r!.etag).toBe('etag-1');
    expect(r!.version).toBe(7);
    expect(r!.bundle.ciphertext).toBe('BBBB');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('빈 배열 → null', async () => {
    stubRemote();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    const { fetchRemoteBundle } = await import('../remoteBundle');
    expect(await fetchRemoteBundle()).toBeNull();
  });
  it('네트워크 실패 → null', async () => {
    stubRemote();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { fetchRemoteBundle } = await import('../remoteBundle');
    expect(await fetchRemoteBundle()).toBeNull();
  });
  it('미설정 시 fetch 호출 없이 null', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { fetchRemoteBundle } = await import('../remoteBundle');
    expect(await fetchRemoteBundle()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('pushRemoteBundle', () => {
  it('200 → etag/version 반환', async () => {
    stubRemote();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ etag: 'etag-2', version: 8 }),
    }));
    const { pushRemoteBundle } = await import('../remoteBundle');
    const r = await pushRemoteBundle(SAMPLE_BUNDLE, 'etag-1', 'admin-key', 'admin');
    expect(r.etag).toBe('etag-2');
    expect(r.version).toBe(8);
  });
  it('409 → BundleConflictError + currentEtag', async () => {
    stubRemote();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 409, text: async () => '', json: async () => ({ currentEtag: 'etag-X', currentVersion: 9 }),
    }));
    const { pushRemoteBundle, BundleConflictError } = await import('../remoteBundle');
    await expect(pushRemoteBundle(SAMPLE_BUNDLE, 'etag-old', 'admin-key')).rejects.toBeInstanceOf(BundleConflictError);
  });
  it('403 → 관리자 키 에러', async () => {
    stubRemote();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 403, text: async () => 'forbidden',
    }));
    const { pushRemoteBundle } = await import('../remoteBundle');
    await expect(pushRemoteBundle(SAMPLE_BUNDLE, 'etag-1', 'bad-key')).rejects.toThrow('관리자 키');
  });
  it('미설정 → 명시적 throw', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const { pushRemoteBundle } = await import('../remoteBundle');
    await expect(pushRemoteBundle(SAMPLE_BUNDLE, 'etag-1', 'admin-key')).rejects.toThrow('원격 동기화');
  });
});

describe('admin key 저장', () => {
  function makeStore() {
    const m = new Map<string, string>();
    return {
      _map: m,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => { m.set(k, v); },
      removeItem: (k: string) => { m.delete(k); },
    };
  }

  it('sessionStorage round-trip + 레거시 localStorage 키 즉시 제거', async () => {
    stubRemote();
    const sessionStore = makeStore();
    const localStore = makeStore();
    localStore._map.set('should-cost-admin-api-key', 'legacy-leftover'); // 과거 버전 흔적
    vi.stubGlobal('sessionStorage', sessionStore as unknown as Storage);
    vi.stubGlobal('localStorage', localStore as unknown as Storage);

    const { getStoredAdminKey, setStoredAdminKey } = await import('../remoteBundle');

    // 첫 read 가 레거시 localStorage 키를 제거 + sessionStorage 는 비어있음.
    expect(getStoredAdminKey()).toBeNull();
    expect(localStore._map.has('should-cost-admin-api-key')).toBe(false);

    setStoredAdminKey('my-key');
    expect(sessionStore._map.get('should-cost-admin-api-key')).toBe('my-key');
    expect(localStore._map.has('should-cost-admin-api-key')).toBe(false);
    expect(getStoredAdminKey()).toBe('my-key');

    setStoredAdminKey(null);
    expect(getStoredAdminKey()).toBeNull();
  });
});

describe('computeEtag', () => {
  it('ciphertext 가 같으면 같은 etag, 다르면 다른 etag', async () => {
    stubRemote();
    const { computeEtag } = await import('../remoteBundle');
    const a = await computeEtag(SAMPLE_BUNDLE);
    const b = await computeEtag(SAMPLE_BUNDLE);
    const c = await computeEtag({ ...SAMPLE_BUNDLE, ciphertext: 'CCCC' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
