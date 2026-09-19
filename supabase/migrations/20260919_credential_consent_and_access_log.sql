-- Credential-vault India-compliance hardening (DPDP Act 2023 + IT Act/SPDI Rules 2011).
--
-- 1. Record explicit consent/authorisation when a firm stores a client's portal
--    credential (who confirmed, when).
-- 2. Audit-log every reveal/copy of a decrypted secret so access to sensitive
--    personal data is accountable and reviewable.
--
-- Already applied to the live project (vorxrjekbokqkigfabhr); this file mirrors it
-- so the repo history stays authoritative. Idempotent.

-- 1) Consent columns on the credential row --------------------------------------
alter table public.client_credentials
  add column if not exists consent_at timestamptz,
  add column if not exists consent_by uuid references auth.users(id);

-- 2) Access log ------------------------------------------------------------------
create table if not exists public.credential_access_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  cred_id     uuid references public.client_credentials(id) on delete set null,
  client_id   uuid,
  accessed_by uuid,
  action      text not null default 'reveal',
  at          timestamptz not null default now()
);

create index if not exists credential_access_log_org_idx
  on public.credential_access_log (org_id, at desc);

alter table public.credential_access_log enable row level security;

-- Members of the owning org (and platform admins) may read their audit trail.
drop policy if exists cred_log_read on public.credential_access_log;
create policy cred_log_read on public.credential_access_log
  for select using (public.is_org_member(org_id) or public.is_tfc_admin());

-- Writes happen only through the SECURITY DEFINER function below, never directly.
revoke insert, update, delete on public.credential_access_log from anon, authenticated;

-- 3) cred_get_secret now authorises via org membership and logs each reveal ------
create or replace function public.cred_get_secret(p_cred_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare v text; v_org uuid; v_client uuid;
begin
  select cc.org_id, cc.client_id into v_org, v_client
    from client_credentials cc
    join organization_members m on m.org_id = cc.org_id and m.user_id = auth.uid()
   where cc.id = p_cred_id;
  if v_org is null then
    raise exception 'not authorized';
  end if;
  select case when cc.password_enc is not null
              then extensions.pgp_sym_decrypt(cc.password_enc, public._cred_enc_key())
              else cc.password end
    into v from client_credentials cc where cc.id = p_cred_id;
  insert into public.credential_access_log (org_id, cred_id, client_id, accessed_by, action)
  values (v_org, p_cred_id, v_client, auth.uid(), 'reveal');
  return v;
end; $function$;
