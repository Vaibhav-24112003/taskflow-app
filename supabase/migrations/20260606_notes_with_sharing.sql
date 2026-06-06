-- Notes feature: personal free-form notes with block content + org sharing

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid,
  title text not null default '',
  blocks jsonb not null default '[]'::jsonb,
  color text not null default '',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_owner_idx on public.notes(owner_id);
create index if not exists notes_org_idx on public.notes(org_id);

create table if not exists public.note_shares (
  note_id uuid not null references public.notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  can_edit boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

create index if not exists note_shares_user_idx on public.note_shares(user_id);

-- SECURITY DEFINER helpers to avoid RLS recursion between notes <-> note_shares
create or replace function public.is_note_owner(p_note_id uuid)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists(select 1 from public.notes where id = p_note_id and owner_id = auth.uid());
$$;

create or replace function public.note_shared_to_me(p_note_id uuid)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists(select 1 from public.note_shares where note_id = p_note_id and user_id = auth.uid());
$$;

create or replace function public.note_can_edit_shared(p_note_id uuid)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists(select 1 from public.note_shares where note_id = p_note_id and user_id = auth.uid() and can_edit = true);
$$;

alter table public.notes enable row level security;
alter table public.note_shares enable row level security;

-- notes policies
drop policy if exists notes_owner_all on public.notes;
create policy notes_owner_all on public.notes for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists notes_shared_select on public.notes;
create policy notes_shared_select on public.notes for select
  using (public.note_shared_to_me(id));

drop policy if exists notes_shared_update on public.notes;
create policy notes_shared_update on public.notes for update
  using (public.note_can_edit_shared(id)) with check (public.note_can_edit_shared(id));

-- note_shares policies
drop policy if exists note_shares_owner_all on public.note_shares;
create policy note_shares_owner_all on public.note_shares for all
  using (public.is_note_owner(note_id)) with check (public.is_note_owner(note_id));

drop policy if exists note_shares_self_select on public.note_shares;
create policy note_shares_self_select on public.note_shares for select
  using (user_id = auth.uid());

-- keep updated_at fresh
create or replace function public.touch_notes_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists notes_touch_updated on public.notes;
create trigger notes_touch_updated before update on public.notes
  for each row execute function public.touch_notes_updated_at();
