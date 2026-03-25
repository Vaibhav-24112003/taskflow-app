-- SQL migration script to add recurrence_end_date and is_recurring columns to tasks table
ALTER TABLE tasks
ADD COLUMN recurrence_end_date DATETIME,
ADD COLUMN is_recurring BOOLEAN DEFAULT FALSE;

-- Fix existing invitations with NULL status (invitees can't see these)
UPDATE workspace_invitations
SET status = 'pending'
WHERE status IS NULL;

-- Fix existing invitations with NULL token (invite links are broken)
UPDATE workspace_invitations
SET token = gen_random_uuid()
WHERE token IS NULL;

-- Add defaults to prevent future issues
ALTER TABLE workspace_invitations
ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE workspace_invitations
ALTER COLUMN token SET DEFAULT gen_random_uuid();