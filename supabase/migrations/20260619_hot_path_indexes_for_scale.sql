-- Scale-critical indexes on the hottest user-facing query paths. Additive,
-- safe. These keep the most-used screens fast as worksheet_rows / time logs
-- grow into the hundreds of thousands / millions of rows (toward ~100 firms).

-- Opening a worksheet's rows: WHERE worksheet_id = X (very hot)
create index if not exists idx_worksheet_rows_worksheet_id
  on public.worksheet_rows (worksheet_id);

-- My Day / overdue / calendar: filter by org + due_date
create index if not exists idx_worksheet_rows_org_due
  on public.worksheet_rows (org_id, due_date);

-- Time logs & reports: per-member by date
create index if not exists idx_atl_user_date
  on public.attendance_time_logs (user_id, date);

-- Kanban board load: tasks by workspace
create index if not exists idx_tasks_workspace_id
  on public.tasks (workspace_id);

-- Task history panel: activity by task
create index if not exists idx_task_activity_task_id
  on public.task_activity (task_id);
