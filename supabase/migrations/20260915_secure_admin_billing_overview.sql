-- Security fix: admin_billing_overview was SECURITY DEFINER and SELECTable by
-- anon/authenticated, leaking every org's billing/revenue via the REST API.
-- Add an admin-only row guard (is_tfc_admin) and revoke anonymous access.
-- Admins (@taskflowco.in) still see all rows; everyone else gets zero rows.
create or replace view public.admin_billing_overview as
 select s.id as subscription_id, s.org_id, o.name as org_name, s.plan_id, p.name as plan_name,
    s.billing_cycle, s.status, s.override_price, s.discount_pct, s.discount_label,
    s.discount_expires_at, s.current_period_end, s.trial_ends_at, s.notes, s.created_at,
    case
        when s.override_price is not null then s.override_price
        when s.discount_pct > 0 then case when s.billing_cycle='yearly' then p.price_yearly else p.price_monthly end * (100 - s.discount_pct)/100
        else case when s.billing_cycle='yearly' then p.price_yearly else p.price_monthly end
    end as effective_price,
    coalesce((select sum(pe.amount) from payment_events pe where pe.org_id=s.org_id and pe.status='captured'),0::bigint) as total_paid
   from subscriptions s
     join organizations o on o.id = s.org_id
     join plans p on p.id = s.plan_id
  where public.is_tfc_admin();

revoke all on public.admin_billing_overview from anon;
