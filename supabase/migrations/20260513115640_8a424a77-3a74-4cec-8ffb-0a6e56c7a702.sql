
-- Add columns for Vittude flag and block-of-time on appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS is_vittude boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_block boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS block_reason text;

CREATE INDEX IF NOT EXISTS idx_appointments_is_vittude ON public.appointments(is_vittude) WHERE is_vittude = true;
CREATE INDEX IF NOT EXISTS idx_appointments_is_block ON public.appointments(is_block) WHERE is_block = true;

-- Function to auto-mark past scheduled appointments as done
CREATE OR REPLACE FUNCTION public.mark_past_appointments_done()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.appointments
     SET status = 'done'
   WHERE status = 'scheduled'
     AND ends_at < now()
     AND is_block = false;
$$;

-- Allow authenticated users to call it (used both by cron and from client)
GRANT EXECUTE ON FUNCTION public.mark_past_appointments_done() TO authenticated;

-- Schedule via pg_cron (every 15 minutes)
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('mark-past-appointments-done');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'mark-past-appointments-done',
  '*/15 * * * *',
  $$ SELECT public.mark_past_appointments_done(); $$
);
