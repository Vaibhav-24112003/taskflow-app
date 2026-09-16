-- ============================================================================
-- Strict, tamper-proof org membership lifecycle.
-- Fixes prior holes: any user could self-insert into any org with any role;
-- two RLS policies had an always-true `om.org_id = om.org_id` bug (cross-org
-- control); an invitee could edit their pending invite's role then accept and
-- self-escalate to owner.
-- All mutations now go through SECURITY DEFINER RPCs that self-authorize, and
-- direct table writes are revoked.
-- ============================================================================

-- 1. Owner protection: an org must always keep >=1 owner; role must be valid.
create or replace function public.tf_protect_last_owner()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_owners int;
begin
  if TG_OP='DELETE' then
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
revoke execute on function public.tf_protect_last_owner() from public, anon, authenticated;
drop trigger if exists tf_protect_last_owner on public.organization_members;
create trigger tf_protect_last_owner before update or delete on public.organization_members
  for each row execute function public.tf_protect_last_owner();

-- 2. Invite (owner/admin). Admin may invite members only; owner may invite admins.
create or replace function public.org_invite_member(p_org uuid, p_email text, p_role text default 'member')
returns json language plpgsql security definer set search_path=public as $$
declare v_caller text; v_role text; v_email text; v_exists uuid; v_inv public.org_invitations;
begin
  select role into v_caller from public.organization_members where org_id=p_org and user_id=auth.uid();
  if v_caller is null or v_caller not in ('owner','admin') then
    raise exception 'Only owners and admins can invite members.' using errcode='P0001';
  end if;
  v_email := lower(trim(coalesce(p_email,'')));
  if v_email='' or position('@' in v_email)=0 then raise exception 'Enter a valid email address.' using errcode='P0001'; end if;
  v_role := case when p_role in ('admin','member') then p_role else 'member' end;
  if v_role='admin' and v_caller<>'owner' then
    raise exception 'Only the owner can grant the admin role. Invite as a member instead.' using errcode='P0001';
  end if;
  select om.user_id into v_exists
  from public.organization_members om join public.profiles p on p.id=om.user_id
  where om.org_id=p_org and lower(p.email)=v_email limit 1;
  if v_exists is not null then raise exception 'That person is already a member of this organisation.' using errcode='P0001'; end if;
  update public.org_invitations
    set role=v_role, inviter_id=auth.uid(), status='pending', expires_at=now()+interval '7 days', created_at=now()
    where org_id=p_org and lower(invitee_email)=v_email and status='pending'
    returning * into v_inv;
  if not found then
    insert into public.org_invitations (org_id, inviter_id, invitee_email, role, status)
    values (p_org, auth.uid(), v_email, v_role, 'pending') returning * into v_inv;
  end if;
  return row_to_json(v_inv);
end $$;

-- 3. Accept (invitee). Role clamped so an invite can never grant owner. The
--    plan user-limit + read-only guards still apply on the membership insert.
create or replace function public.org_accept_invite(p_invite uuid)
returns json language plpgsql security definer set search_path=public as $$
declare v_inv public.org_invitations; v_email text; v_role text;
begin
  v_email := lower(coalesce(auth.jwt()->>'email',''));
  select * into v_inv from public.org_invitations where id=p_invite;
  if v_inv.id is null then raise exception 'Invitation not found.' using errcode='P0001'; end if;
  if v_inv.status<>'pending' then raise exception 'This invitation is no longer valid.' using errcode='P0001'; end if;
  if v_inv.expires_at is not null and v_inv.expires_at<now() then
    update public.org_invitations set status='expired' where id=p_invite;
    raise exception 'This invitation has expired. Ask an admin to re-invite you.' using errcode='P0001';
  end if;
  if lower(v_inv.invitee_email)<>v_email then raise exception 'This invitation was sent to a different email address.' using errcode='P0001'; end if;
  v_role := case when v_inv.role in ('admin','member') then v_inv.role else 'member' end;
  insert into public.organization_members (org_id, user_id, role, joined_at)
  values (v_inv.org_id, auth.uid(), v_role, now())
  on conflict (org_id, user_id) do nothing;
  update public.org_invitations set status='accepted' where id=p_invite;
  return json_build_object('ok',true,'org_id',v_inv.org_id);
end $$;

-- 4. Decline (invitee) / Cancel (owner/admin)
create or replace function public.org_decline_invite(p_invite uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_email text; v_to text;
begin
  v_email := lower(coalesce(auth.jwt()->>'email',''));
  select lower(invitee_email) into v_to from public.org_invitations where id=p_invite and status='pending';
  if v_to is null then return; end if;
  if v_to<>v_email then raise exception 'Not your invitation.' using errcode='P0001'; end if;
  update public.org_invitations set status='declined' where id=p_invite;
end $$;

create or replace function public.org_cancel_invite(p_invite uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_role text;
begin
  select org_id into v_org from public.org_invitations where id=p_invite and status='pending';
  if v_org is null then return; end if;
  select role into v_role from public.organization_members where org_id=v_org and user_id=auth.uid();
  if v_role is null or v_role not in ('owner','admin') then raise exception 'Only owners and admins can cancel invitations.' using errcode='P0001'; end if;
  update public.org_invitations set status='cancelled' where id=p_invite;
end $$;

-- 5. Remove member: owner removes admin/member; admin removes members only.
create or replace function public.org_remove_member(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_caller text; v_target text;
begin
  select role into v_caller from public.organization_members where org_id=p_org and user_id=auth.uid();
  select role into v_target from public.organization_members where org_id=p_org and user_id=p_user;
  if v_target is null then return; end if;
  if v_caller is null or v_caller not in ('owner','admin') then raise exception 'Only owners and admins can remove members.' using errcode='P0001'; end if;
  if v_target='owner' then raise exception 'The owner cannot be removed. Transfer ownership first.' using errcode='P0001'; end if;
  if v_target='admin' and v_caller<>'owner' then raise exception 'Only the owner can remove an admin.' using errcode='P0001'; end if;
  delete from public.organization_members where org_id=p_org and user_id=p_user;
end $$;

-- 6. Change role: owner only; target must not be owner; role in (admin,member).
create or replace function public.org_change_role(p_org uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path=public as $$
declare v_caller text; v_target text;
begin
  select role into v_caller from public.organization_members where org_id=p_org and user_id=auth.uid();
  select role into v_target from public.organization_members where org_id=p_org and user_id=p_user;
  if v_target is null then raise exception 'Member not found.' using errcode='P0001'; end if;
  if v_caller<>'owner' then raise exception 'Only the owner can change member roles.' using errcode='P0001'; end if;
  if v_target='owner' then raise exception 'Cannot change the owner''s role here.' using errcode='P0001'; end if;
  if p_role not in ('admin','member') then raise exception 'Role must be admin or member.' using errcode='P0001'; end if;
  update public.organization_members set role=p_role where org_id=p_org and user_id=p_user;
end $$;

-- 7. Lock down direct writes — force everything through the RPCs above.
revoke insert, update, delete on public.organization_members from anon, authenticated;
revoke insert, update, delete on public.org_invitations     from anon, authenticated;

grant execute on function public.org_invite_member(uuid,text,text) to authenticated;
grant execute on function public.org_accept_invite(uuid)          to authenticated;
grant execute on function public.org_decline_invite(uuid)         to authenticated;
grant execute on function public.org_cancel_invite(uuid)          to authenticated;
grant execute on function public.org_remove_member(uuid,uuid)     to authenticated;
grant execute on function public.org_change_role(uuid,uuid,text)  to authenticated;
