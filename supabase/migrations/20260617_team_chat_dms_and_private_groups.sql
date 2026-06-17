-- ── Team Chat: 1:1 DMs + private groups ──────────────────────────────
-- Channel kind: 'channel' = public org-wide, 'dm' = 1:1, 'group' = private group
alter table public.team_chat_channels
  add column if not exists kind text not null default 'channel',
  add column if not exists dm_key text;  -- deterministic key for 1:1 dedup (sorted uid pair)

-- Dedup 1:1 DMs within an org
create unique index if not exists team_chat_channels_dm_key_uniq
  on public.team_chat_channels(org_id, dm_key) where dm_key is not null;

-- Participants for dm/group channels
create table if not exists public.team_chat_channel_members (
  channel_id uuid not null references public.team_chat_channels(id) on delete cascade,
  user_id    uuid not null,
  org_id     uuid not null,
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index if not exists tccm_user_idx on public.team_chat_channel_members(user_id);
alter table public.team_chat_channel_members enable row level security;

-- ── Visibility helper (security definer bypasses RLS → no policy recursion) ──
create or replace function public.tc_can_see_channel(_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.team_chat_channels c
    where c.id = _channel_id
      and (
        c.created_by = auth.uid()  -- creator can always see their channel (incl. INSERT...RETURNING)
        or (c.kind = 'channel' and exists (
          select 1 from public.organization_members m
          where m.org_id = c.org_id and m.user_id = auth.uid()))
        or exists (
          select 1 from public.team_chat_channel_members cm
          where cm.channel_id = c.id and cm.user_id = auth.uid())
      )
  );
$$;

-- ── Channels: replace blanket org-wide SELECT with visibility-aware one ──
drop policy if exists tcc_select on public.team_chat_channels;
create policy tcc_select on public.team_chat_channels
  for select using ( public.tc_can_see_channel(id) );

-- ── Channel members RLS ──
drop policy if exists tccm_select on public.team_chat_channel_members;
create policy tccm_select on public.team_chat_channel_members
  for select using ( public.tc_can_see_channel(channel_id) );

drop policy if exists tccm_insert on public.team_chat_channel_members;
create policy tccm_insert on public.team_chat_channel_members
  for insert with check (
    org_id in (select m.org_id from public.organization_members m where m.user_id = auth.uid())
    and exists (
      select 1 from public.team_chat_channels c
      where c.id = channel_id and c.created_by = auth.uid()
    )
  );

drop policy if exists tccm_delete on public.team_chat_channel_members;
create policy tccm_delete on public.team_chat_channel_members
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.team_chat_channels c where c.id = channel_id and c.created_by = auth.uid())
  );

-- ── Messages: restrict read/write to channels the user can actually see ──
drop policy if exists tcm_select on public.team_chat_messages;
create policy tcm_select on public.team_chat_messages
  for select using ( public.tc_can_see_channel(channel_id) );

drop policy if exists tcm_insert on public.team_chat_messages;
create policy tcm_insert on public.team_chat_messages
  for insert with check (
    sender_id = auth.uid()
    and exists (select 1 from public.organization_members m where m.org_id = team_chat_messages.org_id and m.user_id = auth.uid())
    and public.tc_can_see_channel(channel_id)
  );

-- Realtime for participants table (channels/messages already published)
alter publication supabase_realtime add table public.team_chat_channel_members;
