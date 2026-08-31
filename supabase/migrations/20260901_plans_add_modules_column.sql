
-- Add modules column to plans if not exists
ALTER TABLE plans ADD COLUMN IF NOT EXISTS modules text[] DEFAULT '{}';

-- Seed modules for existing plans
UPDATE plans SET modules = ARRAY['library','team','chat'] WHERE id = 'starter';
UPDATE plans SET modules = ARRAY['library','team','chat','analytics','comms','billing'] WHERE id = 'pro';
UPDATE plans SET modules = ARRAY['library','team','chat','analytics','comms','billing','portal'] WHERE id = 'enterprise';
