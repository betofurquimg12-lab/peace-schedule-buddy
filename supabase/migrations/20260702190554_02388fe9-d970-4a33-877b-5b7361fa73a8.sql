UPDATE public.appointments
SET created_by = (SELECT owner_id FROM public.agenda_settings LIMIT 1)
WHERE created_by IS NULL;