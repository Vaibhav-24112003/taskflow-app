-- ═══════════════════════════════════════════════════════════════════
-- CLIENT PORTAL — SQL Migration
-- Run this in Supabase Dashboard → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════════

-- 1. Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Add portal_settings to organizations (for site name, logo)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS portal_settings jsonb DEFAULT '{}';

-- 3. Client portal access (login credentials)
CREATE TABLE IF NOT EXISTS client_portal_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  password_hash text NOT NULL,
  display_name text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  last_login timestamptz,
  UNIQUE(email, org_id)
);

-- 4. Client requests (firm → client)
CREATE TABLE IF NOT EXISTS client_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'communication',
  title text NOT NULL,
  description text,
  status text DEFAULT 'pending',
  due_date date,
  amount numeric,
  attachments jsonb DEFAULT '[]',
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 5. Messages/replies on requests
CREATE TABLE IF NOT EXISTS client_request_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES client_requests(id) ON DELETE CASCADE,
  sender_type text NOT NULL DEFAULT 'firm',
  sender_id uuid,
  message text,
  attachments jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

-- 6. RPC: Create a client portal user (hashes password with bcrypt)
CREATE OR REPLACE FUNCTION create_client_portal_user(
  p_client_id uuid,
  p_org_id uuid,
  p_email text,
  p_password text,
  p_display_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO client_portal_access (client_id, org_id, email, password_hash, display_name)
  VALUES (p_client_id, p_org_id, lower(p_email), crypt(p_password, gen_salt('bf')), p_display_name)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 7. RPC: Client portal login (verifies password, returns user data)
CREATE OR REPLACE FUNCTION client_portal_login(
  p_email text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_access client_portal_access%ROWTYPE;
BEGIN
  SELECT * INTO v_access
  FROM client_portal_access
  WHERE email = lower(p_email) AND is_active = true
  LIMIT 1;

  IF v_access.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid email or password');
  END IF;

  IF v_access.password_hash != crypt(p_password, v_access.password_hash) THEN
    RETURN jsonb_build_object('error', 'Invalid email or password');
  END IF;

  UPDATE client_portal_access SET last_login = now() WHERE id = v_access.id;

  RETURN jsonb_build_object(
    'id', v_access.id,
    'client_id', v_access.client_id,
    'org_id', v_access.org_id,
    'email', v_access.email,
    'display_name', v_access.display_name
  );
END;
$$;

-- 8. RPC: Change client portal password
CREATE OR REPLACE FUNCTION change_client_portal_password(
  p_user_id uuid,
  p_new_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE client_portal_access
  SET password_hash = crypt(p_new_password, gen_salt('bf'))
  WHERE id = p_user_id;
END;
$$;

-- 9. Row Level Security
ALTER TABLE client_portal_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_request_messages ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users (firm) full access to portal tables
CREATE POLICY "Authenticated users can manage portal access"
  ON client_portal_access FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage client requests"
  ON client_requests FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage request messages"
  ON client_request_messages FOR ALL
  USING (true) WITH CHECK (true);

-- Allow anonymous access for client portal login (RPC handles auth)
-- The RPC functions use SECURITY DEFINER so they bypass RLS
-- But clients need to read their own requests and messages:
CREATE POLICY "Anon can read client requests"
  ON client_requests FOR SELECT
  USING (true);

CREATE POLICY "Anon can read request messages"
  ON client_request_messages FOR SELECT
  USING (true);

CREATE POLICY "Anon can insert request messages"
  ON client_request_messages FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anon can update client requests"
  ON client_requests FOR UPDATE
  USING (true) WITH CHECK (true);

-- Grant execute on RPC functions to anon role (for client login)
GRANT EXECUTE ON FUNCTION client_portal_login TO anon;
GRANT EXECUTE ON FUNCTION create_client_portal_user TO authenticated;
GRANT EXECUTE ON FUNCTION change_client_portal_password TO anon;

-- Grant table access to anon for client portal reads/writes
GRANT SELECT, INSERT ON client_request_messages TO anon;
GRANT SELECT, UPDATE ON client_requests TO anon;
GRANT SELECT ON organizations TO anon;

-- Done! Client Portal is ready.
-- NOTE: Create a Storage bucket called "client-portal" in Supabase Dashboard → Storage
--       Set it to public (or use signed URLs). This is for file uploads.

-- ═══════════════════════════════════════════════════════════════════
-- Phase 2: Structured Q&A forms + File uploads
-- Run this AFTER the migration above has been applied
-- ═══════════════════════════════════════════════════════════════════

-- Add form_fields (question form schema), form_responses (client answers), files (uploaded docs)
ALTER TABLE client_requests ADD COLUMN IF NOT EXISTS form_fields jsonb DEFAULT '[]';
ALTER TABLE client_requests ADD COLUMN IF NOT EXISTS form_responses jsonb DEFAULT '{}';
ALTER TABLE client_requests ADD COLUMN IF NOT EXISTS files jsonb DEFAULT '[]';

-- Email templates for reusable request notifications
CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  type text DEFAULT 'general',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage email templates"
  ON email_templates FOR ALL USING (true) WITH CHECK (true);
