-- Per-member module visibility
CREATE TABLE IF NOT EXISTS member_module_access (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  module_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  UNIQUE(org_id, user_id, module_id)
);
ALTER TABLE member_module_access ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='member_module_access' AND policyname='mma_org_member') THEN
    CREATE POLICY "mma_org_member" ON member_module_access FOR ALL USING (
      org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    );
  END IF;
END $$;

-- Per-member extra department access grants
CREATE TABLE IF NOT EXISTS member_dept_access (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  department_id uuid REFERENCES departments(id) ON DELETE CASCADE,
  access_level text NOT NULL DEFAULT 'view_own',  -- view_own | view_all | full
  UNIQUE(org_id, user_id, department_id)
);
ALTER TABLE member_dept_access ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='member_dept_access' AND policyname='mda_org_member') THEN
    CREATE POLICY "mda_org_member" ON member_dept_access FOR ALL USING (
      org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    );
  END IF;
END $$;

-- Replace check_worksheet_row_access with simplified version
CREATE OR REPLACE FUNCTION check_worksheet_row_access(
  p_org_id uuid,
  p_worksheet_id uuid,
  p_assignee text
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_role text;
  v_dept_id uuid;
  v_access_level text;
BEGIN
  SELECT role INTO v_user_role FROM organization_members
  WHERE user_id = auth.uid() AND org_id = p_org_id;
  IF v_user_role IN ('owner','admin') THEN RETURN true; END IF;
  SELECT wtc.department_id INTO v_dept_id
  FROM work_type_configs wtc
  JOIN worksheets w ON w.work_type = wtc.name AND w.org_id = p_org_id
  WHERE w.id = p_worksheet_id LIMIT 1;
  IF v_dept_id IS NULL THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM department_members WHERE user_id = auth.uid() AND department_id = v_dept_id AND is_head = true) THEN RETURN true; END IF;
  SELECT access_level INTO v_access_level FROM member_dept_access
  WHERE user_id = auth.uid() AND org_id = p_org_id AND department_id = v_dept_id;
  IF v_access_level IN ('view_all','full') THEN RETURN true; END IF;
  RETURN p_assignee = auth.uid()::text;
END;
$$;

-- Replace check_time_log_access with simplified version
CREATE OR REPLACE FUNCTION check_time_log_access(
  p_org_id uuid,
  p_user_id uuid,
  p_work_type text
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_role text;
  v_dept_id uuid;
  v_access_level text;
BEGIN
  SELECT role INTO v_user_role FROM organization_members
  WHERE user_id = auth.uid() AND org_id = p_org_id;
  IF v_user_role IN ('owner','admin') THEN RETURN true; END IF;
  SELECT department_id INTO v_dept_id FROM work_type_configs
  WHERE name = p_work_type AND org_id = p_org_id LIMIT 1;
  IF v_dept_id IS NULL THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM department_members WHERE user_id = auth.uid() AND department_id = v_dept_id AND is_head = true) THEN RETURN true; END IF;
  SELECT access_level INTO v_access_level FROM member_dept_access
  WHERE user_id = auth.uid() AND org_id = p_org_id AND department_id = v_dept_id;
  IF v_access_level IN ('view_all','full') THEN RETURN true; END IF;
  RETURN p_user_id = auth.uid();
END;
$$;
