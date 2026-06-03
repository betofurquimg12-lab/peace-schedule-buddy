
-- 1. Restrict deletes on financial tables to owner only (secretaries should not delete)
DROP POLICY IF EXISTS "clinic deletes finance_entries" ON public.finance_entries;
CREATE POLICY "owner deletes finance_entries"
  ON public.finance_entries FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

DROP POLICY IF EXISTS "clinic deletes payments" ON public.payments;
CREATE POLICY "owner deletes payments"
  ON public.payments FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

-- 2. Set fixed search_path on email queue helper functions
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;

-- 3. Revoke EXECUTE on SECURITY DEFINER email-queue helpers from anon/authenticated.
-- These are only meant to be called by edge functions using the service role.
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;

-- 4. mark_past_appointments_done: server-only cron helper; revoke from clients.
REVOKE EXECUTE ON FUNCTION public.mark_past_appointments_done() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_past_appointments_done() TO service_role;

-- 5. get_patient_clinical: only owner should call; revoke from anon.
REVOKE EXECUTE ON FUNCTION public.get_patient_clinical(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_patient_clinical(uuid) TO authenticated, service_role;

-- 6. has_role / is_clinic_member: used by RLS policies; revoke anon execute.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_clinic_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_clinic_member(uuid) TO authenticated, service_role;
