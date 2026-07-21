alter table work_type_configs add column if not exists desk_type text;
update work_type_configs set desk_type='itr' where is_itr_worktype=true and desk_type is null;
create table if not exists gst_filing_status (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  gstin text, fy text not null, ret_type text not null, ret_period text not null,
  arn text, status text, filed_date date, valid text, due_date date,
  is_late boolean default false, source text default 'manual', created_by uuid,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (org_id, client_id, ret_type, ret_period)
);
alter table gst_filing_status enable row level security;
drop policy if exists "org members manage gst status" on gst_filing_status;
create policy "org members manage gst status" on gst_filing_status for all to authenticated
  using (org_id in (select org_id from organization_members where user_id=(select auth.uid())))
  with check (org_id in (select org_id from organization_members where user_id=(select auth.uid())));
create index if not exists idx_gst_filing_status_org_client on gst_filing_status(org_id, client_id);
create index if not exists idx_gst_filing_status_period on gst_filing_status(org_id, fy, ret_type);
