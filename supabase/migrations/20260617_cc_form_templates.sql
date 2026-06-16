-- Client Connect enhancements: reusable form templates, standalone public forms, task auto-fill linkage.

-- Reusable form templates
create table if not exists public.cc_form_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null,
  name text not null,
  description text,
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_ccft_org on public.cc_form_templates(org_id);
alter table public.cc_form_templates enable row level security;

drop policy if exists ccft_select on public.cc_form_templates;
create policy ccft_select on public.cc_form_templates for select
using (exists (select 1 from public.organization_members m where m.org_id = cc_form_templates.org_id and m.user_id = auth.uid()));

drop policy if exists ccft_insert on public.cc_form_templates;
create policy ccft_insert on public.cc_form_templates for insert
with check (created_by = auth.uid() and exists (select 1 from public.organization_members m where m.org_id = cc_form_templates.org_id and m.user_id = auth.uid()));

drop policy if exists ccft_update on public.cc_form_templates;
create policy ccft_update on public.cc_form_templates for update
using (exists (select 1 from public.organization_members m where m.org_id = cc_form_templates.org_id and m.user_id = auth.uid()));

drop policy if exists ccft_delete on public.cc_form_templates;
create policy ccft_delete on public.cc_form_templates for delete
using (created_by = auth.uid());

-- Standalone public intake forms (no client) + task auto-fill linkage
alter table public.client_connect_requests alter column client_id drop not null;
alter table public.client_connect_requests add column if not exists is_public boolean not null default false;
alter table public.client_connect_requests add column if not exists link_row_id uuid;
alter table public.client_connect_requests add column if not exists applied_at timestamptz;
