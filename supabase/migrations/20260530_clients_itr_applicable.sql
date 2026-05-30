-- Add itr_applicable flag to clients so ITR Desk can filter to relevant filers only.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS itr_applicable boolean DEFAULT false;
