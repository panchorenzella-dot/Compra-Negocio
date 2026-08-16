-- Expand the marketplace review workflow, private evidence storage and admin controls.

create or replace function private.contains_public_contact_info(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(value, '') ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
    or coalesce(value, '') ~* '(https?://|www\.|wa\.me/|t\.me/|instagram\.com/|facebook\.com/|linkedin\.com/|tiktok\.com/|discord\.gg/)'
    or coalesce(value, '') ~* '(^|[[:space:]])@[A-Z0-9._]{3,}'
    or coalesce(value, '') ~* '(\+?[0-9]{1,3}[[:space:].()-]+[0-9]{2,4}[[:space:].()-]+[0-9]{3,4}[[:space:].()-]+[0-9]{3,4})';
$$;

drop policy if exists "businesses_update_owner_or_admin" on public.businesses;
drop policy if exists "businesses_public_read_approved" on public.businesses;
drop policy if exists "businesses_owner_create" on public.businesses;
drop policy if exists "offers_select_buyer_or_admin" on public.offers;
drop policy if exists "offers_insert_buyer" on public.offers;
drop policy if exists "offers_update_buyer_or_admin" on public.offers;

alter table public.businesses alter column status drop default;
alter table public.businesses alter column status type text using status::text;
alter table public.businesses alter column status set default 'pending';
alter table public.businesses
  add constraint businesses_status_check
  check (status in ('pending', 'changes_requested', 'approved', 'rejected', 'sold', 'archived'));

alter table public.offers alter column status drop default;
alter table public.offers alter column status type text using status::text;
alter table public.offers alter column status set default 'pending';
alter table public.offers
  add constraint offers_status_check
  check (status in ('pending', 'reviewing', 'negotiating', 'presented', 'accepted', 'rejected', 'withdrawn', 'closed'));

alter table public.businesses
  add column age_months integer,
  add column expenses_monthly numeric(14,2),
  add column profit_monthly numeric(14,2),
  add column active_users integer,
  add column estimated_valuation numeric(14,2),
  add column reason_for_sale text,
  add column valuation_basis text,
  add column review_feedback text,
  add column internal_notes text,
  add column correction_requested_at timestamptz;

update public.businesses
set
  age_months = 0,
  expenses_monthly = 0,
  profit_monthly = revenue_monthly,
  active_users = 0,
  estimated_valuation = case when stake_percent > 0 then asking_price * 100 / stake_percent else asking_price end,
  reason_for_sale = 'Informacion pendiente de actualizacion.',
  valuation_basis = 'Informacion pendiente de actualizacion.';

alter table public.businesses
  alter column age_months set not null,
  alter column expenses_monthly set not null,
  alter column profit_monthly set not null,
  alter column active_users set not null,
  alter column estimated_valuation set not null,
  alter column reason_for_sale set not null,
  alter column valuation_basis set not null,
  add constraint businesses_age_months_check check (age_months >= 0 and age_months <= 1200),
  add constraint businesses_expenses_monthly_check check (expenses_monthly >= 0),
  add constraint businesses_active_users_check check (active_users >= 0),
  add constraint businesses_estimated_valuation_check check (estimated_valuation > 0),
  add constraint businesses_reason_for_sale_check check (char_length(reason_for_sale) between 10 and 1500),
  add constraint businesses_valuation_basis_check check (char_length(valuation_basis) between 20 and 2000),
  add constraint businesses_review_feedback_check check (review_feedback is null or char_length(review_feedback) <= 2000),
  add constraint businesses_internal_notes_check check (internal_notes is null or char_length(internal_notes) <= 5000),
  add constraint businesses_description_no_contact_check check (not private.contains_public_contact_info(description)),
  add constraint businesses_reason_no_contact_check check (not private.contains_public_contact_info(reason_for_sale)),
  add constraint businesses_valuation_no_contact_check check (not private.contains_public_contact_info(valuation_basis)),
  add constraint businesses_id_owner_unique unique (id, owner_id);

alter table public.offers
  add column final_amount numeric(14,2),
  add column closed_at timestamptz,
  add constraint offers_final_amount_check check (final_amount is null or final_amount > 0),
  add constraint offers_internal_notes_check check (internal_notes is null or char_length(internal_notes) <= 5000);

create table public.business_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  owner_id uuid not null,
  storage_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null check (mime_type in (
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  document_kind text not null default 'other' check (document_kind in ('revenue', 'expenses', 'ownership', 'analytics', 'other')),
  created_at timestamptz not null default now(),
  constraint business_documents_business_owner_fkey
    foreign key (business_id, owner_id)
    references public.businesses(id, owner_id)
    on delete cascade
);

create index business_documents_business_id_idx on public.business_documents(business_id, created_at desc);
create index business_documents_owner_id_idx on public.business_documents(owner_id, created_at desc);
create index businesses_review_queue_idx on public.businesses(created_at desc)
  where status in ('pending', 'changes_requested');
create index offers_active_queue_idx on public.offers(created_at desc)
  where status in ('pending', 'reviewing', 'negotiating', 'presented', 'accepted');

alter table public.business_documents enable row level security;

create policy "business_documents_select_owner_or_admin"
on public.business_documents for select
to authenticated
using (owner_id = (select auth.uid()) or (select private.is_admin()));

create policy "business_documents_insert_owner"
on public.business_documents for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.businesses
    where id = business_id
      and owner_id = (select auth.uid())
      and status in ('pending', 'changes_requested')
  )
);

create policy "business_documents_delete_owner_or_admin"
on public.business_documents for delete
to authenticated
using (
  (select private.is_admin())
  or (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.businesses
      where id = business_id
        and owner_id = (select auth.uid())
        and status in ('pending', 'changes_requested')
    )
  )
);

create policy "businesses_public_read_approved"
on public.businesses for select
to anon, authenticated
using (status = 'approved' or owner_id = (select auth.uid()) or (select private.is_admin()));

create policy "businesses_owner_create"
on public.businesses for insert
to authenticated
with check (owner_id = (select auth.uid()) and status = 'pending');

create policy "businesses_update_owner_or_admin"
on public.businesses for update
to authenticated
using (
  (select private.is_admin())
  or (owner_id = (select auth.uid()) and status in ('pending', 'changes_requested'))
)
with check (
  (select private.is_admin())
  or (owner_id = (select auth.uid()) and status = 'pending')
);

create policy "offers_select_buyer_or_admin"
on public.offers for select
to authenticated
using (buyer_id = (select auth.uid()) or (select private.is_admin()));

create policy "offers_insert_buyer"
on public.offers for insert
to authenticated
with check (
  buyer_id = (select auth.uid())
  and status = 'pending'
  and exists (
    select 1 from public.businesses
    where id = business_id
      and status = 'approved'
      and owner_id <> (select auth.uid())
  )
);

create policy "offers_update_buyer_or_admin"
on public.offers for update
to authenticated
using (
  (buyer_id = (select auth.uid()) and status in ('pending', 'reviewing', 'negotiating'))
  or (select private.is_admin())
)
with check (
  (buyer_id = (select auth.uid()) and status = 'withdrawn')
  or (select private.is_admin())
);

create or replace function private.enforce_business_update_permissions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    if new.owner_id is distinct from old.owner_id
      or new.review_feedback is distinct from old.review_feedback
      or new.internal_notes is distinct from old.internal_notes
      or new.correction_requested_at is distinct from old.correction_requested_at
      or new.rejection_reason is distinct from old.rejection_reason
      or new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
      or new.created_at is distinct from old.created_at
      or new.status <> 'pending' then
      raise exception 'Only the Compra Negocio team can change review fields.' using errcode = '42501';
    end if;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

create trigger businesses_protect_review_fields
before update on public.businesses
for each row execute function private.enforce_business_update_permissions();

create or replace function private.enforce_offer_update_permissions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    if new.business_id is distinct from old.business_id
      or new.buyer_id is distinct from old.buyer_id
      or new.amount is distinct from old.amount
      or new.message is distinct from old.message
      or new.internal_notes is distinct from old.internal_notes
      or new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
      or new.final_amount is distinct from old.final_amount
      or new.closed_at is distinct from old.closed_at
      or new.created_at is distinct from old.created_at
      or new.status <> 'withdrawn' then
      raise exception 'Only the Compra Negocio team can change negotiation fields.' using errcode = '42501';
    end if;
  end if;

  if new.status = 'closed' and old.status <> 'closed' then
    if not (select private.is_admin()) or new.final_amount is null then
      raise exception 'Closing an operation requires an administrator and a final amount.' using errcode = '42501';
    end if;
    new.closed_at = now();
  end if;

  new.updated_at = now();
  return new;
end;
$$;

create trigger offers_protect_negotiation_fields
before update on public.offers
for each row execute function private.enforce_offer_update_permissions();

create or replace function private.mark_business_sold_on_close()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'closed' and old.status <> 'closed' then
    update public.businesses
    set status = 'sold', reviewed_at = now()
    where id = new.business_id;
  end if;
  return new;
end;
$$;

create trigger offers_mark_business_sold
after update on public.offers
for each row execute function private.mark_business_sold_on_close();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-documents',
  'business-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "business_documents_storage_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'business-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.businesses
    where id::text = (storage.foldername(name))[2]
      and owner_id = (select auth.uid())
      and status in ('pending', 'changes_requested')
  )
);

create policy "business_documents_storage_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'business-documents'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select private.is_admin())
  )
);

create policy "business_documents_storage_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'business-documents'
  and (
    (select private.is_admin())
    or (
      (storage.foldername(name))[1] = (select auth.uid())::text
      and exists (
        select 1 from public.businesses
        where id::text = (storage.foldername(name))[2]
          and owner_id = (select auth.uid())
          and status in ('pending', 'changes_requested')
      )
    )
  )
);

grant select, insert, delete on public.business_documents to authenticated;
