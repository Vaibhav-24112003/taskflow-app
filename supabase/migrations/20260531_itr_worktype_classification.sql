-- ITR client classification is now driven entirely by the work type flag
-- `work_type_configs.is_itr_worktype`. A client counts as an ITR client when
-- enrolled (via worksheet_rows) in any work type marked is_itr_worktype.
--
-- This replaces the earlier per-client `clients.itr_applicable` manual tag,
-- which is dropped here (it held no data once classification moved to work types).

-- 1. Work-type ITR flag (idempotent — already present on existing projects)
ALTER TABLE work_type_configs ADD COLUMN IF NOT EXISTS is_itr_worktype boolean DEFAULT false;

-- 2. Remove the now-unused manual per-client tag
ALTER TABLE clients DROP COLUMN IF EXISTS itr_applicable;
