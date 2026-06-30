-- Fix: client-connect public form failed to submit ("Failed to submit") when
-- the person filling it was logged into TaskFlow but not a member of the org
-- that owns the request. Those submits run as `authenticated`, and the only
-- authenticated INSERT policy on client_connect_responses required org
-- membership, so RLS rejected the row. Anonymous (logged-out) submits already
-- worked via anon_insert_cc_responses.
--
-- These forms are link-based and meant to be filled by anyone with the link,
-- so add an authenticated insert policy mirroring the anon one.
create policy auth_insert_cc_responses on public.client_connect_responses
  for insert to authenticated
  with check (request_id in (select id from client_connect_requests));

-- The client also marks the request 'responded' after submit, but that UPDATE
-- is RLS-blocked for non-members (anon and authenticated alike). Do it
-- server-side via a trigger so status updates regardless of who submits.
create or replace function public.cc_mark_request_responded()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update client_connect_requests
    set status = 'responded'
  where id = new.request_id and coalesce(status,'') <> 'responded';
  return new;
end;
$$;

drop trigger if exists trg_cc_mark_responded on public.client_connect_responses;
create trigger trg_cc_mark_responded
  after insert on public.client_connect_responses
  for each row execute function public.cc_mark_request_responded();
