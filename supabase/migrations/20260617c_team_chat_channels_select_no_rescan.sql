-- ── Fix: team_chat_channels INSERT...RETURNING fails RLS for the creator ──
-- The SELECT policy used tc_can_see_channel(id), a SECURITY DEFINER function
-- that RE-SCANS team_chat_channels by id. During INSERT ... RETURNING (which
-- the client does via .insert().select()), the brand-new row is not yet
-- visible to that in-function re-scan within the same command, so the
-- function returned false and Postgres rejected the row with
-- "new row violates row-level security policy". This blocked DM/group
-- creation for everyone (admins happened to avoid it only when no RETURNING
-- was used).
--
-- Fix: evaluate visibility against the row's OWN columns (created_by, kind,
-- org_id, id) directly in the policy, so no self-rescan is needed. The
-- channel-membership branch uses a SECURITY DEFINER helper that reads the
-- participants table (not team_chat_channels) to avoid policy recursion.

create or replace function public.tc_is_channel_member(_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.team_chat_channel_members cm
    where cm.channel_id = _channel_id and cm.user_id = auth.uid()
  );
$$;
grant execute on function public.tc_is_channel_member(uuid) to authenticated;

-- Direct-column SELECT policy: no re-scan of team_chat_channels, so the
-- RETURNING row's created_by is checked against auth.uid() immediately.
drop policy if exists tcc_select on public.team_chat_channels;
create policy tcc_select on public.team_chat_channels
  for select using (
    created_by = auth.uid()
    or (kind = 'channel' and public.is_org_member(org_id))
    or public.tc_is_channel_member(id)
  );
