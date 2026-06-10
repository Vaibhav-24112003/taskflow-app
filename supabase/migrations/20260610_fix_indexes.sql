-- Fix indexes: drop unused/duplicate indexes, add missing FK indexes on hot tables
-- Reduces write amplification and speeds up joins on core tables

-- Drop duplicate indexes (keep the shorter/cleaner name)
DROP INDEX IF EXISTS public.daily_plans_user_date_idx;         -- dup of daily_plans_user_date_task
DROP INDEX IF EXISTS public.idx_daily_plans_user_date;         -- dup of daily_plans_user_date_task
DROP INDEX IF EXISTS public.idx_tasks_delegator_id;            -- dup of idx_tasks_delegator

-- Drop high-churn unused indexes (most writes hit these tables)
DROP INDEX IF EXISTS public.idx_worksheet_rows_ws;
DROP INDEX IF EXISTS public.idx_worksheet_rows_archived_at;
DROP INDEX IF EXISTS public.idx_worksheets_org_type;
DROP INDEX IF EXISTS public.daily_plans_source_idx;
DROP INDEX IF EXISTS public.idx_tasks_recurrence;
DROP INDEX IF EXISTS public.idx_tasks_parent_recurring;
DROP INDEX IF EXISTS public.idx_tasks_sort_order;
DROP INDEX IF EXISTS public.idx_tasks_archived_at;
DROP INDEX IF EXISTS public.idx_tasks_next_occurrence;
DROP INDEX IF EXISTS public.idx_tasks_org;
DROP INDEX IF EXISTS public.idx_tasks_delegator;
DROP INDEX IF EXISTS public.idx_time_entries_date;
DROP INDEX IF EXISTS public.idx_time_entries_user;
DROP INDEX IF EXISTS public.idx_time_entries_task;
DROP INDEX IF EXISTS public.idx_time_entries_client;
DROP INDEX IF EXISTS public.idx_org_members_user;
DROP INDEX IF EXISTS public.idx_workspaces_org;
DROP INDEX IF EXISTS public.idx_access_requests_org;
DROP INDEX IF EXISTS public.idx_clients_status;
DROP INDEX IF EXISTS public.idx_invoice_items_invoice;
DROP INDEX IF EXISTS public.idx_invoice_items_task;
DROP INDEX IF EXISTS public.idx_invitations_email;
DROP INDEX IF EXISTS public.idx_invitations_token;
DROP INDEX IF EXISTS public.idx_org_invitations_token;
DROP INDEX IF EXISTS public.idx_profiles_is_blocked;
DROP INDEX IF EXISTS public.idx_announcements_active;
DROP INDEX IF EXISTS public.support_tickets_status_idx;
DROP INDEX IF EXISTS public.support_tickets_user_id_idx;
DROP INDEX IF EXISTS public.support_tickets_created_at_idx;
DROP INDEX IF EXISTS public.support_tickets_email_idx;
DROP INDEX IF EXISTS public.idx_orgs_trial_expires_at;
DROP INDEX IF EXISTS public.idx_orgs_subscription;
DROP INDEX IF EXISTS public.idx_auth_events_user_id;
DROP INDEX IF EXISTS public.idx_auth_events_created_at;
DROP INDEX IF EXISTS public.idx_auth_events_event;
DROP INDEX IF EXISTS public.idx_org_events_org_id;
DROP INDEX IF EXISTS public.idx_itr_compilation_org;
DROP INDEX IF EXISTS public.idx_itr_compilation_client;
DROP INDEX IF EXISTS public.notes_owner_idx;
DROP INDEX IF EXISTS public.notes_org_idx;
DROP INDEX IF EXISTS public.note_shares_user_idx;
DROP INDEX IF EXISTS public.client_credentials_org_id_idx;
DROP INDEX IF EXISTS public.client_credentials_client_id_idx;
DROP INDEX IF EXISTS public.org_sops_org_id_idx;

-- Add missing FK indexes on the most-queried tables
-- worksheet_rows (core ERP table — every page load hits this)
CREATE INDEX IF NOT EXISTS idx_worksheet_rows_client_id ON public.worksheet_rows(client_id);
CREATE INDEX IF NOT EXISTS idx_worksheet_rows_parent_row_id ON public.worksheet_rows(parent_row_id);

-- attendance_time_logs (queried on every Plan Today load)
CREATE INDEX IF NOT EXISTS idx_atl_org_id ON public.attendance_time_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_atl_client_id ON public.attendance_time_logs(client_id);

-- clients (joined on almost every query)
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON public.clients(created_by);

-- daily_plans
CREATE INDEX IF NOT EXISTS idx_daily_plans_task_id ON public.daily_plans(task_id);

-- organization_members
CREATE INDEX IF NOT EXISTS idx_org_members_role_id ON public.organization_members(role_id);

-- organizations
CREATE INDEX IF NOT EXISTS idx_organizations_created_by ON public.organizations(created_by);

-- worksheets
CREATE INDEX IF NOT EXISTS idx_worksheets_created_by ON public.worksheets(created_by);

-- tasks
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks(created_by);

-- leave_requests
CREATE INDEX IF NOT EXISTS idx_leave_requests_org_id ON public.leave_requests(org_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_user_id ON public.leave_requests(user_id);
