-- Deleting a practice must remove all its data (owner Danger Zone promise). Every
-- other org-scoped child FK already CASCADEs; these two billing tables were left
-- NO ACTION and blocked org deletion with:
--   update or delete on table "organizations" violates foreign key constraint
--   "payment_events_org_id_fkey" on table "payment_events"
-- Bring them in line with the rest.
alter table public.payment_events
  drop constraint payment_events_org_id_fkey,
  add  constraint payment_events_org_id_fkey
    foreign key (org_id) references public.organizations(id) on delete cascade;

alter table public.subscription_invoices
  drop constraint subscription_invoices_org_id_fkey,
  add  constraint subscription_invoices_org_id_fkey
    foreign key (org_id) references public.organizations(id) on delete cascade;
