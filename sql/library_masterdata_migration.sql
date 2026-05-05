-- Library: Credentials vault
CREATE TABLE IF NOT EXISTS client_credentials (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  portal_name text NOT NULL,
  username text,
  password text,
  pan text,
  email text,
  mobile text,
  notes text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_credentials_org_id_idx ON client_credentials(org_id);
CREATE INDEX IF NOT EXISTS client_credentials_client_id_idx ON client_credentials(client_id);

-- Library: Global SOPs
CREATE TABLE IF NOT EXISTS org_sops (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL,
  title text NOT NULL,
  category text,
  work_type text,
  content text,
  steps jsonb DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_sops_org_id_idx ON org_sops(org_id);
