-- ============================================================================
-- Support Tickets — client queries, admin triage, email notifications
-- ============================================================================
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run
-- ============================================================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  subject    text NOT NULL,
  message    text NOT NULL,
  email      text NOT NULL,
  name       text,
  category   text DEFAULT 'general',   -- general · bug · billing · feature · account
  status     text DEFAULT 'open',      -- open · in_progress · resolved · closed
  priority   text DEFAULT 'normal',    -- low · normal · high · urgent
  source     text DEFAULT 'landing',   -- landing · app · admin
  user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id     uuid,                     -- optional, no FK so this works even if you rename orgs table
  admin_notes text,
  metadata   jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS support_tickets_status_idx     ON support_tickets(status);
CREATE INDEX IF NOT EXISTS support_tickets_user_id_idx    ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS support_tickets_created_at_idx ON support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_email_idx      ON support_tickets(lower(email));

-- ── Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. anonymous landing-page visitors) can submit a ticket
DROP POLICY IF EXISTS "anyone can insert ticket" ON support_tickets;
CREATE POLICY "anyone can insert ticket"
  ON support_tickets
  FOR INSERT
  WITH CHECK (true);

-- Logged-in users see their own tickets (matched by user_id OR by email)
DROP POLICY IF EXISTS "users see own tickets" ON support_tickets;
CREATE POLICY "users see own tickets"
  ON support_tickets
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- Admins (any email @taskflowco.in) can read + update + delete every ticket
DROP POLICY IF EXISTS "admins manage all tickets" ON support_tickets;
CREATE POLICY "admins manage all tickets"
  ON support_tickets
  FOR ALL
  USING (
    lower(coalesce(auth.jwt() ->> 'email', '')) LIKE '%@taskflowco.in'
  )
  WITH CHECK (
    lower(coalesce(auth.jwt() ->> 'email', '')) LIKE '%@taskflowco.in'
  );

-- ── Trigger: auto-update updated_at + set resolved_at on status change ─────
CREATE OR REPLACE FUNCTION fn_support_tickets_touch()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'resolved' AND (OLD.status IS NULL OR OLD.status <> 'resolved') THEN
    NEW.resolved_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS support_tickets_touch ON support_tickets;
CREATE TRIGGER support_tickets_touch
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION fn_support_tickets_touch();

-- ============================================================================
-- After running this migration:
-- 1. Deploy the edge function: supabase functions deploy notify-support-ticket
-- 2. Set secrets in Supabase Dashboard → Project Settings → Edge Functions:
--    - RESEND_API_KEY = <your resend api key from resend.com>
--    - SUPPORT_EMAIL  = support@taskflowco.in
--    - FROM_EMAIL     = no-reply@taskflowco.in (must be verified in Resend)
-- 3. Done. New tickets will email you automatically.
-- ============================================================================
