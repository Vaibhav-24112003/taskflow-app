-- ④ Foundation for actual-vs-estimated time & realization (additive, no behaviour change):
--  • work_type_configs.estimated_hours   → default budgeted hours for a work type
--  • worksheet_rows.estimated_hours       → optional per-task override
--  • attendance_time_logs.worksheet_row_id → link a time log to the specific task
--    (populated when logging from a task in Plan My Day → sendToLog)
alter table public.work_type_configs   add column if not exists estimated_hours numeric;
alter table public.worksheet_rows       add column if not exists estimated_hours numeric;
alter table public.attendance_time_logs add column if not exists worksheet_row_id uuid references public.worksheet_rows(id) on delete set null;

create index if not exists idx_time_logs_row on public.attendance_time_logs(worksheet_row_id) where worksheet_row_id is not null;

-- Convenience view: actual logged hours per task vs its estimate (row override → work-type default).
create or replace view public.worksheet_row_time
with (security_invoker = true) as
select
  r.id as row_id, r.org_id, r.worksheet_id, r.client_id,
  coalesce(r.estimated_hours, wtc.estimated_hours) as estimated_hours,
  coalesce((select sum(t.hours + t.minutes/60.0) from public.attendance_time_logs t where t.worksheet_row_id = r.id), 0) as actual_hours
from public.worksheet_rows r
join public.worksheets w on w.id = r.worksheet_id
left join public.work_type_configs wtc on wtc.org_id = r.org_id and wtc.name = w.work_type;
