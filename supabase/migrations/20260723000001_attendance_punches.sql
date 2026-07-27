create table if not exists attendance_punches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null, punch_type text not null check (punch_type in ('in','out')),
  punched_at timestamptz not null default now(), lat double precision, lng double precision,
  accuracy double precision, address text, note text, created_at timestamptz default now()
);
create index if not exists idx_att_punch_user_day on attendance_punches(org_id, user_id, punched_at);
alter table attendance_punches enable row level security;
-- insert own; select own or org owner/admin; delete own (see migration in DB for full policies).
