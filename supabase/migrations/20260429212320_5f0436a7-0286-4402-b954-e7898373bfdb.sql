-- Permitir pagamentos previstos (sem data de recebimento) e adicionar previsão
ALTER TABLE public.payments
  ALTER COLUMN paid_at DROP NOT NULL,
  ALTER COLUMN paid_at DROP DEFAULT;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS due_date date;

-- Garantir consistência: pelo menos uma das datas deve estar presente
CREATE OR REPLACE FUNCTION public.payments_check_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.paid_at IS NULL AND NEW.due_date IS NULL THEN
    RAISE EXCEPTION 'payment must have paid_at or due_date';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_check_dates ON public.payments;
CREATE TRIGGER trg_payments_check_dates
BEFORE INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.payments_check_dates();
