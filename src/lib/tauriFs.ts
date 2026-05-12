// 번들 로드/저장 — 원격(Supabase) → 로컬 캐시(Tauri AppData / Web localStorage) → 정적 번들 순.
// 쓰기 측: Tauri 환경에서만 AppData 캐시를 갱신. 원격 publish 는 src/lib/remoteBundle.ts 가 담당.
import type { EncryptedBundle, EncryptedBundleV2 } from './crypto';
import { isV2 } from './crypto';
import { computeEtag, fetchRemoteBundle, isRemoteConfigured } from './remoteBundle';

type TauriGlobal = {
  __TAURI_INTERNALS__?: unknown;
};

function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as Window & TauriGlobal).__TAURI_INTERNALS__);
}

export type LoadedBundle = {
  bundle: EncryptedBundle;
  etag: string | null;          // 원격 동기화 etag. 로컬/정적 fallback 인 경우 sha256(ciphertext).
  source: 'remote' | 'local-cache' | 'static';
};

const LS_CACHE_KEY = 'should-cost-cached-bundle-v1';

type WebCache = { bundle: EncryptedBundleV2; etag: string };

function readWebCache(): WebCache | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WebCache;
    if (!isV2(parsed.bundle)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeWebCache(cache: WebCache): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(LS_CACHE_KEY, JSON.stringify(cache)); } catch { /* quota / disabled — 무시 */ }
}

async function readTauriBundle(): Promise<EncryptedBundle | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const json = await invoke<string>('read_bundle');
    return JSON.parse(json) as EncryptedBundle;
  } catch {
    return null;
  }
}

async function readStaticBundle(): Promise<EncryptedBundle> {
  const mod = await import('../data/encrypted.json');
  return mod.default as EncryptedBundle;
}

export async function loadBundle(): Promise<LoadedBundle> {
  // 1) 원격 우선 — 설정돼 있고 네트워크 OK 인 경우.
  if (isRemoteConfigured()) {
    try {
      const r = await fetchRemoteBundle();
      if (r) {
        // 캐시 갱신 (Tauri = AppData, Web = localStorage). 실패해도 본 흐름은 계속.
        if (isTauri()) {
          try { await saveBundle(r.bundle); } catch { /* no-op */ }
        } else {
          writeWebCache({ bundle: r.bundle, etag: r.etag });
        }
        return { bundle: r.bundle, etag: r.etag, source: 'remote' };
      }
    } catch {
      // 네트워크 실패 → fallback 진행.
    }
  }

  // 2) 로컬 캐시.
  if (isTauri()) {
    const cached = await readTauriBundle();
    if (cached) {
      const etag = isV2(cached) ? await computeEtag(cached) : null;
      return { bundle: cached, etag, source: 'local-cache' };
    }
  } else {
    const cached = readWebCache();
    if (cached) {
      return { bundle: cached.bundle, etag: cached.etag, source: 'local-cache' };
    }
  }

  // 3) 빌드 타임 정적 번들 (cold start + 오프라인).
  const stat = await readStaticBundle();
  const etag = isV2(stat) ? await computeEtag(stat) : null;
  return { bundle: stat, etag, source: 'static' };
}

export async function saveBundle(b: EncryptedBundleV2): Promise<void> {
  if (!isTauri()) {
    // 웹 환경에서는 메모리/localStorage 캐시만 갱신 — AdminPanel 이 호출 후 별도로 원격 publish 함.
    writeWebCache({ bundle: b, etag: await computeEtag(b) });
    return;
  }
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('write_bundle', { json: JSON.stringify(b, null, 2) });
}

export function isRunningUnderTauri(): boolean {
  return isTauri();
}
