ALTER TABLE public.patients
ADD COLUMN IF NOT EXISTS nota_modo text NULL;

ALTER TABLE public.patients
DROP CONSTRAINT IF EXISTS patients_nota_modo_check;

ALTER TABLE public.patients
ADD CONSTRAINT patients_nota_modo_check
CHECK (nota_modo IN ('por_sessao', 'mensal'));

ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS cobrar_ausencia boolean NULL;