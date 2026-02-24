-- Add accuracy score column to notes table
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS validation_accuracy_score NUMERIC;
