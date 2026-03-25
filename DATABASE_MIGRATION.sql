-- SQL migration script to add recurrence_end_date and is_recurring columns to tasks table
ALTER TABLE tasks
ADD COLUMN recurrence_end_date DATETIME,
ADD COLUMN is_recurring BOOLEAN DEFAULT FALSE;