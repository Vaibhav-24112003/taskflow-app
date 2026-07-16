-- Client Portal: close cross-tenant leak, add firm password reset, harden RPCs,
-- and support one client email across multiple firms (multi-firm login).
--
-- Root problem: client_requests and client_request_messages granted SELECT to
-- `public` with USING(true), so anyone holding the (public) anon key could read
-- every firm's client requests + messages across all orgs. Anon could also
-- UPDATE requests and INSERT messages. We remove those broad policies and route
-- all portal access through SECURITY DEFINER RPCs scoped to the logged-in
-- portal user (client_portal_access.id acts as the capability, same value the
-- portal already stores in its session).

-- 1) List the logged-in portal user's own requests -----------------------------
create or replace function public.portal_list_requests(p_user_id uuid)
returns setof client_requests
language sql security definer set search_path = public, pg_temp
as $$
  select r.*
  from client_requests r
  join client_portal_access a on a.id = p_user_id and a.is_active
  where r.org_id = a.org_id and r.client_id = a.client_id
  order by r.created_at desc
  limit 200;
$$;

-- 2) List messages for one request the user owns -------------------------------
create or replace function public.portal_list_messages(p_user_id uuid, p_request_id uuid)
returns setof client_request_messages
language sql security definer set search_path = public, pg_temp
as $$
  select m.*
  from client_request_messages m
  where m.request_id = p_request_id
    and exists (
      select 1
      from client_requests r
      join client_portal_access a on a.id = p_user_id and a.is_active
      where r.id = p_request_id and r.org_id = a.org_id and r.client_id = a.client_id
    )
  order by m.created_at
  limit 500;
$$;

-- Helper predicate: does this portal user own this request?
create or replace function public.portal_owns_request(p_user_id uuid, p_request_id uuid)
returns boolean
language sql security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from client_requests r
    join client_portal_access a on a.id = p_user_id and a.is_active
    where r.id = p_request_id and r.org_id = a.org_id and r.client_id = a.client_id
  );
$$;

-- 3) Send a message (client side); marks the request responded -----------------
create or replace function public.portal_send_message(p_user_id uuid, p_request_id uuid, p_message text)
returns client_request_messages
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_msg client_request_messages;
begin
  if not portal_owns_request(p_user_id, p_request_id) then
    raise exception 'not authorized';
  end if;
  insert into client_request_messages (request_id, sender_type, sender_id, message)
    values (p_request_id, 'client', p_user_id, p_message)
    returning * into v_msg;
  update client_requests set status = 'responded', updated_at = now()
    where id = p_request_id and (status is null or status = 'pending');
  return v_msg;
end;
$$;

-- 4) Attach an uploaded file's metadata ----------------------------------------
create or replace function public.portal_add_file(p_user_id uuid, p_request_id uuid, p_file jsonb)
returns client_requests
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_req client_requests;
begin
  if not portal_owns_request(p_user_id, p_request_id) then
    raise exception 'not authorized';
  end if;
  update client_requests
    set files = coalesce(files, '[]'::jsonb) || jsonb_build_array(p_file),
        status = 'responded', updated_at = now()
    where id = p_request_id
    returning * into v_req;
  return v_req;
end;
$$;

-- 5) Submit form responses -----------------------------------------------------
create or replace function public.portal_submit_form(p_user_id uuid, p_request_id uuid, p_responses jsonb)
returns client_requests
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_req client_requests;
begin
  if not portal_owns_request(p_user_id, p_request_id) then
    raise exception 'not authorized';
  end if;
  update client_requests
    set form_responses = p_responses, status = 'responded', updated_at = now()
    where id = p_request_id
    returning * into v_req;
  return v_req;
end;
$$;

-- 6) Org branding for the portal (name/description/settings only) ---------------
create or replace function public.portal_get_org(p_user_id uuid, p_org_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v jsonb;
begin
  if not exists (
    select 1 from client_portal_access a
    where a.id = p_user_id and a.is_active and a.org_id = p_org_id
  ) then
    return null;
  end if;
  select jsonb_build_object('id', o.id, 'name', o.name,
                            'description', o.description,
                            'portal_settings', o.portal_settings)
    into v
  from organizations o where o.id = p_org_id;
  return v;
end;
$$;

-- 7) Remove the cross-tenant public/anon policies ------------------------------
drop policy if exists "Anon can read client requests"        on client_requests;
drop policy if exists "Anon can update open client requests" on client_requests;
drop policy if exists "Anon can read request messages"       on client_request_messages;
drop policy if exists "Anon can insert request messages"     on client_request_messages;

-- 8) Firm-side password reset (authenticated org member only) -------------------
create or replace function public.reset_client_portal_password(p_access_id uuid, p_new_password text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from client_portal_access a
    join organization_members m on m.org_id = a.org_id and m.user_id = auth.uid()
    where a.id = p_access_id
  ) then
    raise exception 'not authorized';
  end if;
  update client_portal_access
    set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf'))
    where id = p_access_id;
end;
$$;

-- 9) Harden self-service change-password: require the current password ----------
drop function if exists public.change_client_portal_password(uuid, text);
create or replace function public.change_client_portal_password(p_user_id uuid, p_old_password text, p_new_password text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_hash text;
begin
  select password_hash into v_hash from client_portal_access where id = p_user_id and is_active;
  if v_hash is null or v_hash <> extensions.crypt(p_old_password, v_hash) then
    return jsonb_build_object('error', 'Current password is incorrect');
  end if;
  update client_portal_access
    set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf'))
    where id = p_user_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- 10) Harden create_client_portal_user: require org membership ------------------
create or replace function public.create_client_portal_user(p_client_id uuid, p_org_id uuid, p_email text, p_password text, p_display_name text default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if not exists (
    select 1 from organization_members m where m.org_id = p_org_id and m.user_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;
  insert into client_portal_access (client_id, org_id, email, password_hash, display_name)
  values (p_client_id, p_org_id, lower(p_email),
          extensions.crypt(p_password, extensions.gen_salt('bf')), p_display_name)
  returning id into v_id;
  return v_id;
end;
$$;

-- 11) Multi-firm login: a client email may have portal accounts at >1 firm.
--     Match ALL active accounts whose password verifies; if exactly one, return
--     it (unchanged shape); if several, return a picker list. -------------------
create or replace function public.client_portal_login(p_email text, p_password text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_email        text := lower(trim(p_email));
  v_throttle     client_portal_login_throttle%rowtype;
  c_max_attempts constant int := 5;
  c_lock_minutes constant int := 15;
  v_matches      jsonb;
  v_count        int;
begin
  select * into v_throttle from client_portal_login_throttle where email = v_email;
  if v_throttle.email is not null
     and v_throttle.locked_until is not null
     and v_throttle.locked_until > now() then
    return jsonb_build_object(
      'error', 'Too many failed attempts. Please try again in a few minutes.',
      'locked', true);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'client_id', a.client_id, 'org_id', a.org_id,
           'email', a.email, 'display_name', a.display_name, 'firm', o.name)), '[]'::jsonb),
         count(*)
    into v_matches, v_count
  from client_portal_access a
  left join organizations o on o.id = a.org_id
  where a.email = v_email and a.is_active = true
    and a.password_hash = extensions.crypt(p_password, a.password_hash);

  if v_count = 0 then
    insert into client_portal_login_throttle as t (email, fail_count, updated_at)
      values (v_email, 1, now())
    on conflict (email) do update
      set fail_count = case when t.locked_until is not null and t.locked_until <= now()
                            then 1 else t.fail_count + 1 end,
          locked_until = null, updated_at = now();
    select * into v_throttle from client_portal_login_throttle where email = v_email;
    if v_throttle.fail_count >= c_max_attempts then
      update client_portal_login_throttle
        set locked_until = now() + (c_lock_minutes || ' minutes')::interval,
            fail_count = 0, updated_at = now()
        where email = v_email;
    end if;
    return jsonb_build_object('error', 'Invalid email or password');
  end if;

  delete from client_portal_login_throttle where email = v_email;
  update client_portal_access set last_login = now()
    where email = v_email and is_active = true
      and password_hash = extensions.crypt(p_password, password_hash);

  if v_count = 1 then
    return (v_matches -> 0);
  end if;
  return jsonb_build_object('multi', true, 'accounts', v_matches);
end;
$$;
