-- Bulk task-based billing: link completed tasks to invoices, a non-billable flag,
-- and a per-work-type rate card (fixed amount or hourly rate).

alter table public.worksheet_rows
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists billable boolean not null default true,
  add column if not exists billed_amount numeric;

-- Fast lookup of unbilled work per client
create index if not exists idx_worksheet_rows_unbilled
  on public.worksheet_rows(org_id, client_id)
  where invoice_id is null;

alter table public.work_type_configs
  add column if not exists billing_mode text not null default 'fixed',   -- 'fixed' | 'hourly' | 'none'
  add column if not exists billing_rate numeric;                          -- INR flat (fixed) or INR/hour (hourly)
