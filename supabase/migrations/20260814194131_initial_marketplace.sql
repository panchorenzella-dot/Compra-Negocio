create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;

create type public.user_role as enum ('user', 'admin');
create type public.business_status as enum ('pending', 'approved', 'rejected', 'sold', 'archived');
create type public.offer_status as enum ('pending', 'reviewing', 'presented', 'accepted', 'rejected', 'withdrawn');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text check (full_name is null or char_length(full_name) between 2 and 100),
  country text check (country is null or char_length(country) between 2 and 80),
  account_intent text not null default 'both' check (account_intent in ('buy', 'sell', 'both')),
  organization_name text check (organization_name is null or char_length(organization_name) <= 120),
  terms_accepted_at timestamptz,
  role public.user_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  website text,
  category text not null,
  description text not null check (char_length(description) between 20 and 2000),
  revenue_monthly numeric(14,2) not null check (revenue_monthly >= 0),
  asking_price numeric(14,2) not null check (asking_price > 0),
  stake_percent numeric(5,2) not null check (stake_percent > 0 and stake_percent <= 100),
  status public.business_status not null default 'pending',
  rejection_reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  message text check (char_length(message) <= 2000),
  status public.offer_status not null default 'pending',
  internal_notes text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, buyer_id, amount)
);

create index businesses_status_created_idx on public.businesses(status, created_at desc);
create index businesses_owner_idx on public.businesses(owner_id, created_at desc);
create index offers_business_idx on public.offers(business_id, created_at desc);
create index offers_buyer_idx on public.offers(buyer_id, created_at desc);
create index offers_status_idx on public.offers(status, created_at desc);

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke all on function private.is_admin() from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.is_admin() to anon, authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    country,
    account_intent,
    organization_name,
    terms_accepted_at
  )
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'country', ''),
    case
      when new.raw_user_meta_data ->> 'account_intent' in ('buy', 'sell', 'both')
        then new.raw_user_meta_data ->> 'account_intent'
      else 'both'
    end,
    nullif(new.raw_user_meta_data ->> 'organization_name', ''),
    case
      when nullif(new.raw_user_meta_data ->> 'terms_accepted_at', '') is not null then now()
      else null
    end
  );
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.offers enable row level security;

create policy "profiles_read_own_or_admin"
on public.profiles for select
to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));

create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "businesses_public_read_approved"
on public.businesses for select
to anon, authenticated
using (status = 'approved' or owner_id = (select auth.uid()) or (select private.is_admin()));

create policy "businesses_owner_create"
on public.businesses for insert
to authenticated
with check (owner_id = (select auth.uid()) and status = 'pending');

create policy "businesses_owner_update_pending"
on public.businesses for update
to authenticated
using (owner_id = (select auth.uid()) and status = 'pending')
with check (owner_id = (select auth.uid()) and status = 'pending');

create policy "businesses_admin_update"
on public.businesses for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "offers_buyer_read_own"
on public.offers for select
to authenticated
using (buyer_id = (select auth.uid()) or (select private.is_admin()));

create policy "offers_buyer_create"
on public.offers for insert
to authenticated
with check (
  buyer_id = (select auth.uid())
  and exists (
    select 1 from public.businesses
    where id = business_id and status = 'approved'
  )
);

create policy "offers_buyer_withdraw"
on public.offers for update
to authenticated
using (buyer_id = (select auth.uid()) and status in ('pending', 'reviewing'))
with check (buyer_id = (select auth.uid()) and status = 'withdrawn');

create policy "offers_admin_manage"
on public.offers for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

grant usage on schema public to anon, authenticated;
grant select on public.businesses to anon;
grant select, insert, update on public.businesses to authenticated;
grant select, insert, update on public.offers to authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, country, account_intent, organization_name) on public.profiles to authenticated;
