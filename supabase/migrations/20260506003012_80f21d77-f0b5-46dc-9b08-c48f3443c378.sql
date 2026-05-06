
ALTER TABLE public.appointments
  ALTER COLUMN patient_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS external_summary text;
