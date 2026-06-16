-- Saved Views: named filter + column combos for the worksheet grid, shared per org.
create table if not exists public.worksheet_saved_views (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null,
  name text not null,
  work_type text,
  config jsonb not null default '{}'::jsonb,
  is_shared boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_wsv_org on public.worksheet_saved_views(org_id);

alter table public.worksheet_saved_views enable row level security;

-- Members of the org see shared views, plus their own private views
drop policy if exists wsv_select on public.worksheet_saved_views;
create policy wsv_select on public.worksheet_saved_views for select
using (
  (is_shared and exists (
    select 1 from public.organization_members m
    where m.org_id = worksheet_saved_views.org_id and m.user_id = auth.uid()
  ))
  or created_by = auth.uid()
);

-- Any org member can create a view (created_by must be them)
drop policy if exists wsv_insert on public.worksheet_saved_views;
create policy wsv_insert on public.worksheet_saved_views for insert
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.organization_members m
    where m.org_id = worksheet_saved_views.org_id and m.user_id = auth.uid()
  )
);

-- Creator can update / delete their own views
drop policy if exists wsv_update on public.worksheet_saved_views;
create policy wsv_update on public.worksheet_saved_views for update
using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists wsv_delete on public.worksheet_saved_views;
create policy wsv_delete on public.worksheet_saved_views for delete
using (created_by = auth.uid());
