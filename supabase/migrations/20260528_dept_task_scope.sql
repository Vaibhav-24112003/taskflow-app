-- 1. Add department_id to work_type_configs
ALTER TABLE work_type_configs ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id) ON DELETE SET NULL;

-- 2. Core access-check function for worksheet_rows
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
  v_scope text;
  v_has_dept_config boolean;
BEGIN
  -- No roles configured = full access for org members (backward compat)
  IF NOT EXISTS (SELECT 1 FROM org_roles WHERE org_id = p_org_id) THEN
    RETURN EXISTS (SELECT 1 FROM organization_members WHERE user_id = auth.uid() AND org_id = p_org_id);
  END IF;
  -- Owner/admin = full access
  IF EXISTS (SELECT 1 FROM organization_members WHERE user_id = auth.uid() AND org_id = p_org_id AND role IN ('owner','admin')) THEN
    RETURN true;
  END IF;
  -- Get effective scope: member override → role permission → default 'all'
  SELECT COALESCE(
    (SELECT scope FROM member_permissions WHERE user_id = auth.uid() AND org_id = p_org_id AND node_id = 'workzone.worksheets' AND scope IS NOT NULL LIMIT 1),
    (SELECT rp.scope FROM role_permissions rp JOIN organization_members om ON om.role_id = rp.role_id WHERE om.user_id = auth.uid() AND om.org_id = p_org_id AND rp.node_id = 'workzone.worksheets' LIMIT 1),
    'all'
  ) INTO v_scope;
  IF v_scope = 'all' THEN RETURN true; END IF;
  IF v_scope = 'dept' THEN
    SELECT EXISTS (
      SELECT 1 FROM work_type_configs wtc
      JOIN worksheets w ON w.work_type = wtc.name AND w.org_id = p_org_id
      WHERE w.id = p_worksheet_id AND wtc.department_id IS NOT NULL
    ) INTO v_has_dept_config;
    IF NOT v_has_dept_config THEN RETURN true; END IF;
    RETURN EXISTS (
      SELECT 1 FROM work_type_configs wtc
      JOIN worksheets w ON w.work_type = wtc.name AND w.org_id = p_org_id
      JOIN department_members dm ON dm.department_id = wtc.department_id AND dm.org_id = p_org_id
      WHERE w.id = p_worksheet_id AND dm.user_id = auth.uid()
    );
  END IF;
  -- 'own' scope
  RETURN p_assignee = auth.uid()::text;
END;
$$;

-- 3. Drop old worksheet_rows SELECT policy and replace with scoped one
DO $$ BEGIN
  DROP POLICY IF EXISTS "org members manage worksheet_rows" ON worksheet_rows;
  DROP POLICY IF EXISTS "org_member_access" ON worksheet_rows;
  DROP POLICY IF EXISTS "worksheet_rows_select" ON worksheet_rows;
  DROP POLICY IF EXISTS "select_own_org" ON worksheet_rows;
  DROP POLICY IF EXISTS "worksheet_row_select" ON worksheet_rows;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Re-create INSERT/UPDATE/DELETE policy for org members
DO $$ BEGIN
  DROP POLICY IF EXISTS "worksheet_rows_write" ON worksheet_rows;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
CREATE POLICY "worksheet_rows_write" ON worksheet_rows
FOR ALL USING (
  EXISTS (SELECT 1 FROM organization_members WHERE user_id = auth.uid() AND org_id = worksheet_rows.org_id)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM organization_members WHERE user_id = auth.uid() AND org_id = worksheet_rows.org_id)
);

-- Create new scoped SELECT policy
DO $$ BEGIN
  DROP POLICY IF EXISTS "worksheet_rows_dept_scoped" ON worksheet_rows;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
CREATE POLICY "worksheet_rows_dept_scoped" ON worksheet_rows
FOR SELECT USING (
  check_worksheet_row_access(org_id, worksheet_id, COALESCE(data->>'__assignee', ''))
);

-- 4. Same pattern for attendance_time_logs
CREATE OR REPLACE FUNCTION check_time_log_access(p_org_id uuid, p_user_id uuid, p_work_type text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_scope text;
  v_has_dept_config boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_roles WHERE org_id = p_org_id) THEN
    RETURN EXISTS (SELECT 1 FROM organization_members WHERE user_id = auth.uid() AND org_id = p_org_id);
  END IF;
  IF EXISTS (SELECT 1 FROM organization_members WHERE user_id = auth.uid() AND org_id = p_org_id AND role IN ('owner','admin')) THEN
    RETURN true;
  END IF;
  SELECT COALESCE(
    (SELECT scope FROM member_permissions WHERE user_id = auth.uid() AND org_id = p_org_id AND node_id = 'team.logs' AND scope IS NOT NULL LIMIT 1),
    (SELECT rp.scope FROM role_permissions rp JOIN organization_members om ON om.role_id = rp.role_id WHERE om.user_id = auth.uid() AND om.org_id = p_org_id AND rp.node_id = 'team.logs' LIMIT 1),
    'all'
  ) INTO v_scope;
  IF v_scope = 'all' THEN RETURN true; END IF;
  IF v_scope = 'dept' THEN
    SELECT EXISTS (
      SELECT 1 FROM work_type_configs wtc WHERE wtc.name = p_work_type AND wtc.org_id = p_org_id AND wtc.department_id IS NOT NULL
    ) INTO v_has_dept_config;
    IF NOT v_has_dept_config THEN RETURN true; END IF;
    RETURN EXISTS (
      SELECT 1 FROM work_type_configs wtc
      JOIN department_members dm ON dm.department_id = wtc.department_id AND dm.org_id = p_org_id
      WHERE wtc.name = p_work_type AND wtc.org_id = p_org_id AND dm.user_id = auth.uid()
    );
  END IF;
  RETURN p_user_id = auth.uid();
END;
$$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "org members read time logs" ON attendance_time_logs;
  DROP POLICY IF EXISTS "org_member_access" ON attendance_time_logs;
  DROP POLICY IF EXISTS "attendance_time_logs_select" ON attendance_time_logs;
  DROP POLICY IF EXISTS "select_own_org" ON attendance_time_logs;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  DROP POLICY IF EXISTS "attendance_time_logs_dept_scoped" ON attendance_time_logs;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
CREATE POLICY "attendance_time_logs_dept_scoped" ON attendance_time_logs
FOR SELECT USING (
  check_time_log_access(org_id, user_id, COALESCE(work_type, ''))
);
