-- bundles: 현재 ciphertext 단일행 (id=1 고정)
create table if not exists public.bundles (
  id               smallint primary key default 1 check (id = 1),
  version          integer  not null default 1,
  etag             text     not null,
  payload          jsonb    not null,
  updated_at       timestamptz not null default now(),
  updated_by_label text
);

-- bundle_history: append-only audit log
create table if not exists public.bundle_history (
  id               bigserial primary key,
  version          integer  not null,
  etag             text     not null,
  payload          jsonb    not null,
  updated_at       timestamptz not null default now(),
  updated_by_label text
);

-- RLS: anon 은 read 만, write 는 service_role (Edge Function) 만
alter table public.bundles         enable row level security;
alter table public.bundle_history  enable row level security;

drop policy if exists "anon_read_bundle"  on public.bundles;
drop policy if exists "anon_read_history" on public.bundle_history;
create policy "anon_read_bundle"  on public.bundles        for select to anon, authenticated using (true);
create policy "anon_read_history" on public.bundle_history for select to anon, authenticated using (true);
-- INSERT/UPDATE/DELETE 정책 없음 → service_role 만 가능 (RLS 우회).
