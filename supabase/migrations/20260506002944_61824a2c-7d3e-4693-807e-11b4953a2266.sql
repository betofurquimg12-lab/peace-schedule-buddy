
-- Extensions for scheduled sync
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Appointments: origin + recurrence end + sync metadata
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS recurrence_end_date date,
  ADD COLUMN IF NOT EXISTS google_etag text,
  ADD COLUMN IF NOT EXISTS google_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_google_event_id_uniq
  ON public.appointments (google_event_id)
  WHERE google_event_id IS NOT NULL;

-- Agenda settings: reminder configuration
ALTER TABLE public.agenda_settings
  ADD COLUMN IF NOT EXISTS reminder_email_day_before_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_email_day_before_minutes integer NOT NULL DEFAULT 1440,
  ADD COLUMN IF NOT EXISTS reminder_email_before_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_email_before_minutes integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS reminder_popup_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_popup_minutes integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS reminder_app_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_app_minutes integer NOT NULL DEFAULT 5;
