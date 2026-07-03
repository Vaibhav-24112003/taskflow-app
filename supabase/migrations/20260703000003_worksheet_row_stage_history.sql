-- ─────────────────────────────────────────────────────────────────────────────
-- Stage/status history + aging ("where is this stuck, and for how long")
--
-- Records who moved a worksheet row to which stage/status and when, so the app can
-- surface "in Review for 6 days", turnaround time, and reviewer bottlenecks — none
-- of which were possible before (only a single completed_at existed).
--
-- Additive & forward-only: prior moves weren't recorded, so history begins at deploy.
-- The trigger logs only real CHANGES on UPDATE, so the recurrence generator's bulk
-- row inserts produce no noise. moved_by = auth.uid() (null for service/cron writes).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.worksheet_row_stage_events (
  id bigint generated always as identity primary key,
  row_id uuid not null references public.worksheet_rows(id) on delete cascade,
  org_id uuid,
  from_stage text,
  to_stage text,
  from_status text,
  to_status text,
  moved_by uuid,
  moved_at timestamptz not null default now()
);
create index if not exists idx_stage_events_row on public.worksheet_row_stage_events(row_id, moved_at desc);
create index if not exists idx_stage_events_org on public.worksheet_row_stage_events(org_id, moved_at desc);

alter table public.worksheet_row_stage_events enable row level security;

drop policy if exists stage_events_select on public.worksheet_row_stage_events;
create policy stage_events_select on public.worksheet_row_stage_events
  for select using (
    org_id in (select om.org_id from public.organization_members om where om.user_id = (select auth.uid()))
  );

create or replace function public.tf_log_stage_event()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.current_stage is distinct from old.current_stage
     or coalesce(new.status,'') is distinct from coalesce(old.status,'') then
    insert into public.worksheet_row_stage_events(row_id, org_id, from_stage, to_stage, from_status, to_status, moved_by)
    values (new.id, new.org_id, old.current_stage, new.current_stage, old.status, new.status, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists trg_log_stage_event on public.worksheet_rows;
create trigger trg_log_stage_event
  after update on public.worksheet_rows
  for each row execute function public.tf_log_stage_event();

-- How long each open row has sat in its current stage (security_invoker → app RLS applies).
create or replace view public.worksheet_row_aging
with (security_invoker = true) as
select
  r.id as row_id, r.org_id, r.worksheet_id, r.client_id,
  r.current_stage, r.status, r.due_date,
  coalesce((select max(e.moved_at) from public.worksheet_row_stage_events e where e.row_id = r.id), r.created_at) as in_stage_since,
  now() - coalesce((select max(e.moved_at) from public.worksheet_row_stage_events e where e.row_id = r.id), r.created_at) as time_in_stage
from public.worksheet_rows r
where coalesce(r.status,'') <> 'completed' and r.archived_at is null;
