-- ── Client-portal login: brute-force protection + crypt() schema fix ──
-- 1) Adds per-email rate limiting + lockout to client_portal_login so bots
--    can't guess client passwords. Enforced inside the SECURITY DEFINER
--    function, so it can't be bypassed by calling the RPC directly.
-- 2) Schema-qualifies crypt()/gen_salt() as extensions.* — pgcrypto lives in
--    the `extensions` schema, and the functions pin search_path to
--    (public, pg_temp), so the unqualified calls did not resolve. This also
--    repairs portal login / user creation / password change.

-- Throttle store (locked down: only the SECURITY DEFINER function touches it)
create table if not exists public.client_portal_login_throttle (
  email        text primary key,
  fail_count   int not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);
alter table public.client_portal_login_throttle enable row level security;
revoke all on public.client_portal_login_throttle from anon, authenticated;

-- Login with rate limiting + lockout (5 failures → 15-minute lock)
create or replace function public.client_portal_login(p_email text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_access    client_portal_access%rowtype;
  v_email     text := lower(trim(p_email));
  v_throttle  client_portal_login_throttle%rowtype;
  c_max_attempts constant int := 5;
  c_lock_minutes constant int := 15;
begin
  -- If currently locked, refuse without checking the password.
  select * into v_throttle from client_portal_login_throttle where email = v_email;
  if v_throttle.email is not null
     and v_throttle.locked_until is not null
     and v_throttle.locked_until > now() then
    return jsonb_build_object(
      'error', 'Too many failed attempts. Please try again in a few minutes.',
      'locked', true
    );
  end if;

  select * into v_access
  from client_portal_access
  where email = v_email and is_active = true
  limit 1;

  if v_access.id is null
     or v_access.password_hash != extensions.crypt(p_password, v_access.password_hash) then
    -- Record a failed attempt atomically; restart count if a prior lock expired.
    insert into client_portal_login_throttle as t (email, fail_count, updated_at)
      values (v_email, 1, now())
    on conflict (email) do update
      set fail_count = case when t.locked_until is not null and t.locked_until <= now()
                            then 1 else t.fail_count + 1 end,
          locked_until = null,
          updated_at = now();

    select * into v_throttle from client_portal_login_throttle where email = v_email;
    if v_throttle.fail_count >= c_max_attempts then
      update client_portal_login_throttle
        set locked_until = now() + (c_lock_minutes || ' minutes')::interval,
            fail_count = 0,
            updated_at = now()
        where email = v_email;
    end if;

    -- Same generic message either way: never reveal whether the email exists.
    return jsonb_build_object('error', 'Invalid email or password');
  end if;

  -- Success: clear throttle state and log them in.
  delete from client_portal_login_throttle where email = v_email;
  update client_portal_access set last_login = now() where id = v_access.id;

  return jsonb_build_object(
    'id', v_access.id,
    'client_id', v_access.client_id,
    'org_id', v_access.org_id,
    'email', v_access.email,
    'display_name', v_access.display_name
  );
end;
$function$;

-- Sibling functions: same extensions.* qualification so create / change work.
create or replace function public.create_client_portal_user(
  p_client_id uuid, p_org_id uuid, p_email text, p_password text, p_display_name text default null::text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_id uuid;
begin
  insert into client_portal_access (client_id, org_id, email, password_hash, display_name)
  values (p_client_id, p_org_id, lower(p_email),
          extensions.crypt(p_password, extensions.gen_salt('bf')), p_display_name)
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.change_client_portal_password(p_user_id uuid, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  update client_portal_access
  set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf'))
  where id = p_user_id;
end;
$function$;
