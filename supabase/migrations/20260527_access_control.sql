-- Access Control: Departments, Roles, and Member Permission Overrides

-- Departments
CREATE TABLE IF NOT EXISTS departments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL,
  name text NOT NULL,
  parent_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  color text DEFAULT '#6b8cad',
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, name)
);
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dept_org_member" ON departments FOR ALL USING (
  org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
);

-- Department members
CREATE TABLE IF NOT EXISTS department_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL,
  department_id uuid REFERENCES departments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  is_head boolean DEFAULT false,
  UNIQUE(department_id, user_id)
);
ALTER TABLE department_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dept_members_org_member" ON department_members FOR ALL USING (
  org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
);

-- Org roles
CREATE TABLE IF NOT EXISTS org_roles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL,
  name text NOT NULL,
  level integer NOT NULL DEFAULT 4,
  color text DEFAULT '#6b8cad',
  is_system boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, name)
);
ALTER TABLE org_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_roles_member" ON org_roles FOR ALL USING (
  org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
);

-- Add role_id to organization_members (nullable, links to org_roles)
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES org_roles(id) ON DELETE SET NULL;

-- Role-level permissions
CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL,
  role_id uuid REFERENCES org_roles(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  access text NOT NULL DEFAULT 'none',  -- none | view | edit | manage
  scope text NOT NULL DEFAULT 'own',    -- own | dept | all
  UNIQUE(role_id, node_id)
);
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_perms_member" ON role_permissions FOR ALL USING (
  org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
);

-- Member-level permission overrides (sparse — only when different from role)
CREATE TABLE IF NOT EXISTS member_permissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  node_id text NOT NULL,
  access text,   -- null = inherit from role
  scope text,    -- null = inherit from role
  UNIQUE(user_id, node_id, org_id)
);
ALTER TABLE member_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "member_perms_org_member" ON member_permissions FOR ALL USING (
  org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
);
