ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS converted_to_particular boolean NOT NULL DEFAULT false;

UPDATE public.appointments
SET converted_to_particular = true
WHERE source = 'google' AND is_vittude = false AND patient_id IS NOT NULL;

UPDATE public.appointments
SET google_etag = NULL
WHERE source = 'google' AND converted_to_particular = false;