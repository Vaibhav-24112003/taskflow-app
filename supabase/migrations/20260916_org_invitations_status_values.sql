-- The membership RPCs use 'cancelled' (owner/admin cancels a pending invite) and
-- 'expired' (accept of a lapsed invite), but the status CHECK only allowed
-- pending/accepted/declined — so cancelling raised
--   new row for relation "org_invitations" violates check constraint
--   "org_invitations_status_check"
-- Allow the full set.
alter table public.org_invitations drop constraint org_invitations_status_check;
alter table public.org_invitations add constraint org_invitations_status_check
  check (status = any (array['pending','accepted','declined','cancelled','expired']));
