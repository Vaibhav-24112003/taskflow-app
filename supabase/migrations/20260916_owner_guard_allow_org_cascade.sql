-- The owner-protection trigger must not block the cascade when the whole org is
-- being deleted (Delete Practice). During an org delete the parent organizations
-- row is removed first, so the cascade into organization_members runs with the
-- org already gone — detect that and allow the member rows to be removed.
create or replace function public.tf_protect_last_owner()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_owners int;
begin
  if TG_OP='DELETE' then
    if not exists (select 1 from public.organizations where id=OLD.org_id) then
      return OLD;  -- org itself is being deleted (cascade) -> allow
    end if;
    if OLD.role='owner' then
      select count(*) into v_owners from public.organization_members where org_id=OLD.org_id and role='owner';
      if v_owners<=1 then raise exception 'Cannot remove the last owner. Transfer ownership first.' using errcode='P0001'; end if;
    end if;
    return OLD;
  else
    if OLD.role='owner' and NEW.role<>'owner' then
      select count(*) into v_owners from public.organization_members where org_id=OLD.org_id and role='owner';
      if v_owners<=1 then raise exception 'Cannot demote the last owner. Transfer ownership first.' using errcode='P0001'; end if;
    end if;
    if NEW.role not in ('owner','admin','member') then raise exception 'Invalid role: %', NEW.role using errcode='P0001'; end if;
    return NEW;
  end if;
end $$;
