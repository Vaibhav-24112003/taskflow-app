-- Per-org Tally export mapping (ledger names, voucher types, company, options).
-- Lets each firm map TaskFlowCo -> their exact Tally masters once.
alter table public.organizations
  add column if not exists tally_config jsonb not null default '{}'::jsonb;
