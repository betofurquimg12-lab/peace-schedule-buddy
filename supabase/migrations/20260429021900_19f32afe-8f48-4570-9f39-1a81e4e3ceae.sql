-- Tabela de configuração de disponibilidade da agenda
CREATE TABLE public.agenda_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL UNIQUE,
  weekdays INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5], -- 0=Dom ... 6=Sab
  start_time TIME NOT NULL DEFAULT '08:00',
  end_time TIME NOT NULL DEFAULT '18:00',
  slot_minutes INTEGER NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agenda_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic reads agenda_settings"
  ON public.agenda_settings FOR SELECT TO authenticated
  USING (public.is_clinic_member(auth.uid()));

CREATE POLICY "owner inserts agenda_settings"
  ON public.agenda_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role) AND owner_id = auth.uid());

CREATE POLICY "owner updates agenda_settings"
  ON public.agenda_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role) AND owner_id = auth.uid());

CREATE POLICY "owner deletes agenda_settings"
  ON public.agenda_settings FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role) AND owner_id = auth.uid());

CREATE TRIGGER agenda_settings_updated_at
  BEFORE UPDATE ON public.agenda_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();