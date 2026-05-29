-- ITR Compilation: one living record per client per assessment year.
-- client_data = filled by client (optional public form) OR member from documents.
-- internal_data = member/article-only sections, checklist, pre-computation checks, notes.
CREATE TABLE IF NOT EXISTS itr_compilation (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL,
  client_id uuid NOT NULL,
  worksheet_row_id uuid,
  assessment_year text NOT NULL,
  client_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  internal_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'compiling',  -- compiling | pending_data | ready | in_software | filed
  completeness int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, client_id, assessment_year)
);

CREATE INDEX IF NOT EXISTS idx_itr_compilation_org ON itr_compilation(org_id);
CREATE INDEX IF NOT EXISTS idx_itr_compilation_client ON itr_compilation(org_id, client_id);

ALTER TABLE itr_compilation ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='itr_compilation' AND policyname='itr_org_member') THEN
    CREATE POLICY "itr_org_member" ON itr_compilation FOR ALL USING (
      org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    ) WITH CHECK (
      org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    );
  END IF;
END $$;
