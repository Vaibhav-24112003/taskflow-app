-- A pending invite must NOT make the org visible/enterable. Previously the
-- "Invited users can view org" SELECT policy on organizations exposed invited
-- orgs, so an invitee saw the org as a joinable practice and could enter it
-- WITHOUT accepting. Remove it.
drop policy if exists "Invited users can view org" on public.organizations;

-- The invite banner needs the org name without a broad org-read grant. Serve
-- pending invites (for the caller's email) with the org name via a definer RPC.
create or replace function public.org_my_pending_invites()
returns json language sql stable security definer set search_path=public as $$
  select coalesce(json_agg(json_build_object(
      'id', i.id,
      'org_id', i.org_id,
      'org_name', o.name,
      'role', i.role,
      'created_at', i.created_at,
      'expires_at', i.expires_at
    ) order by i.created_at desc), '[]'::json)
  from public.org_invitations i
  join public.organizations o on o.id = i.org_id
  where lower(i.invitee_email) = lower(coalesce(auth.jwt()->>'email',''))
    and i.status = 'pending'
    and (i.expires_at is null or i.expires_at > now());
$$;
revoke execute on function public.org_my_pending_invites() from public, anon;
grant  execute on function public.org_my_pending_invites() to authenticated;
