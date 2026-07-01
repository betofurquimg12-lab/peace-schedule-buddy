
-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  related_appointment_ids uuid[] NOT NULL DEFAULT '{}',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_related ON public.notifications USING gin(related_appointment_ids);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users update their notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete their notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Inserts happen via SECURITY DEFINER trigger; no INSERT policy for clients.

-- Conflict detection trigger
CREATE OR REPLACE FUNCTION public.detect_schedule_conflict()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conflict_rec RECORD;
  new_label text;
  other_label text;
  existing_id uuid;
  pair uuid[];
BEGIN
  IF NEW.status = 'canceled' OR NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;

  FOR conflict_rec IN
    SELECT a.id, a.starts_at, a.ends_at, a.is_block, a.block_reason, a.external_summary,
           p.full_name AS patient_name
      FROM public.appointments a
      LEFT JOIN public.patients p ON p.id = a.patient_id
     WHERE a.created_by = NEW.created_by
       AND a.id <> NEW.id
       AND a.status <> 'canceled'
       AND a.starts_at < NEW.ends_at
       AND a.ends_at > NEW.starts_at
  LOOP
    pair := ARRAY[NEW.id, conflict_rec.id];

    -- Skip if there's already an unread conflict notification for this pair
    SELECT id INTO existing_id
      FROM public.notifications
     WHERE user_id = NEW.created_by
       AND type = 'schedule_conflict'
       AND is_read = false
       AND related_appointment_ids @> pair
       AND related_appointment_ids <@ pair
     LIMIT 1;

    IF existing_id IS NOT NULL THEN
      CONTINUE;
    END IF;

    IF NEW.is_block THEN
      new_label := 'Bloqueio' || COALESCE(' (' || NEW.block_reason || ')', '');
    ELSE
      SELECT COALESCE(p.full_name, NEW.external_summary, 'Sessão')
        INTO new_label
        FROM public.patients p
       WHERE p.id = NEW.patient_id;
      IF new_label IS NULL THEN
        new_label := COALESCE(NEW.external_summary, 'Sessão');
      END IF;
    END IF;

    IF conflict_rec.is_block THEN
      other_label := 'Bloqueio' || COALESCE(' (' || conflict_rec.block_reason || ')', '');
    ELSE
      other_label := COALESCE(conflict_rec.patient_name, conflict_rec.external_summary, 'Sessão');
    END IF;

    INSERT INTO public.notifications (user_id, type, title, message, related_appointment_ids)
    VALUES (
      NEW.created_by,
      'schedule_conflict',
      'Conflito de agenda',
      new_label || ' (' || to_char(NEW.starts_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
        || '–' || to_char(NEW.ends_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') || ')'
        || ' conflita com ' || other_label
        || ' (' || to_char(conflict_rec.starts_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
        || '–' || to_char(conflict_rec.ends_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') || ').',
      pair
    );
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.detect_schedule_conflict() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_appointments_detect_conflict
AFTER INSERT OR UPDATE OF starts_at, ends_at, status, patient_id, is_block, block_reason
ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.detect_schedule_conflict();
