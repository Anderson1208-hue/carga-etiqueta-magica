
-- Step 1: Add divergencia to enum only
ALTER TYPE public.label_status ADD VALUE IF NOT EXISTS 'divergencia';
