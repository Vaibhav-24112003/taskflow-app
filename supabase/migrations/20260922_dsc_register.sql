-- DSC (Digital Signature Certificate) register for the Practice Hub.
-- Tracks each client/holder's DSC: class, CA, serial, expiry, token, custody,
-- purposes, status, and an encrypted PIN (reusing the credential-vault key and
-- the credential_access_log audit trail). Org-scoped with RLS.
-- Applied to live project vorxrjekbokqkigfabhr; this file mirrors it. Idempotent.

create table if not exists public.client_dsc (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  client_id            uuid references public.clients(id) on delete set null,
  holder_name          text not null,
  holder_pan           text,
  cert_class           text,                     -- 'Class 3', 'DGFT', ...
  cert_type            text,                     -- 'Signature' | 'Encryption' | 'Combo'
  certifying_authority text,                     -- eMudhra, Capricorn, Sify, VSign, Pantasign, NSDL, ...
  serial_no            text,
  issued_on            date,
  expires_on           date,
  token_type           text,                     -- ePass2003, ProxKey, ...
  token_serial         text,
  purposes             text[],                   -- GST, Income Tax, MCA/ROC, TRACES, ICEGATE, DGFT, EPFO
  custody              text not null default 'firm',   -- 'firm' | 'client'
  custody_person       text,
  status               text not null default 'active', -- active | revoked | lost
  pin_enc              bytea,                    -- encrypted DSC PIN (pgp_sym via _cred_enc_key)
  notes                text,
  created_by           uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists client_dsc_org_idx     on public.client_dsc (org_id, expires_on);
create index if not exists client_dsc_client_idx  on public.client_dsc (client_id);

alter table public.client_dsc enable row level security;
drop policy if exists dsc_select on public.client_dsc;
drop policy if exists dsc_insert on public.client_dsc;
drop policy if exists dsc_update on public.client_dsc;
drop policy if exists dsc_delete on public.client_dsc;
create policy dsc_select on public.client_dsc for select using (public.is_org_member(org_id) or public.is_tfc_admin());
create policy dsc_insert on public.client_dsc for insert with check (public.is_org_member(org_id));
create policy dsc_update on public.client_dsc for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy dsc_delete on public.client_dsc for delete using (public.is_org_member(org_id));

-- Custody log (append-only): who took / returned the physical token, when.
create table if not exists public.dsc_custody_log (
  id       uuid primary key default gen_random_uuid(),
  dsc_id   uuid not null references public.client_dsc(id) on delete cascade,
  org_id   uuid not null references public.organizations(id) on delete cascade,
  action   text not null,          -- checked_out | checked_in | issued_to_client | returned
  person   text,
  by_user  uuid,
  at       timestamptz not null default now(),
  notes    text
);
create index if not exists dsc_custody_log_dsc_idx on public.dsc_custody_log (dsc_id, at desc);
alter table public.dsc_custody_log enable row level security;
drop policy if exists dsc_cust_select on public.dsc_custody_log;
drop policy if exists dsc_cust_insert on public.dsc_custody_log;
create policy dsc_cust_select on public.dsc_custody_log for select using (public.is_org_member(org_id) or public.is_tfc_admin());
create policy dsc_cust_insert on public.dsc_custody_log for insert with check (public.is_org_member(org_id));
revoke update, delete on public.dsc_custody_log from anon, authenticated;

-- Encrypted PIN read/write (self-authorising, audit-logged) — mirrors cred_get_secret.
create or replace function public.dsc_set_pin(p_dsc uuid, p_pin text)
returns void language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $$
declare v_org uuid;
begin
  select d.org_id into v_org from client_dsc d
    join organization_members m on m.org_id = d.org_id and m.user_id = auth.uid()
   where d.id = p_dsc;
  if v_org is null then raise exception 'not authorized'; end if;
  update client_dsc
     set pin_enc = case when p_pin is null or p_pin = '' then null
                        else extensions.pgp_sym_encrypt(p_pin, public._cred_enc_key()) end,
         updated_at = now()
   where id = p_dsc;
end; $$;

create or replace function public.dsc_get_pin(p_dsc uuid)
returns text language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $$
declare v text; v_org uuid; v_client uuid;
begin
  select d.org_id, d.client_id into v_org, v_client from client_dsc d
    join organization_members m on m.org_id = d.org_id and m.user_id = auth.uid()
   where d.id = p_dsc;
  if v_org is null then raise exception 'not authorized'; end if;
  select case when pin_enc is not null
              then extensions.pgp_sym_decrypt(pin_enc, public._cred_enc_key())
              else null end
    into v from client_dsc where id = p_dsc;
  insert into public.credential_access_log (org_id, cred_id, client_id, accessed_by, action)
  values (v_org, null, v_client, auth.uid(), 'dsc_pin_reveal');
  return v;
end; $$;

-- Expiring-soon view for reminders/dashboards (RLS-respecting).
create or replace view public.dsc_expiring as
  select id, org_id, client_id, holder_name, certifying_authority, expires_on,
         (expires_on - current_date) as days_left
    from public.client_dsc
   where status = 'active' and expires_on is not null
     and expires_on <= current_date + 45;
alter view public.dsc_expiring set (security_invoker = true);
