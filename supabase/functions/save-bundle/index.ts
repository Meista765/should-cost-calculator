// Supabase Edge Function: save-bundle
//
// 1) X-Admin-Key 헤더로 관리자 인증 (timing-safe 비교)
// 2) v2 envelope 형태 검증
// 3) Optimistic concurrency: If-Match 헤더의 etag 와 현재 row 의 etag 일치할 때만 UPDATE
// 4) bundle_history 에 append-only audit insert
// 5) GitHub App 토큰으로 repo 의 src/data/encrypted.json 미러 commit (best-effort)
//
// Env (Supabase secrets):
//   SUPABASE_URL                       (자동 주입, 변경 없음)
//   SUPABASE_SECRET_KEYS               (자동 주입, 새 키 모델 — JSON string {default: sb_secret_...})
//                                       legacy: SUPABASE_SERVICE_ROLE_KEY 도 fallback 으로 사용
//   ADMIN_API_KEY                — 관리자에게 별도 채널로 전달한 32+자 random
//   GITHUB_APP_ID                — GitHub App 의 App ID (숫자)
//   GITHUB_APP_PRIVATE_KEY_PEM   — App 의 private key (PEM 전체, 줄바꿈 포함)
//   GITHUB_INSTALLATION_ID       — 해당 repo 설치의 installation id (숫자)
//   GITHUB_REPO                  — "owner/repo"
//   GITHUB_BUNDLE_PATH           — repo 안 번들 경로 (기본 "src/data/encrypted.json")
//   GITHUB_BRANCH                — 기본 "main"
//
// Deploy: supabase functions deploy save-bundle --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type EncryptedBundleV2 = {
  version: "2";
  encryptedAt: string;
  algorithm: "AES-GCM-256";
  kdf: "PBKDF2";
  kdfHash: "SHA-256";
  kdfIterations: number;
  dataIv: string;
  ciphertext: string;
  wrappers: Array<{ role: "admin" | "user"; kdfSalt: string; wrapIv: string; wrappedDek: string }>;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key, if-match",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// 새 키 모델 우선, legacy service_role 로 graceful fallback.
function resolveSecretKey(): string {
  const newKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (newKeys) {
    try {
      const parsed = JSON.parse(newKeys) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch (e) {
      console.warn("[save-bundle] SUPABASE_SECRET_KEYS 파싱 실패, legacy 로 fallback:", e instanceof Error ? e.message : String(e));
    }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("SUPABASE_SECRET_KEYS 또는 SUPABASE_SERVICE_ROLE_KEY 둘 다 미설정");
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isV2Envelope(b: unknown): b is EncryptedBundleV2 {
  if (!b || typeof b !== "object") return false;
  const o = b as Record<string, unknown>;
  if (o.version !== "2") return false;
  if (typeof o.ciphertext !== "string" || typeof o.dataIv !== "string") return false;
  if (!Array.isArray(o.wrappers) || o.wrappers.length === 0) return false;
  for (const w of o.wrappers as Array<Record<string, unknown>>) {
    if (w.role !== "admin" && w.role !== "user") return false;
    if (typeof w.kdfSalt !== "string" || typeof w.wrapIv !== "string" || typeof w.wrappedDek !== "string") return false;
  }
  return true;
}

// ── GitHub App auth + commit ────────────────────────────────────────────────

function b64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): Uint8Array {
  const cleaned = pem.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(cleaned);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function makeAppJwt(appId: string, pem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64UrlEncode(JSON.stringify({ iat: now - 30, exp: now + 9 * 60, iss: appId }));
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data)));
  return `${data}.${b64UrlEncode(sig)}`;
}

async function installationToken(appId: string, pem: string, installationId: string): Promise<string> {
  const jwt = await makeAppJwt(appId, pem);
  const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json", "User-Agent": "should-cost-save-bundle" },
  });
  if (!res.ok) throw new Error(`GitHub installation token failed: ${res.status} ${await res.text()}`);
  const { token } = await res.json() as { token: string };
  return token;
}

async function commitMirror(bundle: EncryptedBundleV2, version: number, label: string | null): Promise<void> {
  const appId = Deno.env.get("GITHUB_APP_ID");
  const pem = Deno.env.get("GITHUB_APP_PRIVATE_KEY_PEM");
  const installId = Deno.env.get("GITHUB_INSTALLATION_ID");
  const repo = Deno.env.get("GITHUB_REPO");
  if (!appId || !pem || !installId || !repo) {
    console.warn("[save-bundle] GitHub mirror env 미설정 — 미러 스킵");
    return;
  }
  const path = Deno.env.get("GITHUB_BUNDLE_PATH") ?? "src/data/encrypted.json";
  const branch = Deno.env.get("GITHUB_BRANCH") ?? "main";
  const token = await installationToken(appId, pem, installId);
  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "should-cost-save-bundle",
    "Content-Type": "application/json",
  };

  // 현재 sha 조회 (파일 없으면 새로 생성)
  let prevSha: string | undefined;
  const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`, { headers });
  if (getRes.ok) {
    const cur = await getRes.json() as { sha?: string };
    prevSha = cur.sha;
  } else if (getRes.status !== 404) {
    throw new Error(`GitHub GET contents failed: ${getRes.status} ${await getRes.text()}`);
  }

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(bundle, null, 2) + "\n")));
  const labelSlug = (label ?? "admin").replace(/[\r\n]/g, " ").slice(0, 64);
  const msg = `[admin-save] v${version} ${new Date().toISOString()} ${labelSlug}`;
  const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ message: msg, content, branch, ...(prevSha ? { sha: prevSha } : {}) }),
  });
  if (!putRes.ok) {
    throw new Error(`GitHub PUT contents failed: ${putRes.status} ${await putRes.text()}`);
  }
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const adminKeyEnv = Deno.env.get("ADMIN_API_KEY");
  if (!adminKeyEnv) return json(500, { error: "ADMIN_API_KEY 미설정" });
  const adminKeyReq = req.headers.get("X-Admin-Key") ?? "";
  if (!timingSafeEqual(adminKeyReq, adminKeyEnv)) return json(403, { error: "forbidden" });

  let body: { bundle?: unknown; label?: string | null };
  try { body = await req.json(); } catch { return json(400, { error: "invalid json" }); }
  if (!isV2Envelope(body.bundle)) return json(400, { error: "invalid v2 envelope" });
  const bundle = body.bundle;
  const label = typeof body.label === "string" ? body.label : null;

  const prevEtag = req.headers.get("If-Match") ?? "";
  const newEtag = await sha256Hex(bundle.ciphertext);

  let secretKey: string;
  try { secretKey = resolveSecretKey(); }
  catch (e) { return json(500, { error: e instanceof Error ? e.message : String(e) }); }
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    secretKey,
    { auth: { persistSession: false } },
  );

  // 현재 row 조회 (없으면 seed 필요 — 412 로 거부)
  const { data: cur, error: curErr } = await supa.from("bundles").select("version, etag").eq("id", 1).maybeSingle();
  if (curErr) return json(500, { error: `db read failed: ${curErr.message}` });
  if (!cur) return json(412, { error: "no bundle seeded — scripts/seed-supabase.mjs 로 초기 row 먼저 삽입" });

  if (cur.etag !== prevEtag) return json(409, { error: "conflict", currentEtag: cur.etag, currentVersion: cur.version });

  const nextVersion = cur.version + 1;
  const { data: upd, error: updErr } = await supa.from("bundles")
    .update({ payload: bundle, etag: newEtag, version: nextVersion, updated_at: new Date().toISOString(), updated_by_label: label })
    .eq("id", 1).eq("etag", prevEtag)
    .select("version, etag").single();
  if (updErr || !upd) return json(409, { error: "conflict (race)", currentEtag: cur.etag });

  // audit (best-effort — 실패해도 client 응답은 200)
  const { error: histErr } = await supa.from("bundle_history").insert({
    version: upd.version, etag: upd.etag, payload: bundle, updated_by_label: label,
  });
  if (histErr) console.error("[save-bundle] history insert failed:", histErr.message);

  // GitHub mirror (best-effort)
  try { await commitMirror(bundle, upd.version, label); }
  catch (e) { console.error("[save-bundle] mirror failed:", e instanceof Error ? e.message : String(e)); }

  return json(200, { version: upd.version, etag: upd.etag });
});
