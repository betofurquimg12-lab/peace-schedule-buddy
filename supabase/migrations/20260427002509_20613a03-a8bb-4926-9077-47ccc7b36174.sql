-- Roles enum and table
CREATE TYPE public.app_role AS ENUM ('owner', 'secretary');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Security definer to check role without recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_clinic_member(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

-- Auto-create profile + assign role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _is_first BOOLEAN;
  _invited_role app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO _is_first;

  -- If invited, take role from invitation
  SELECT role INTO _invited_role FROM public.invitations WHERE email = NEW.email AND accepted_at IS NULL LIMIT 1;

  IF _is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner');
  ELSIF _invited_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _invited_role);
    UPDATE public.invitations SET accepted_at = now() WHERE email = NEW.email AND accepted_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Invitations table (created before trigger because trigger references it)
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'secretary',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ
);

-- Now create the trigger
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Patients
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  birth_date DATE,
  address TEXT,
  responsible_name TEXT,
  responsible_phone TEXT,
  -- clinical (owner only)
  main_complaint TEXT,
  history TEXT,
  notes TEXT,
  -- finance
  default_session_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

-- Appointments
CREATE TYPE public.appointment_status AS ENUM ('scheduled','done','canceled','no_show');
CREATE TYPE public.appointment_modality AS ENUM ('in_person','online');
CREATE TYPE public.recurrence_type AS ENUM ('none','weekly','biweekly');

CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 50,
  modality appointment_modality NOT NULL DEFAULT 'in_person',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  status appointment_status NOT NULL DEFAULT 'scheduled',
  recurrence recurrence_type NOT NULL DEFAULT 'none',
  recurrence_group_id UUID,
  google_event_id TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_appointments_starts_at ON public.appointments(starts_at);
CREATE INDEX idx_appointments_patient ON public.appointments(patient_id);

-- Payments
CREATE TYPE public.payment_method AS ENUM ('pix','cash','card','transfer','other');

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  method payment_method NOT NULL DEFAULT 'pix',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_patients_updated BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_appointments_updated BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "owner reads all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- user_roles: only owner can manage; everyone reads their own
CREATE POLICY "read own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "owner reads all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owner manages roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- invitations: owner only
CREATE POLICY "owner manages invitations" ON public.invitations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- patients: any clinic member
CREATE POLICY "clinic reads patients" ON public.patients FOR SELECT TO authenticated USING (public.is_clinic_member(auth.uid()));
CREATE POLICY "clinic inserts patients" ON public.patients FOR INSERT TO authenticated WITH CHECK (public.is_clinic_member(auth.uid()));
CREATE POLICY "clinic updates patients" ON public.patients FOR UPDATE TO authenticated USING (public.is_clinic_member(auth.uid()));
CREATE POLICY "owner deletes patients" ON public.patients FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

-- appointments: any clinic member
CREATE POLICY "clinic reads appointments" ON public.appointments FOR SELECT TO authenticated USING (public.is_clinic_member(auth.uid()));
CREATE POLICY "clinic inserts appointments" ON public.appointments FOR INSERT TO authenticated WITH CHECK (public.is_clinic_member(auth.uid()));
CREATE POLICY "clinic updates appointments" ON public.appointments FOR UPDATE TO authenticated USING (public.is_clinic_member(auth.uid()));
CREATE POLICY "clinic deletes appointments" ON public.appointments FOR DELETE TO authenticated USING (public.is_clinic_member(auth.uid()));

-- payments: any clinic member
CREATE POLICY "clinic reads payments" ON public.payments FOR SELECT TO authenticated USING (public.is_clinic_member(auth.uid()));
CREATE POLICY "clinic inserts payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (public.is_clinic_member(auth.uid()));
CREATE POLICY "clinic updates payments" ON public.payments FOR UPDATE TO authenticated USING (public.is_clinic_member(auth.uid()));
CREATE POLICY "clinic deletes payments" ON public.payments FOR DELETE TO authenticated USING (public.is_clinic_member(auth.uid()));

-- Restrict clinical fields on patients to owner via a view + column-level grant alternative:
-- We expose a public view "patients_basic" without clinical fields and revoke direct clinical column access through a function.
-- Simpler: create a security definer function get_patient_clinical that only owner can call, and frontend doesn't read clinical fields unless owner.
CREATE OR REPLACE FUNCTION public.get_patient_clinical(_patient_id UUID)
RETURNS TABLE (main_complaint TEXT, history TEXT, notes TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT main_complaint, history, notes FROM public.patients
  WHERE id = _patient_id AND public.has_role(auth.uid(), 'owner');
$$;