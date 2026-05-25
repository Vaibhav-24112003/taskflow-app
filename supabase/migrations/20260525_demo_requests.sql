-- Demo requests table for "Book a Demo" landing page form
create table if not exists public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  firm_name text,
  team_size text,
  message text,
  status text not null default 'new', -- new | contacted | converted | declined
  created_at timestamptz not null default now()
);

alter table public.demo_requests enable row level security;

-- Anyone can submit a demo request
create policy "public insert" on public.demo_requests
  for insert with check (true);

-- Only org owners/admins and @taskflowco.in staff can read
create policy "admin read" on public.demo_requests
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and email like '%@taskflowco.in'
    )
    or exists (
      select 1 from public.organization_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

-- Only the same set can update status
create policy "admin update" on public.demo_requests
  for update using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and email like '%@taskflowco.in'
    )
    or exists (
      select 1 from public.organization_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );
