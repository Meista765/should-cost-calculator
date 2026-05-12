// Supabase 원격 번들 동기화 — read 는 anon REST, write 는 Edge Function.
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 비어있으면 모든 함수가 null/throw 로 graceful degrade.
import { isV2, type EncryptedBundle, type EncryptedBundleV2 } from './crypto';

export type RemoteBundle = {
  bundle: EncryptedBundleV2;
  etag: string;
  version: number;
};

export class BundleConflictError extends Error {
  constructor(public currentEtag: string | null, public currentVersion: number | null) {
    super('다른 관리자가 먼저 저장했습니다. 새로고침 후 다시 시도하세요.');
    this.name = 'BundleConflictError';
  }
}

const SUPA_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
// 새 모델: sb_publishable_... — 브라우저에 노출 안전. legacy VITE_SUPABASE_ANON_KEY 도 호환.
// 빈 문자열도 "미설정" 으로 취급해야 하므로 || 사용 (?? 는 ''/0 을 통과시킴).
const PUBLISHABLE =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  '';

export function isRemoteConfigured(): boolean {
  return SUPA_URL.length > 0 && PUBLISHABLE.length > 0;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 원격 번들 1회 fetch. 미설정/실패 시 null 반환 (호출자가 로컬 fallback 으로 분기).
export async function fetchRemoteBundle(signal?: AbortSignal): Promise<RemoteBundle | null> {
  if (!isRemoteConfigured()) return null;
  let res: Response;
  try {
    res = await fetch(`${SUPA_URL}/rest/v1/bundles?id=eq.1&select=payload,etag,version`, {
      headers: { apikey: PUBLISHABLE, Authorization: `Bearer ${PUBLISHABLE}` },
      signal,
    });
  } catch (e) {
    if ((e as { name?: string } | null)?.name === 'AbortError') throw e;
    return null;
  }
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ payload: EncryptedBundle; etag: string; version: number }>;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const row = rows[0];
  if (!isV2(row.payload)) return null;
  return { bundle: row.payload, etag: row.etag, version: row.version };
}

// 관리자 저장. 409 → BundleConflictError. 미설정 시 명시적 throw (호출자가 안내 메시지 전환).
export async function pushRemoteBundle(
  bundle: EncryptedBundleV2,
  prevEtag: string,
  adminKey: string,
  label?: string,
): Promise<RemoteBundle> {
  if (!isRemoteConfigured()) {
    throw new Error('원격 동기화가 설정되지 않았습니다. (.env 의 VITE_SUPABASE_URL/ANON_KEY 확인)');
  }
  const res = await fetch(`${SUPA_URL}/functions/v1/save-bundle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: PUBLISHABLE,
      Authorization: `Bearer ${PUBLISHABLE}`,
      'X-Admin-Key': adminKey,
      'If-Match': prevEtag,
    },
    body: JSON.stringify({ bundle, label: label ?? null }),
  });
  if (res.status === 409) {
    const data = await res.json().catch(() => ({})) as { currentEtag?: string; currentVersion?: number };
    throw new BundleConflictError(data.currentEtag ?? null, data.currentVersion ?? null);
  }
  if (res.status === 403) throw new Error('관리자 키가 거부되었습니다. 키를 다시 입력하세요.');
  if (!res.ok) throw new Error(`원격 저장 실패: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { etag: string; version: number };
  return { bundle, etag: data.etag, version: data.version };
}

// 로컬 etag fallback — 원격이 안 줘도 ciphertext 만으로 계산 가능.
export async function computeEtag(bundle: EncryptedBundleV2): Promise<string> {
  return sha256Hex(bundle.ciphertext);
}

// 관리자 키 보관 — localStorage 1회 입력. 누출 시 Worker 측 ADMIN_API_KEY 회전.
const ADMIN_KEY_STORAGE = 'should-cost-admin-api-key';

export function getStoredAdminKey(): string | null {
  try { return localStorage.getItem(ADMIN_KEY_STORAGE); } catch { return null; }
}

export function setStoredAdminKey(key: string | null): void {
  try {
    if (key) localStorage.setItem(ADMIN_KEY_STORAGE, key);
    else localStorage.removeItem(ADMIN_KEY_STORAGE);
  } catch {
    // localStorage 차단 환경 — 무시 (매번 재입력 받게 됨)
  }
}
