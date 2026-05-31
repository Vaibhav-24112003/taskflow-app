-- Org-wide ITR compilation form template. One row per org.
-- template jsonb = { income_types:[[key,label]], documents:[{key,label,cond?}],
--                    sections:[{id,label,icon,always?,cond?,fields:[{key,label,type,opts?}]}],
--                    checks:[[key,label]] }
-- When absent, the app falls back to built-in defaults.
CREATE TABLE IF NOT EXISTS itr_templates (
  org_id uuid PRIMARY KEY,
  template jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE itr_templates ENABLE ROW LEVEL SECURITY;

-- Any org member can read the template; only owners/admins should edit (enforced in UI;
-- DB allows any member to write to keep RLS simple and consistent with itr_compilation).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='itr_templates' AND policyname='itr_tpl_org_member') THEN
    CREATE POLICY "itr_tpl_org_member" ON itr_templates FOR ALL USING (
      org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    ) WITH CHECK (
      org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    );
  END IF;
END $$;
