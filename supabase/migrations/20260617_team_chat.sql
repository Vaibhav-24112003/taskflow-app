-- Team Chat: org-scoped channels + messages with Realtime support.

create table if not exists public.team_chat_channels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  created_by uuid not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_tcc_org on public.team_chat_channels(org_id);
alter table public.team_chat_channels enable row level security;

drop policy if exists tcc_select on public.team_chat_channels;
create policy tcc_select on public.team_chat_channels for select
using (exists (select 1 from public.organization_members m where m.org_id = team_chat_channels.org_id and m.user_id = auth.uid()));

drop policy if exists tcc_insert on public.team_chat_channels;
create policy tcc_insert on public.team_chat_channels for insert
with check (created_by = auth.uid() and exists (select 1 from public.organization_members m where m.org_id = team_chat_channels.org_id and m.user_id = auth.uid()));

drop policy if exists tcc_update on public.team_chat_channels;
create policy tcc_update on public.team_chat_channels for update
using (exists (select 1 from public.organization_members m where m.org_id = team_chat_channels.org_id and m.user_id = auth.uid() and m.role in ('owner','admin')));

drop policy if exists tcc_delete on public.team_chat_channels;
create policy tcc_delete on public.team_chat_channels for delete
using (exists (select 1 from public.organization_members m where m.org_id = team_chat_channels.org_id and m.user_id = auth.uid() and m.role in ('owner','admin')));

create table if not exists public.team_chat_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid not null references public.team_chat_channels(id) on delete cascade,
  sender_id uuid not null,
  sender_name text not null,
  text text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists idx_tcm_channel on public.team_chat_messages(channel_id, created_at);
create index if not exists idx_tcm_org on public.team_chat_messages(org_id);
alter table public.team_chat_messages enable row level security;

drop policy if exists tcm_select on public.team_chat_messages;
create policy tcm_select on public.team_chat_messages for select
using (exists (select 1 from public.organization_members m where m.org_id = team_chat_messages.org_id and m.user_id = auth.uid()));

drop policy if exists tcm_insert on public.team_chat_messages;
create policy tcm_insert on public.team_chat_messages for insert
with check (sender_id = auth.uid() and exists (select 1 from public.organization_members m where m.org_id = team_chat_messages.org_id and m.user_id = auth.uid()));

drop policy if exists tcm_delete on public.team_chat_messages;
create policy tcm_delete on public.team_chat_messages for delete
using (sender_id = auth.uid());

-- Enable Realtime for messages table
alter publication supabase_realtime add table public.team_chat_messages;
