create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  plan text not null default 'free' check (plan in ('free', 'premium', 'team')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  cloud_seconds integer not null default 0,
  ai_requests integer not null default 0,
  final_transcribes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.profiles enable row level security;
alter table public.usage_daily enable row level security;

drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own"
on public.profiles for select
using (auth.uid() = id);

drop policy if exists "usage select own" on public.usage_daily;
create policy "usage select own"
on public.usage_daily for select
using (auth.uid() = user_id);

-- Writes are performed by the Cloudflare Function with SUPABASE_SERVICE_ROLE_KEY.
