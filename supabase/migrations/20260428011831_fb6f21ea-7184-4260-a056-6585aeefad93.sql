-- 1) Pacientes: cidade, estado, país
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS country text;

-- 2) Lançamentos financeiros manuais (débito/crédito)
DO $$ BEGIN
  CREATE TYPE public.finance_entry_type AS ENUM ('credit', 'debit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.finance_entry_type NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  method public.payment_method,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.finance_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic reads finance_entries" ON public.finance_entries
  FOR SELECT TO authenticated USING (public.is_clinic_member(auth.uid()));
CREATE POLICY "clinic inserts finance_entries" ON public.finance_entries
  FOR INSERT TO authenticated WITH CHECK (public.is_clinic_member(auth.uid()));
CREATE POLICY "clinic updates finance_entries" ON public.finance_entries
  FOR UPDATE TO authenticated USING (public.is_clinic_member(auth.uid()));
CREATE POLICY "clinic deletes finance_entries" ON public.finance_entries
  FOR DELETE TO authenticated USING (public.is_clinic_member(auth.uid()));

CREATE TRIGGER trg_finance_entries_updated
  BEFORE UPDATE ON public.finance_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_finance_entries_date ON public.finance_entries(entry_date DESC);

-- 3) Coluna na agenda para o link do Meet
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS meet_link text,
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;