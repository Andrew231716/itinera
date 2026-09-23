-- Itinera Supabase schema
-- Apply in Supabase SQL editor or via CLI.
-- Never expose service_role key to the browser.

create extension if not exists "pgcrypto";

-- Profiles optional (auth.users). Anonymous trips use owner_id null + local client id.
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete set null,
  client_owner_key text,
  title text not null default 'Nuovo viaggio',
  trip_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_owner_or_client check (
    owner_id is not null or (client_owner_key is not null and length(client_owner_key) >= 16)
  )
);

create index if not exists trips_owner_id_idx on public.trips (owner_id);
create index if not exists trips_client_owner_key_idx on public.trips (client_owner_key);
create index if not exists trips_updated_at_idx on public.trips (updated_at desc);

create table if not exists public.shared_trips (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  share_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  permission text not null default 'read'
    check (permission in ('read')),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

create index if not exists shared_trips_token_idx on public.shared_trips (share_token);
create index if not exists shared_trips_trip_id_idx on public.shared_trips (trip_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trips_set_updated_at on public.trips;
create trigger trips_set_updated_at
before update on public.trips
for each row execute function public.set_updated_at();

alter table public.trips enable row level security;
alter table public.shared_trips enable row level security;

-- Authenticated owners can CRUD their trips
create policy trips_select_own on public.trips
  for select using (
    (auth.uid() is not null and owner_id = auth.uid())
  );

create policy trips_insert_own on public.trips
  for insert with check (
    (auth.uid() is not null and owner_id = auth.uid())
  );

create policy trips_update_own on public.trips
  for update using (
    (auth.uid() is not null and owner_id = auth.uid())
  );

create policy trips_delete_own on public.trips
  for delete using (
    (auth.uid() is not null and owner_id = auth.uid())
  );

-- Shared read via token is handled by server API with service role OR
-- a SECURITY DEFINER function. Client anon key must NOT read all trips.
-- Anonymous client_owner_key access goes through Next.js API Routes using
-- the anon key only after validating the client_owner_key match server-side
-- is insufficient with RLS alone — use API routes + optional service role
-- for share resolution. For browser-direct access with anon key + auth:

create policy shared_trips_owner_manage on public.shared_trips
  for all using (
    exists (
      select 1 from public.trips t
      where t.id = shared_trips.trip_id
        and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.trips t
      where t.id = shared_trips.trip_id
        and t.owner_id = auth.uid()
    )
  );

-- Public read of shared trip payload via RPC (token-based, no auth required)
create or replace function public.get_shared_trip(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'trip', t.trip_data,
    'title', t.title,
    'permission', s.permission,
    'expires_at', s.expires_at
  )
  into result
  from public.shared_trips s
  join public.trips t on t.id = s.trip_id
  where s.share_token = p_token
    and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > now());

  return result;
end;
$$;

revoke all on function public.get_shared_trip(text) from public;
grant execute on function public.get_shared_trip(text) to anon, authenticated;
