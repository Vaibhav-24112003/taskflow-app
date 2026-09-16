-- Single-row platform-wide settings, admin-configurable, publicly readable
-- (the landing pricing page reads it with the anon key).
create table if not exists public.platform_settings (
  id                    smallint primary key default 1 check (id = 1),
  default_billing_cycle text not null default 'monthly'
                        check (default_billing_cycle in ('monthly','yearly')),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references auth.users(id)
);

insert into public.platform_settings (id) values (1) on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

drop policy if exists platform_settings_read  on public.platform_settings;
drop policy if exists platform_settings_write on public.platform_settings;

-- Anyone (incl. the public landing page via anon) may read the settings.
create policy platform_settings_read
  on public.platform_settings for select
  to anon, authenticated
  using (true);

-- Only platform admins (@taskflowco.in) may change them.
create policy platform_settings_write
  on public.platform_settings for update
  to authenticated
  using (public.is_tfc_admin())
  with check (public.is_tfc_admin());
