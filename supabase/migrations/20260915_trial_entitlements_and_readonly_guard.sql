-- ============================================================================
-- A) Trials get the admin-configured 'trial' plan's modules + limits.
--    Seeded on org creation (covers every insert path); existing trials backfilled.
--    To change what a new trial includes, edit the 'trial' plan in Billing admin.
-- ============================================================================
create or replace function public.tf_seed_trial_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare tp record;
begin
  if (NEW.paid_modules is null or coalesce(array_length(NEW.paid_modules, 1), 0) = 0)
     and coalesce(NEW.subscription_status, 'trial') = 'trial' then
    select modules, limits into tp from public.plans where id = 'trial';
    if found then
      NEW.paid_modules := coalesce(tp.modules, NEW.paid_modules, '{}');
      if NEW.plan_limits is null then NEW.plan_limits := tp.limits; end if;
    end if;
  end if;
  return NEW;
end;
$$;
revoke execute on function public.tf_seed_trial_entitlements() from public, anon, authenticated;

drop trigger if exists tf_seed_trial on public.organizations;
create trigger tf_seed_trial
  before insert on public.organizations
  for each row execute function public.tf_seed_trial_entitlements();

update public.organizations o
set paid_modules = p.modules
from public.plans p
where p.id = 'trial'
  and o.subscription_status = 'trial'
  and coalesce(array_length(o.paid_modules, 1), 0) = 0
  and coalesce(array_length(p.modules, 1), 0) > 0;

-- ============================================================================
-- B) Read-only enforcement for suspended / cancelled / expired orgs.
--    Blocks INSERT/UPDATE/DELETE on user-content tables, tamper-proof, but only
--    for real end-user API calls (JWT role authenticated/anon). Cron jobs,
--    service_role edge functions and internal writes bypass so automations keep
--    working. Firm-billing tables and organizations stay writable for reactivation.
-- ============================================================================
create or replace function public.tf_block_when_readonly()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid; v_status text; v_ok boolean; v_role text;
begin
  v_role := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  if v_role not in ('authenticated', 'anon') then
    return coalesce(NEW, OLD);         -- cron / service_role / internal => allow
  end if;
  v_org := coalesce(NEW.org_id, OLD.org_id);
  if v_org is null then
    return coalesce(NEW, OLD);         -- personal / unscoped rows
  end if;
  select subscription_status,
         (subscription_status = 'paid'
          or (subscription_status = 'trial'
              and (trial_expires_at is null or trial_expires_at > now())))
    into v_status, v_ok
  from public.organizations where id = v_org;
  if v_ok is null or v_ok then
    return coalesce(NEW, OLD);         -- org missing (let FK handle) or writable
  end if;
  raise exception 'This practice is % and is read-only. Renew your plan to make changes.', coalesce(v_status, 'inactive')
    using errcode = 'P0001', hint = 'org_readonly';
end;
$$;
revoke execute on function public.tf_block_when_readonly() from public, anon, authenticated;

do $$
declare t text;
  tables text[] := array[
    'attendance_entries','attendance_punches','attendance_time_logs',
    'cc_form_templates','client_connect_requests','client_portal_access',
    'client_requests','clients','comm_logs','email_templates','gst_filing_status',
    'invoices','leave_requests','org_cloud_storage','org_invitations',
    'organization_members','payments','performance_reviews','proposals',
    'task_comments','tasks','team_chat_channels','team_chat_messages',
    'time_entries','work_type_configs','worksheet_rows','worksheets','workspaces'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists tf_readonly_guard on public.%I', t);
    execute format(
      'create trigger tf_readonly_guard before insert or update or delete on public.%I '
      || 'for each row execute function public.tf_block_when_readonly()', t);
  end loop;
end $$;
