ALTER TABLE public.agenda_settings
  ADD COLUMN IF NOT EXISTS google_sync_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS google_sync_email text;