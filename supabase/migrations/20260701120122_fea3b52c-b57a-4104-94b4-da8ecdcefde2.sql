
CREATE OR REPLACE FUNCTION public.check_existing_conflicts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  rec RECORD;
  pair uuid[];
  a_label text;
  b_label text;
  inserted_count int := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  FOR rec IN
    SELECT a.id AS a_id, a.starts_at AS a_starts, a.ends_at AS a_ends,
           a.is_block AS a_is_block, a.block_reason AS a_block_reason,
           a.external_summary AS a_ext, pa.full_name AS a_patient,
           b.id AS b_id, b.starts_at AS b_starts, b.ends_at AS b_ends,
           b.is_block AS b_is_block, b.block_reason AS b_block_reason,
           b.external_summary AS b_ext, pb.full_name AS b_patient
      FROM public.appointments a
      JOIN public.appointments b
        ON b.created_by = a.created_by
       AND a.id < b.id
       AND a.starts_at < b.ends_at
       AND a.ends_at > b.starts_at
      LEFT JOIN public.patients pa ON pa.id = a.patient_id
      LEFT JOIN public.patients pb ON pb.id = b.patient_id
     WHERE a.created_by = uid
       AND a.status <> 'canceled'
       AND b.status <> 'canceled'
  LOOP
    pair := ARRAY[rec.a_id, rec.b_id];

    IF EXISTS (
      SELECT 1 FROM public.notifications
       WHERE user_id = uid
         AND type = 'schedule_conflict'
         AND is_read = false
         AND related_appointment_ids @> pair
         AND related_appointment_ids <@ pair
    ) THEN
      CONTINUE;
    END IF;

    IF rec.a_is_block THEN
      a_label := 'Bloqueio' || COALESCE(' (' || rec.a_block_reason || ')', '');
    ELSE
      a_label := COALESCE(rec.a_patient, rec.a_ext, 'Sessão');
    END IF;

    IF rec.b_is_block THEN
      b_label := 'Bloqueio' || COALESCE(' (' || rec.b_block_reason || ')', '');
    ELSE
      b_label := COALESCE(rec.b_patient, rec.b_ext, 'Sessão');
    END IF;

    INSERT INTO public.notifications (user_id, type, title, message, related_appointment_ids)
    VALUES (
      uid,
      'schedule_conflict',
      'Conflito de agenda',
      a_label || ' (' || to_char(rec.a_starts AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
        || '–' || to_char(rec.a_ends AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') || ')'
        || ' conflita com ' || b_label
        || ' (' || to_char(rec.b_starts AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
        || '–' || to_char(rec.b_ends AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') || ').',
      pair
    );
    inserted_count := inserted_count + 1;
  END LOOP;

  RETURN inserted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_existing_conflicts() TO authenticated;
