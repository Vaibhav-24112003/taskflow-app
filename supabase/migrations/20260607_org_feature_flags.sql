-- Org-level feature flags for voluntary module/section simplification
alter table public.organizations
  add column if not exists feature_flags jsonb not null default '{}'::jsonb;

comment on column public.organizations.feature_flags is
  'Owner-controlled visibility toggles, e.g. {"library":false,"itr_desk":false}. Absent key = enabled.';
