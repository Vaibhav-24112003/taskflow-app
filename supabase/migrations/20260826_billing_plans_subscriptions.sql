-- ─────────────────────────────────────────────────────────────────
-- TaskFlowCo: Billing, Plans, Subscriptions, Invoices
-- Migration: 20260826_billing_plans_subscriptions.sql
-- ─────────────────────────────────────────────────────────────────

-- ── Plans (admin-managed, includes offers & categories) ──────────
create table if not exists plans (
  id            text primary key,          -- 'starter','pro','enterprise'
  name          text not null,
  category      text not null default 'core',  -- core | addon | bundle
  description   text,
  price_monthly integer not null,           -- paise
  price_yearly  integer not null,           -- paise (full year)
  features      jsonb  default '[]',        -- array of feature strings
  limits        jsonb  default '{}',        -- {clients:50, users:5, ...}
  is_active     boolean default true,
  is_featured   boolean default false,      -- shown as "Most popular"
  sort_order    integer default 0,
  badge         text,                       -- "New" | "Best Value" | null
  offer_label   text,                       -- "20% off" | "Limited time" | null
  offer_expires_at timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Seed default plans
insert into plans (id, name, category, description, price_monthly, price_yearly, features, limits, is_featured, sort_order) values
  ('starter', 'Starter', 'core', 'For solo practitioners and small CA firms',
   99900, 999000,
   '["Up to 3 users","50 clients","GST worksheets","ITR tracking","Task management","Email support"]',
   '{"users":3,"clients":50,"workspaces":2}',
   false, 1),
  ('pro', 'Pro', 'core', 'For growing CA, CS and tax advisory firms',
   199900, 1999000,
   '["Up to 10 users","250 clients","Everything in Starter","Client portal","Team workload view","Priority support","Billing & invoicing","Custom workflows"]',
   '{"users":10,"clients":250,"workspaces":10}',
   true, 2),
  ('enterprise', 'Enterprise', 'core', 'For large multi-branch CA firms',
   499900, 4999000,
   '["Unlimited users","Unlimited clients","Everything in Pro","Dedicated account manager","Custom integrations","SLA support","White-label options"]',
   '{"users":-1,"clients":-1,"workspaces":-1}',
   false, 3)
on conflict (id) do nothing;

-- ── Subscriptions ────────────────────────────────────────────────
create table if not exists subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid references organizations(id) on delete cascade,
  plan_id                   text references plans(id),
  billing_cycle             text default 'monthly',   -- monthly | yearly
  status                    text default 'trialing',  -- trialing | active | past_due | cancelled | paused
  razorpay_subscription_id  text,
  razorpay_customer_id      text,
  zoho_customer_id          text,
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  trial_ends_at             timestamptz default (now() + interval '14 days'),
  cancelled_at              timestamptz,
  cancel_reason             text,
  override_price            integer,                  -- admin override in paise (null = use plan price)
  discount_pct              integer default 0,        -- 0-100
  discount_label            text,                     -- "Early adopter 30%"
  discount_expires_at       timestamptz,
  notes                     text,                     -- admin notes
  created_at                timestamptz default now(),
  updated_at                timestamptz default now(),
  unique(org_id)
);

-- ── Payment events (append-only audit log) ───────────────────────
create table if not exists payment_events (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid references organizations(id),
  subscription_id       uuid references subscriptions(id),
  razorpay_order_id     text,
  razorpay_payment_id   text unique,
  razorpay_signature    text,
  amount                integer,                      -- paise received
  currency              text default 'INR',
  status                text,                         -- captured | failed | refunded
  event_type            text,                         -- payment.captured | payment.failed
  failure_reason        text,
  raw_webhook           jsonb,
  zoho_invoice_id       text,
  zoho_invoice_number   text,
  created_at            timestamptz default now()
);

-- ── Invoice metadata (mirrors Zoho Books, local copy) ────────────
create table if not exists invoices (
  id                  uuid primary key default gen_random_uuid(),
  invoice_number      text unique,                    -- TFC-2026-0001 (local ref)
  org_id              uuid references organizations(id),
  payment_event_id    uuid references payment_events(id),
  plan_id             text,
  billing_cycle       text,
  amount              integer,
  zoho_invoice_id     text,                           -- Zoho Books invoice ID
  zoho_invoice_url    text,                           -- direct URL to PDF in Zoho
  email_status        text default 'pending',         -- pending | sent | failed
  emailed_at          timestamptz,
  created_at          timestamptz default now()
);

-- ── Invoice sequence function ─────────────────────────────────────
create sequence if not exists invoice_seq start 1;
create or replace function next_invoice_number()
returns text language sql security definer as $$
  select 'TFC-' || extract(year from now())::text || '-' || lpad(nextval('invoice_seq')::text, 4, '0');
$$;

-- ── RLS ───────────────────────────────────────────────────────────
alter table plans          enable row level security;
alter table subscriptions  enable row level security;
alter table payment_events enable row level security;
alter table invoices       enable row level security;

-- Plans: everyone can read active plans
create policy "anyone can view active plans" on plans for select using (is_active = true);
create policy "admin full access to plans" on plans for all
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

-- Subscriptions: org members see their own
create policy "org members view own subscription" on subscriptions for select
  using (org_id in (select org_id from organization_members where user_id = auth.uid()));
create policy "no direct write to subscriptions" on subscriptions for insert with check (false);
create policy "admin full access to subscriptions" on subscriptions for all
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

-- Payment events: org members see own
create policy "org members view own payments" on payment_events for select
  using (org_id in (select org_id from organization_members where user_id = auth.uid()));
create policy "no direct write to payment_events" on payment_events for insert with check (false);
create policy "admin full access to payment_events" on payment_events for all
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

-- Invoices: org members see own
create policy "org members view own invoices" on invoices for select
  using (org_id in (select org_id from organization_members where user_id = auth.uid()));
create policy "no direct write to invoices" on invoices for insert with check (false);
create policy "admin full access to invoices" on invoices for all
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

-- ── Admin billing view ─────────────────────────────────────────────
create or replace view admin_billing_overview as
select
  s.id                  as subscription_id,
  s.org_id,
  o.name                as org_name,
  s.plan_id,
  p.name                as plan_name,
  s.billing_cycle,
  s.status,
  s.override_price,
  s.discount_pct,
  s.discount_label,
  s.discount_expires_at,
  s.current_period_end,
  s.trial_ends_at,
  s.notes,
  s.created_at,
  -- effective price in paise
  case
    when s.override_price is not null then s.override_price
    when s.discount_pct > 0 then
      (case when s.billing_cycle='yearly' then p.price_yearly else p.price_monthly end)
      * (100 - s.discount_pct) / 100
    else
      case when s.billing_cycle='yearly' then p.price_yearly else p.price_monthly end
  end as effective_price,
  -- total paid (sum of captured payments)
  coalesce((
    select sum(pe.amount) from payment_events pe
    where pe.org_id = s.org_id and pe.status = 'captured'
  ), 0) as total_paid
from subscriptions s
join organizations o on o.id = s.org_id
join plans p on p.id = s.plan_id;
