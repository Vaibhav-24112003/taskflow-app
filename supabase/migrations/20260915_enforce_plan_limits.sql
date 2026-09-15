-- Plan-limit enforcement (tamper-proof, DB-side) + admin per-org override.
-- Effective limits live on organizations.plan_limits (copied from the plan on
-- purchase/grant, editable per-org by platform admin).
-- NULL / missing key / -1 = unlimited.

-- 1. Per-org effective limits column (admin-controllable override of plan limits)
alter table public.organizations add column if not exists plan_limits jsonb;

-- 2. Backfill from the current active subscription's plan for paid orgs
update public.organizations o
set plan_limits = p.limits
from public.subscriptions s
join public.plans p on p.id = s.plan_id
where s.org_id = o.id
  and s.status = 'active'
  and o.plan_limits is null
  and p.limits is not null
  and p.limits <> '{}'::jsonb;

-- 3. Effective-limit resolver. Reads organizations.plan_limits.
--    Returns NULL when unlimited (no plan / trial / missing key); -1 also means unlimited.
create or replace function public.tf_effective_limit(p_org uuid, p_key text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_org is null then null
    else nullif((select plan_limits->>p_key from public.organizations where id = p_org), '')::int
  end;
$$;

-- 4. Generic BEFORE INSERT guard. Args: [0]=limit key, [1]=human label.
create or replace function public.tf_check_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key   text := TG_ARGV[0];
  v_label text := TG_ARGV[1];
  v_lim   integer;
  v_cnt   bigint;
begin
  if NEW.org_id is null then
    return NEW;                       -- personal / unscoped rows are not limited
  end if;
  v_lim := public.tf_effective_limit(NEW.org_id, v_key);
  if v_lim is null or v_lim < 0 then
    return NEW;                       -- unlimited (no plan, trial, or enterprise)
  end if;
  execute format('select count(*) from public.%I where org_id = $1', TG_TABLE_NAME)
    into v_cnt using NEW.org_id;
  if v_cnt >= v_lim then
    raise exception 'You have reached your plan''s limit of % %. Upgrade your plan to add more.',
      v_lim, v_label
      using errcode = 'P0001',
            hint    = 'plan_limit:' || v_key;
  end if;
  return NEW;
end;
$$;

-- Internal only (trigger + internal resolver); not meant to be REST-callable.
-- The trigger runs as owner, so it can still call the resolver after revoke.
revoke execute on function public.tf_check_plan_limit()                from public, anon, authenticated;
revoke execute on function public.tf_effective_limit(uuid, text)       from public, anon, authenticated;

-- 5. Triggers on the three limited resources
drop trigger if exists tf_limit_members on public.organization_members;
create trigger tf_limit_members
  before insert on public.organization_members
  for each row execute function public.tf_check_plan_limit('users', 'team members');

drop trigger if exists tf_limit_clients on public.clients;
create trigger tf_limit_clients
  before insert on public.clients
  for each row execute function public.tf_check_plan_limit('clients', 'clients');

drop trigger if exists tf_limit_workspaces on public.workspaces;
create trigger tf_limit_workspaces
  before insert on public.workspaces
  for each row execute function public.tf_check_plan_limit('workspaces', 'workspaces');

-- 6. Surface plan_limits + live usage counts to the admin org overview
--    (append new columns at the end to keep existing column order & grants)
create or replace view public.admin_org_overview
with (security_invoker = true) as
 SELECT o.id,
    o.name,
    o.slug,
    o.created_by AS owner_id,
    o.trial_started_at,
    o.trial_expires_at,
    o.paid_modules,
    o.subscription_status,
    o.created_at,
    ( SELECT count(*) FROM public.organization_members m WHERE m.org_id = o.id) AS member_count,
    CASE
        WHEN o.trial_expires_at IS NULL THEN NULL::text
        WHEN o.trial_expires_at < now() THEN 'expired'::text
        WHEN o.trial_expires_at < (now() + '7 days'::interval) THEN 'critical'::text
        WHEN o.trial_expires_at < (now() + '30 days'::interval) THEN 'warning'::text
        ELSE 'ok'::text
    END AS trial_bucket,
    o.plan_limits,
    ( SELECT count(*) FROM public.clients c WHERE c.org_id = o.id) AS client_count,
    ( SELECT count(*) FROM public.workspaces w WHERE w.org_id = o.id) AS workspace_count
   FROM public.organizations o;
