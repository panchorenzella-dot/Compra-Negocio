create index businesses_reviewed_by_idx on public.businesses(reviewed_by);
create index offers_reviewed_by_idx on public.offers(reviewed_by);

drop policy "businesses_owner_update_pending" on public.businesses;
drop policy "businesses_admin_update" on public.businesses;

create policy "businesses_update_owner_or_admin"
on public.businesses for update
to authenticated
using (
  (owner_id = (select auth.uid()) and status = 'pending')
  or (select private.is_admin())
)
with check (
  (owner_id = (select auth.uid()) and status = 'pending')
  or (select private.is_admin())
);

drop policy "offers_buyer_read_own" on public.offers;
drop policy "offers_buyer_create" on public.offers;
drop policy "offers_buyer_withdraw" on public.offers;
drop policy "offers_admin_manage" on public.offers;

create policy "offers_select_buyer_or_admin"
on public.offers for select
to authenticated
using (
  buyer_id = (select auth.uid())
  or (select private.is_admin())
);

create policy "offers_insert_buyer"
on public.offers for insert
to authenticated
with check (
  buyer_id = (select auth.uid())
  and status = 'pending'
  and exists (
    select 1 from public.businesses
    where id = business_id and status = 'approved'
  )
);

create policy "offers_update_buyer_or_admin"
on public.offers for update
to authenticated
using (
  (buyer_id = (select auth.uid()) and status in ('pending', 'reviewing'))
  or (select private.is_admin())
)
with check (
  (buyer_id = (select auth.uid()) and status = 'withdrawn')
  or (select private.is_admin())
);
