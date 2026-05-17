ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE public.agenda_settings ADD COLUMN IF NOT EXISTS email_on_appointment_changes boolean NOT NULL DEFAULT true;