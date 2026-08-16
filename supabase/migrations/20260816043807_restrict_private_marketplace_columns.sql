-- Keep marketplace listings public without exposing the seller's private review data.
revoke select on public.businesses from anon, authenticated;

grant select (
  id,
  name,
  category,
  description,
  revenue_monthly,
  expenses_monthly,
  profit_monthly,
  asking_price,
  estimated_valuation,
  stake_percent,
  age_months,
  active_users,
  status,
  created_at
) on public.businesses to anon, authenticated;

-- Authenticated buyers need these columns for offer validation and ownership checks.
grant select (owner_id) on public.businesses to authenticated;

-- A buyer can see the commercial state of their own offer, never team-only notes.
revoke select on public.offers from authenticated;
grant select (
  id,
  business_id,
  buyer_id,
  amount,
  message,
  final_amount,
  status,
  reviewed_at,
  closed_at,
  created_at
) on public.offers to authenticated;

-- Limit fields users can provide on creation so review-only fields cannot be forged.
revoke insert on public.businesses from authenticated;
grant insert (
  id,
  owner_id,
  name,
  website,
  category,
  description,
  revenue_monthly,
  expenses_monthly,
  profit_monthly,
  asking_price,
  estimated_valuation,
  stake_percent,
  age_months,
  active_users,
  reason_for_sale,
  valuation_basis,
  status
) on public.businesses to authenticated;

revoke insert on public.offers from authenticated;
grant insert (business_id, buyer_id, amount, message, status)
on public.offers to authenticated;

-- Buyers retain read access to the public portion of a business after an offer closes.
drop policy if exists "businesses_public_read_approved" on public.businesses;
create policy "businesses_public_read_approved"
on public.businesses for select
to anon, authenticated
using (
  status = 'approved'
  or owner_id = (select auth.uid())
  or (select private.is_admin())
  or (
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.offers
      where offers.business_id = businesses.id
        and offers.buyer_id = (select auth.uid())
    )
  )
);

-- Owners and administrators use guarded RPCs for complete private records.
create or replace function public.get_my_businesses()
returns setof public.businesses
language sql
stable
security definer
set search_path = ''
as $$
  select businesses.*
  from public.businesses
  where (select auth.uid()) is not null
    and businesses.owner_id = (select auth.uid())
  order by businesses.created_at desc;
$$;

revoke all on function public.get_my_businesses() from public, anon;
grant execute on function public.get_my_businesses() to authenticated;

create or replace function public.get_admin_businesses()
returns setof public.businesses
language sql
stable
security definer
set search_path = ''
as $$
  select businesses.*
  from public.businesses
  where (select auth.uid()) is not null
    and (select private.is_admin())
  order by businesses.created_at desc;
$$;

revoke all on function public.get_admin_businesses() from public, anon;
grant execute on function public.get_admin_businesses() to authenticated;

create or replace function public.get_admin_offers()
returns setof public.offers
language sql
stable
security definer
set search_path = ''
as $$
  select offers.*
  from public.offers
  where (select auth.uid()) is not null
    and (select private.is_admin())
  order by offers.created_at desc;
$$;

revoke all on function public.get_admin_offers() from public, anon;
grant execute on function public.get_admin_offers() to authenticated;
