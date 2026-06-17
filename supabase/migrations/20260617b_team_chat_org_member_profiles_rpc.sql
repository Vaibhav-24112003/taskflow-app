-- ── Team Chat: org members need to see each other's name/email for the
-- DM "Find a person" picker. profiles RLS is locked to self-only, so a
-- security-definer RPC exposes just the columns chat needs, scoped to
-- callers who are actually members of the target org.
create or replace function public.tc_org_member_profiles(_org_id uuid)
returns table(id uuid, name text, email text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.name, p.email
  from public.profiles p
  join public.organization_members m on m.user_id = p.id
  where m.org_id = _org_id
    and exists (
      select 1 from public.organization_members me
      where me.org_id = _org_id and me.user_id = auth.uid()
    );
$$;

grant execute on function public.tc_org_member_profiles(uuid) to authenticated;
