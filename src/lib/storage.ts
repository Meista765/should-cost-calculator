// db를 브라우저 localStorage에만 저장한다. 네트워크로 전송하지 않는다.
import type { Db } from '../types/domain';

const KEY = 'should-cost-db-v1';
const META_KEY = 'should-cost-db-meta-v1';

export type StoredMeta = { importedAt: string };

export function loadDb(): Db | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Db;
  } catch {
    return null;
  }
}

export function loadMeta(): StoredMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredMeta;
  } catch {
    return null;
  }
}

export function saveDb(db: Db): StoredMeta {
  const meta: StoredMeta = { importedAt: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(db));
  localStorage.setItem(META_KEY, JSON.stringify(meta));
  return meta;
}

export function clearDb() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(META_KEY);
}
