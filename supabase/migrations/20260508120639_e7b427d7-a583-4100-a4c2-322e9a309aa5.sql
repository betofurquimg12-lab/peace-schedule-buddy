CREATE TABLE public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  key text NOT NULL,
  subject text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, key)
);

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic reads message_templates"
  ON public.message_templates FOR SELECT
  TO authenticated
  USING (public.is_clinic_member(auth.uid()));

CREATE POLICY "owner inserts message_templates"
  ON public.message_templates FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner') AND owner_id = auth.uid());

CREATE POLICY "owner updates message_templates"
  ON public.message_templates FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner') AND owner_id = auth.uid());

CREATE POLICY "owner deletes message_templates"
  ON public.message_templates FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner') AND owner_id = auth.uid());

CREATE TRIGGER message_templates_set_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();