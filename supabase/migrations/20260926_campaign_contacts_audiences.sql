-- Non-client campaign contacts (leads/prospects), named lists, tags, and unsubscribe.

create table if not exists public.campaign_contacts(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  name text,
  email text,
  phone text,
  tags text[] not null default '{}',
  source text default 'manual',          -- manual | csv | demo_request | client
  status text not null default 'active', -- active | unsubscribed | bounced
  unsubscribed boolean not null default false,
  unsub_token uuid not null default gen_random_uuid(),
  client_id uuid,                        -- set when converted to / linked with a client
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_campaign_contacts_org on public.campaign_contacts(org_id);
create unique index if not exists idx_campaign_contacts_email on public.campaign_contacts(org_id, lower(email)) where email is not null;
create unique index if not exists idx_campaign_contacts_token on public.campaign_contacts(unsub_token);

create table if not exists public.campaign_lists(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists idx_campaign_lists_org on public.campaign_lists(org_id);

create table if not exists public.campaign_list_members(
  list_id uuid not null references public.campaign_lists(id) on delete cascade,
  contact_id uuid not null references public.campaign_contacts(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key(list_id, contact_id)
);

alter table public.comm_logs add column if not exists contact_id uuid;

alter table public.campaign_contacts enable row level security;
alter table public.campaign_lists enable row level security;
alter table public.campaign_list_members enable row level security;

drop policy if exists campaign_contacts_org on public.campaign_contacts;
create policy campaign_contacts_org on public.campaign_contacts for all
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

drop policy if exists campaign_lists_org on public.campaign_lists;
create policy campaign_lists_org on public.campaign_lists for all
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

drop policy if exists campaign_list_members_org on public.campaign_list_members;
create policy campaign_list_members_org on public.campaign_list_members for all
  using (exists(select 1 from public.campaign_lists l where l.id=list_id and public.is_org_member(l.org_id)))
  with check (exists(select 1 from public.campaign_lists l where l.id=list_id and public.is_org_member(l.org_id)));

-- Public, token-authorized unsubscribe (token is the secret; only flips opt-out).
create or replace function public.campaign_unsubscribe(p_token uuid)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v_email text;
begin
  update public.campaign_contacts set unsubscribed=true, status='unsubscribed'
    where unsub_token=p_token returning email into v_email;
  if v_email is null then return 'notfound'; end if;
  return 'ok';
end; $$;
revoke all on function public.campaign_unsubscribe(uuid) from public;
grant execute on function public.campaign_unsubscribe(uuid) to anon, authenticated;
