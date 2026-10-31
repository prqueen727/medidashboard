create extension if not exists pgcrypto;

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  place_id text not null check (place_id ~ '^[0-9]+$'),
  blog_url text not null,
  keywords text[] not null check (cardinality(keywords) between 1 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clinics add column if not exists magazine_url text;
alter table public.clinics add column if not exists homepage_url text;

create table if not exists public.rank_snapshots (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  snapshot_date date not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (clinic_id, snapshot_date)
);

create table if not exists public.clinic_competitors (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  place_id text not null check (place_id ~ '^[0-9]+$'),
  blog_url text not null,
  created_at timestamptz not null default now(),
  unique (clinic_id, place_id)
);

alter table public.clinic_competitors add column if not exists homepage_url text;
alter table public.clinic_competitors alter column blog_url drop not null;

create index if not exists rank_snapshots_clinic_date_idx
  on public.rank_snapshots (clinic_id, snapshot_date desc);
create index if not exists clinic_competitors_clinic_idx
  on public.clinic_competitors (clinic_id, name);

alter table public.clinics enable row level security;
alter table public.rank_snapshots enable row level security;
alter table public.clinic_competitors enable row level security;

revoke all on public.clinics from anon, authenticated;
revoke all on public.rank_snapshots from anon, authenticated;
revoke all on public.clinic_competitors from anon, authenticated;

grant usage on schema public to service_role;
grant all on public.clinics, public.rank_snapshots, public.clinic_competitors to service_role;
