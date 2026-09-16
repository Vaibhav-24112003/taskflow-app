-- New firms start on the FREE plan (limited), keeping the 6-month window; after
-- expiry they go read-only (enforced by the read-only guard + useTrialGate).
-- Supersedes the earlier trial-plan seeding.

-- 1. Give the Free plan real limits so they are enforced (matches the Free card).
--    Workspaces left unset = unlimited.
update public.plans set limits = '{"users":2,"clients":25}'::jsonb, updated_at = now()
where id = 'free';

-- 2. Seed new orgs from the FREE plan's modules + limits (was the Trial plan).
drop trigger if exists tf_seed_trial on public.organizations;
drop function if exists public.tf_seed_trial_entitlements();

create or replace function public.tf_seed_new_org_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare fp record;
begin
  if (NEW.paid_modules is null or coalesce(array_length(NEW.paid_modules, 1), 0) = 0)
     and coalesce(NEW.subscription_status, 'trial') in ('trial', 'free') then
    select modules, limits into fp from public.plans where id = 'free';
    if found then
      NEW.paid_modules := coalesce(fp.modules, NEW.paid_modules, '{}');
      if NEW.plan_limits is null then NEW.plan_limits := fp.limits; end if;
    end if;
  end if;
  return NEW;
end;
$$;
revoke execute on function public.tf_seed_new_org_entitlements() from public, anon, authenticated;

drop trigger if exists tf_seed_new_org on public.organizations;
create trigger tf_seed_new_org
  before insert on public.organizations
  for each row execute function public.tf_seed_new_org_entitlements();

-- 3. Deactivate & hide the Trial plan (kept in DB for invoice/subscription history).
update public.plans set is_active = false, updated_at = now() where id = 'trial';
