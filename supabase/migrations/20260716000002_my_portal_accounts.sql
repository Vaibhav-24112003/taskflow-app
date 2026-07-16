create or replace function public.my_portal_accounts()
returns jsonb language sql security definer set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'client_id', a.client_id, 'org_id', a.org_id,
           'email', a.email, 'display_name', a.display_name, 'firm', o.name)), '[]'::jsonb)
  from client_portal_access a
  left join organizations o on o.id = a.org_id
  where a.is_active and lower(a.email) = lower(coalesce((auth.jwt() ->> 'email'), ''));
$$;
