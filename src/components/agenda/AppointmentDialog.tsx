import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatDateTimeBR } from "@/lib/format";
import { Trash2, MessageCircle, Video, DollarSign } from "lucide-react";
import { buildSessionWaUrlAsync, buildChargeWaUrlAsync } from "@/lib/sessionReminder";
import { schema, INFINITE_CAP, toLocalDate, toLocalTime, buildOccurrenceDates } from "./appointment/helpers";
import { Field } from "./appointment/Field";
import { PatientCombobox } from "./appointment/PatientCombobox";
import { ExternalEventDialog } from "./appointment/ExternalEventDialog";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
  appointment?: any;
  presetStart?: Date | null;
};

export const AppointmentDialog = ({ open, onOpenChange, onSaved, appointment, presetStart }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [patients, setPatients] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [existingPayment, setExistingPayment] = useState<any>(null);
  const isExternal = appointment?.source === "google" && !appointment?.converted_to_particular;
  const isConverted = appointment?.source === "google" && !!appointment?.converted_to_particular;
  const [convertToParticular, setConvertToParticular] = useState(false);
  const [form, setForm] = useState<any>({
    patient_id: "",
    date: toLocalDate(new Date()),
    time: "09:00",
    duration: 50,
    modality: "online",
    price: 0,
    status: "scheduled",
    recurrence: "none",
    recurrence_mode: "none",
    occurrences: 4,
    recurrence_end_date: "",
    notes: "",
    payment_status: "pending",
    payment_date: toLocalDate(new Date()),
    payment_method: "pix",
    is_block: false,
    block_reason: "",
    is_vittude: false,
  });
  const [deleteScopeOpen, setDeleteScopeOpen] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    void supabase.from("patients").select("id, full_name, default_session_price").eq("active", true).order("full_name").then(({ data }) => setPatients(data ?? []));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (appointment) {
      const s = new Date(appointment.starts_at);
      const e = new Date(appointment.ends_at);
      void supabase
        .from("payments")
        .select("id, amount, paid_at, due_date, method, notes")
        .eq("appointment_id", appointment.id)
        .maybeSingle()
        .then(({ data }) => {
          setExistingPayment(data ?? null);
          if (data) {
            setForm((f: any) => ({
              ...f,
              payment_status: appointment.is_vittude ? "vittude" : (data.paid_at ? "paid" : "scheduled_payment"),
              payment_date: data.paid_at ?? data.due_date ?? toLocalDate(s),
              payment_method: data.method ?? "pix",
            }));
          } else {
            setForm((f: any) => ({
              ...f,
              payment_status: appointment.is_vittude ? "vittude" : "pending",
              payment_date: toLocalDate(s),
              payment_method: "pix",
            }));
          }
        });
      setForm({
        patient_id: appointment.patient?.id ?? appointment.patient_id ?? "",
        date: toLocalDate(s),
        time: toLocalTime(s),
        duration: Math.round((+e - +s) / 60000),
        modality: appointment.modality ?? "online",
        price: Number(appointment.price ?? 0),
        status: appointment.status ?? "scheduled",
        recurrence: appointment.recurrence ?? "none",
        recurrence_mode: appointment.recurrence && appointment.recurrence !== "none" ? (appointment.recurrence_end_date ? "until" : "count") : "none",
        occurrences: 4,
        recurrence_end_date: appointment.recurrence_end_date ?? "",
        notes: appointment.notes ?? "",
        payment_status: appointment.is_vittude ? "vittude" : "pending",
        payment_date: toLocalDate(s),
        payment_method: "pix",
        is_block: !!appointment.is_block,
        block_reason: appointment.block_reason ?? "",
        is_vittude: !!appointment.is_vittude,
      });
    } else {
      const s = presetStart ?? new Date();
      setExistingPayment(null);
      setForm((f: any) => ({
        ...f,
        patient_id: "",
        date: toLocalDate(s),
        time: toLocalTime(s),
        duration: 50,
        modality: "online",
        price: 0,
        status: "scheduled",
        recurrence: "none",
        recurrence_mode: "none",
        occurrences: 4,
        recurrence_end_date: "",
        notes: "",
        payment_status: "pending",
        payment_date: toLocalDate(s),
        payment_method: "pix",
        is_block: false,
        block_reason: "",
        is_vittude: false,
      }));
    }
    setConflict(null);
    setConvertToParticular(false);
    setRevertOpen(false);
  }, [appointment, presetStart, open]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const onPatientChange = (id: string) => {
    const p = patients.find((x) => x.id === id);
    setForm((f: any) => ({ ...f, patient_id: id, price: p?.default_session_price ?? f.price }));
  };

  const onRecurrenceModeChange = (mode: string) => {
    setForm((f: any) => {
      const next: any = { ...f, recurrence_mode: mode };
      if (mode === "none") next.recurrence = "none";
      else if (f.recurrence === "none") next.recurrence = "weekly";
      return next;
    });
  };

  const checkConflict = async (startISO: string, endISO: string) => {
    const { data } = await supabase
      .from("appointments")
      .select("id, starts_at, patient:patients(full_name)")
      .lt("starts_at", endISO)
      .gt("ends_at", startISO)
      .neq("status", "canceled");
    return (data ?? []).filter((a) => a.id !== appointment?.id);
  };

  const syncCalendar = async (
    action: "create" | "update" | "delete",
    appointmentId: string,
    args: {
      starts_at?: string;
      ends_at?: string;
      patient_id?: string;
      google_event_id?: string | null;
      patient_name?: string;
      skip_patient_attendee?: boolean;
      calendar_id?: string | null;
    },
  ): Promise<{ event_id?: string; meet_link?: string | null } | null> => {
    try {
      let attendees: { email: string; displayName?: string }[] = [];
      let patientName = args.patient_name ?? "Paciente";
      if (args.patient_id) {
        const { data: p } = await supabase
          .from("patients")
          .select("full_name, email")
          .eq("id", args.patient_id)
          .maybeSingle();
        if (p?.email && !args.skip_patient_attendee) attendees.push({ email: p.email, displayName: p.full_name });
        if (p?.full_name) patientName = p.full_name;
      }
      if (user?.email) attendees.push({ email: user.email, displayName: "Psicóloga" });

      const { data, error } = await supabase.functions.invoke("google-calendar-event", {
        body: {
          action,
          appointment_id: appointmentId,
          starts_at: args.starts_at,
          ends_at: args.ends_at,
          summary: `Sessão · ${patientName}`,
          description: "Sessão de psicoterapia.",
          attendees,
          google_event_id: args.google_event_id ?? undefined,
          calendar_id: args.calendar_id ?? undefined,
        },
      });
      if (error) {
        console.error("calendar sync error", error);
        toast({
          title: "Aviso",
          description: "Agendamento salvo, mas falha ao sincronizar com o Google Calendar.",
        });
        return null;
      }
      return data ?? null;
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  const submit = async () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast({ title: "Verifique os dados", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    const isBlock = !!form.is_block;
    const isVittude = !!form.is_vittude;
    if (!isBlock && !parsed.data.patient_id) {
      return toast({ title: "Selecione um paciente", variant: "destructive" });
    }
    setSaving(true);

    if (appointment && isConverted) {
      const { error } = await supabase.from("appointments").update({
        patient_id: parsed.data.patient_id || null,
        price: parsed.data.price,
        notes: parsed.data.notes || null,
        status: parsed.data.status,
      }).eq("id", appointment.id);

      if (error) {
        setSaving(false);
        return toast({ title: "Erro", description: error.message, variant: "destructive" });
      }

      await upsertPayment(appointment.id, parsed.data.price);
      setSaving(false);
      toast({ title: "Atendimento atualizado" });
      onSaved();
      onOpenChange(false);
      return;
    }

    const start = new Date(`${parsed.data.date}T${parsed.data.time}:00`);
    const end = new Date(start.getTime() + parsed.data.duration * 60000);

    const conflicts = await checkConflict(start.toISOString(), end.toISOString());
    if (conflicts.length) {
      setConflict(`Conflito com: ${conflicts[0].patient?.full_name ?? "outro evento"} em ${formatDateTimeBR(conflicts[0].starts_at)}`);
      setSaving(false);
      return;
    }

    const recurrenceChanged =
      appointment &&
      (parsed.data.recurrence_mode !== (appointment.recurrence && appointment.recurrence !== "none" ? "count" : "none") ||
       parsed.data.recurrence !== (appointment.recurrence ?? "none") ||
       (parsed.data.recurrence_mode !== "none" &&
        (parsed.data.occurrences !== 1 || parsed.data.recurrence_end_date !== (appointment.recurrence_end_date ?? ""))));

    if (appointment && !recurrenceChanged) {
      // Editing only THIS single appointment — never propagates to recurrence siblings.
      const { error } = await supabase.from("appointments").update({
        patient_id: isBlock ? null : (parsed.data.patient_id || null),
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        duration_minutes: parsed.data.duration,
        modality: parsed.data.modality,
        price: isBlock ? 0 : parsed.data.price,
        status: parsed.data.status,
        notes: parsed.data.notes || null,
        is_block: isBlock,
        block_reason: isBlock ? (form.block_reason || null) : null,
        is_vittude: isVittude,
      }).eq("id", appointment.id);
      if (error) {
        setSaving(false);
        return toast({ title: "Erro", description: error.message, variant: "destructive" });
      }

      if (!isBlock && !isVittude) {
        await upsertPayment(appointment.id, parsed.data.price);
      } else {
        const { data: existing } = await supabase.from("payments").select("id").eq("appointment_id", appointment.id).maybeSingle();
        if (existing) await supabase.from("payments").delete().eq("id", existing.id);
      }

      // Fire-and-forget Google sync — não bloqueia UI
      if (!isBlock) {
        void (async () => {
          const result = await syncCalendar(
            appointment.google_event_id ? "update" : "create",
            appointment.id,
            {
              starts_at: start.toISOString(),
              ends_at: end.toISOString(),
              patient_id: parsed.data.patient_id,
              google_event_id: appointment.google_event_id,
              calendar_id: appointment.google_calendar_id,
            },
          );
          if (result?.event_id) {
            await supabase.from("appointments").update({
              google_event_id: result.event_id,
              meet_link: result.meet_link ?? null,
            }).eq("id", appointment.id);
          }
        })();
      }

      setSaving(false);
      toast({ title: "Agendamento atualizado" });
    } else {
      // Either creating new OR editing with recurrence change → regenerate series from this date
      const dates = buildOccurrenceDates(
        start,
        parsed.data.recurrence_mode,
        parsed.data.recurrence,
        Number(parsed.data.occurrences) || 1,
        parsed.data.recurrence_end_date || "",
      );
      console.log("[AppointmentDialog] generating dates", { count: dates.length, mode: parsed.data.recurrence_mode, recurrence: parsed.data.recurrence, occurrences: parsed.data.occurrences, endDate: parsed.data.recurrence_end_date, dates: dates.map((d) => d.toISOString()) });

      // If editing with recurrence change: delete this + future siblings in the group, then recreate
      if (appointment && recurrenceChanged) {
        const groupId = appointment.recurrence_group_id;
        let toDelete: any[] = [];
        if (groupId) {
          const { data } = await supabase
            .from("appointments")
            .select("id, google_event_id, google_calendar_id")
            .eq("recurrence_group_id", groupId)
            .gte("starts_at", appointment.starts_at);
          toDelete = data ?? [];
        } else {
          toDelete = [{ id: appointment.id, google_event_id: appointment.google_event_id, google_calendar_id: appointment.google_calendar_id }];
        }
        for (const a of toDelete) {
          if (a.google_event_id) {
            await syncCalendar("delete", a.id, { google_event_id: a.google_event_id, calendar_id: a.google_calendar_id });
          }
        }
        await supabase.from("appointments").delete().in("id", toDelete.map((a) => a.id));
      }

      const groupId = dates.length > 1 ? crypto.randomUUID() : null;
      const recurrenceEndDate = parsed.data.recurrence_mode === "until" ? (parsed.data.recurrence_end_date || null) : null;

      const rows = dates.map((s) => {
        const e = new Date(s.getTime() + parsed.data.duration * 60000);
        return {
          patient_id: isBlock ? null : (parsed.data.patient_id || null),
          starts_at: s.toISOString(),
          ends_at: e.toISOString(),
          duration_minutes: parsed.data.duration,
          modality: parsed.data.modality,
          price: isBlock ? 0 : parsed.data.price,
          status: parsed.data.status,
          recurrence: parsed.data.recurrence,
          recurrence_group_id: groupId,
          recurrence_end_date: recurrenceEndDate,
          source: "system",
          notes: parsed.data.notes || null,
          created_by: user?.id,
          is_block: isBlock,
          block_reason: isBlock ? (form.block_reason || null) : null,
          is_vittude: isVittude,
        };
      });

      const { data: inserted, error } = await supabase.from("appointments").insert(rows).select("id, starts_at, ends_at");
      console.log("[AppointmentDialog] insert result", { requested: rows.length, inserted: inserted?.length, error });
      if (error) {
        setSaving(false);
        return toast({ title: "Erro", description: error.message, variant: "destructive" });
      }

      if (inserted && !isBlock) {
        // Fire-and-forget — não bloqueia o fechamento do diálogo
        void (async () => {
          for (const row of inserted) {
            const result = await syncCalendar("create", row.id, {
              starts_at: row.starts_at,
              ends_at: row.ends_at,
              patient_id: parsed.data.patient_id,
            });
            if (result?.event_id) {
              await supabase.from("appointments").update({
                google_event_id: result.event_id,
                meet_link: result.meet_link ?? null,
              }).eq("id", row.id);
            }
          }
        })();
      }

      if (inserted && inserted.length && !isBlock && !isVittude) {
        const sorted = [...inserted].sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
        await upsertPayment(sorted[0].id, parsed.data.price);
      }

      setSaving(false);
      toast({ title: dates.length > 1 ? `${dates.length} agendamentos criados` : "Agendamento criado" });
    }
    onSaved();
    onOpenChange(false);
  };

  const upsertPayment = async (appointmentId: string, price: number) => {
    const { data: existing } = await supabase
      .from("payments")
      .select("id")
      .eq("appointment_id", appointmentId)
      .maybeSingle();

    if (form.payment_status === "pending") {
      if (existing) await supabase.from("payments").delete().eq("id", existing.id);
      return;
    }

    const payload: any = {
      appointment_id: appointmentId,
      amount: price,
      method: form.payment_method,
      paid_at: form.payment_status === "paid" ? form.payment_date : null,
      due_date: form.payment_status === "scheduled_payment" ? form.payment_date : null,
      created_by: user?.id,
    };

    if (existing) {
      await supabase.from("payments").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("payments").insert(payload);
    }
  };

  const removeScoped = async (scope: "one" | "forward" | "all") => {
    if (!appointment) return;
    let toDelete: { id: string; google_event_id?: string | null; google_calendar_id?: string | null }[] = [];
    if (scope === "one" || !appointment.recurrence_group_id) {
      toDelete = [{ id: appointment.id, google_event_id: appointment.google_event_id, google_calendar_id: appointment.google_calendar_id }];
    } else {
      const q = supabase
        .from("appointments")
        .select("id, google_event_id, google_calendar_id")
        .eq("recurrence_group_id", appointment.recurrence_group_id);
      const { data } = scope === "forward"
        ? await q.gte("starts_at", appointment.starts_at)
        : await q;
      toDelete = data ?? [];
    }
    for (const a of toDelete) {
      if (a.google_event_id) await syncCalendar("delete", a.id, { google_event_id: a.google_event_id, calendar_id: a.google_calendar_id });
    }
    const { error } = await supabase.from("appointments").delete().in("id", toDelete.map((a) => a.id));
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: toDelete.length > 1 ? `${toDelete.length} agendamentos excluídos` : "Excluído" });
    setDeleteScopeOpen(false);
    onSaved();
    onOpenChange(false);
  };

  const remove = async () => {
    if (!appointment) return;
    if (appointment.recurrence_group_id) {
      setDeleteScopeOpen(true);
      return;
    }
    if (!confirm("Excluir este agendamento?")) return;
    await removeScoped("one");
  };

  const openRevertConfirmation = () => {
    if (existingPayment?.paid_at) {
      toast({
        title: "Pagamento já realizado",
        description: "Este atendimento já possui pagamento realizado. Estorne o pagamento antes de reverter.",
        variant: "destructive",
      });
      return;
    }
    setRevertOpen(true);
  };

  const revertToGoogleEvent = async () => {
    if (!appointment) return;
    if (existingPayment?.paid_at) {
      setRevertOpen(false);
      toast({
        title: "Pagamento já realizado",
        description: "Este atendimento já possui pagamento realizado. Estorne o pagamento antes de reverter.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("appointments")
      .update({ converted_to_particular: false, patient_id: null, price: 0 })
      .eq("id", appointment.id);

    if (error) {
      setSaving(false);
      return toast({ title: "Erro", description: error.message, variant: "destructive" });
    }

    const { error: paymentError } = await supabase
      .from("payments")
      .delete()
      .eq("appointment_id", appointment.id)
      .is("paid_at", null);

    setSaving(false);
    if (paymentError) {
      return toast({ title: "Erro", description: paymentError.message, variant: "destructive" });
    }

    toast({ title: "Atendimento revertido para evento do Google" });
    setRevertOpen(false);
    onSaved();
    onOpenChange(false);
  };

  // External event from Google (Vittude or personal): unified dialog
  if (isExternal) {
    return (
      <ExternalEventDialog
        open={open}
        onOpenChange={onOpenChange}
        onSaved={onSaved}
        appointment={appointment}
        patients={patients}
        form={form}
        setForm={setForm}
        set={set}
        existingPayment={existingPayment}
        convertToParticular={convertToParticular}
        setConvertToParticular={setConvertToParticular}
        saving={saving}
        setSaving={setSaving}
        upsertPayment={upsertPayment}
        syncCalendar={syncCalendar}
        remove={remove}
        toast={toast}
        onPatientChange={onPatientChange}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isConverted ? (
              <>
                Atendimento particular
                <Badge variant="outline" className="text-[10px]">Google</Badge>
              </>
            ) : appointment ? "Editar consulta" : "Nova consulta"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Block toggle */}
          {!isConverted && (
            <label className="flex items-center gap-2 text-sm rounded-md border p-2 bg-muted/30 cursor-pointer">
              <input
                type="checkbox"
                checked={!!form.is_block}
                onChange={(e) => set("is_block", e.target.checked)}
              />
              <span className="font-medium">Bloqueio de agenda</span>
              <span className="text-xs text-muted-foreground">(reservar horário sem paciente)</span>
            </label>
          )}


          {form.is_block ? (
            <Field label="Motivo (opcional)">
              <Input value={form.block_reason} onChange={(e) => set("block_reason", e.target.value)} placeholder="Ex.: Almoço, supervisão..." />
            </Field>
          ) : (
            <Field label="Paciente *">
              <PatientCombobox patients={patients} value={form.patient_id} onChange={onPatientChange} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data"><Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} disabled={isConverted} /></Field>
            <Field label="Hora"><Input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} disabled={isConverted} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duração (min)"><Input type="number" value={form.duration} onChange={(e) => set("duration", e.target.value)} disabled={isConverted} /></Field>
            {!form.is_block && (
              <Field label="Valor (R$)"><Input type="number" step="0.01" value={form.price} onChange={(e) => set("price", e.target.value)} /></Field>
            )}
          </div>
          {isConverted && (
            <p className="text-xs text-muted-foreground">
              Horário controlado pelo Google Calendar. Para alterar, edite no próprio Google Calendar.
            </p>
          )}
          {!form.is_block && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Modalidade">
                <Select value={form.modality} onValueChange={(v) => set("modality", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_person">Presencial</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Agendada</SelectItem>
                    <SelectItem value="done">Realizada</SelectItem>
                    <SelectItem value="canceled">Cancelada</SelectItem>
                    <SelectItem value="no_show">Faltou</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}

          {!isConverted && (
            <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recorrência</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tipo">
                  <Select value={form.recurrence_mode} onValueChange={onRecurrenceModeChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem recorrência</SelectItem>
                      <SelectItem value="count">Quantidade fixa de sessões</SelectItem>
                      <SelectItem value="until">Até uma data final</SelectItem>
                      <SelectItem value="infinite">Indefinida (gera 52 sessões)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {form.recurrence_mode !== "none" && (
                  <Field label="Frequência">
                    <Select value={form.recurrence} onValueChange={(v) => set("recurrence", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Semanal</SelectItem>
                        <SelectItem value="biweekly">Quinzenal</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </div>
              {form.recurrence_mode === "count" && (
                <Field label="Quantidade de sessões">
                  <Input type="number" min={1} max={52} value={form.occurrences} onChange={(e) => set("occurrences", e.target.value)} />
                </Field>
              )}
              {form.recurrence_mode === "until" && (
                <Field label="Data final">
                  <Input type="date" value={form.recurrence_end_date} onChange={(e) => set("recurrence_end_date", e.target.value)} />
                </Field>
              )}
              {form.recurrence_mode !== "none" && (() => {
                const previewStart = new Date(`${form.date}T${form.time || "09:00"}:00`);
                const count = buildOccurrenceDates(
                  previewStart,
                  form.recurrence_mode,
                  form.recurrence,
                  Number(form.occurrences) || 1,
                  form.recurrence_end_date || "",
                ).length;
                return (
                  <div className="rounded-md bg-primary/10 text-primary px-2 py-1.5 text-xs font-medium">
                    Serão criadas {count} sessão(ões) — pagamento aplicado apenas à 1ª; demais ficam em aberto.
                  </div>
                );
              })()}
            </div>
          )}

          {!form.is_block && (
            <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pagamento</div>
              <Field label="Status do pagamento">
                <Select
                  value={form.payment_status}
                  onValueChange={(v) => {
                    if (v === "vittude" && existingPayment?.paid_at) {
                      toast({
                        title: "Pagamento já realizado",
                        description: "Este atendimento já possui um pagamento realizado. Estorne o pagamento no módulo Financeiro antes de reclassificá-lo como Vittude.",
                        variant: "destructive",
                      });
                      return;
                    }
                    setForm((f: any) => ({ ...f, payment_status: v, is_vittude: v === "vittude" }));
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Em aberto</SelectItem>
                    <SelectItem value="paid">Já pago</SelectItem>
                    <SelectItem value="scheduled_payment">A pagar (com previsão)</SelectItem>
                    {!isConverted && <SelectItem value="vittude">Vittude (gerenciado pela plataforma)</SelectItem>}
                  </SelectContent>
                </Select>
              </Field>
              {form.payment_status !== "pending" && form.payment_status !== "vittude" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label={form.payment_status === "paid" ? "Data do pagamento" : "Previsão de pagamento"}>
                    <Input type="date" value={form.payment_date} onChange={(e) => set("payment_date", e.target.value)} />
                  </Field>
                  <Field label="Forma">
                    <Select value={form.payment_method} onValueChange={(v) => set("payment_method", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pix">Pix</SelectItem>
                        <SelectItem value="cash">Dinheiro</SelectItem>
                        <SelectItem value="card">Cartão</SelectItem>
                        <SelectItem value="transfer">Transferência</SelectItem>
                        <SelectItem value="other">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              )}
              {existingPayment && form.payment_status !== "vittude" && (
                <div className="text-[11px] text-muted-foreground">
                  {existingPayment.paid_at
                    ? `Já registrado como pago em ${new Date(existingPayment.paid_at + "T00:00:00").toLocaleDateString("pt-BR")}`
                    : `Previsão atual: ${new Date(existingPayment.due_date + "T00:00:00").toLocaleDateString("pt-BR")}`}
                </div>
              )}
            </div>
          )}

          <Field label="Observações"><Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>

          {conflict && <div className="text-sm text-destructive">{conflict}</div>}
        </div>

        <DialogFooter className="gap-1 sm:gap-1 flex-row flex-wrap items-center">
          {appointment && (
            <Button variant="ghost" size="icon" onClick={remove} className="text-destructive hover:text-destructive mr-auto h-8 w-8" title="Excluir">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          {appointment && isConverted && (
            <Button type="button" variant="ghost" size="sm" onClick={openRevertConfirmation}>
              Reverter para evento do Google
            </Button>
          )}
          {appointment && isConverted && !appointment?.meet_link && (
            <span className="text-xs text-muted-foreground">
              Este horário foi criado em uma agenda externa e não permite gerar link do Meet. Para ter Meet, crie o atendimento pelo botão Nova consulta.
            </span>
          )}
          {appointment?.meet_link && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              title="Sala do Meet"
              onClick={() => window.open(appointment.meet_link, "_blank", "noopener,noreferrer")}
            >
              <Video className="h-4 w-4" />
            </Button>
          )}
          {appointment && !form.is_block && (
            <>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                title="WhatsApp"
                onClick={async () => {
                  const phone = appointment.patient?.phone;
                  if (!phone) {
                    return toast({ title: "Paciente sem telefone cadastrado", variant: "destructive" });
                  }
                  const url = await buildSessionWaUrlAsync({
                    phone,
                    patientName: appointment.patient?.full_name ?? "",
                    startsAt: appointment.starts_at,
                    meetLink: appointment.meet_link,
                    price: Number(appointment.price ?? 0),
                  });
                  window.open(url, "_blank", "noopener,noreferrer");
                }}
              >
                <MessageCircle className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                title="Cobrar pelo WhatsApp"
                onClick={async () => {
                  const phone = appointment.patient?.phone;
                  if (!phone) {
                    return toast({ title: "Paciente sem telefone cadastrado", variant: "destructive" });
                  }
                  const url = await buildChargeWaUrlAsync({
                    phone,
                    patientName: appointment.patient?.full_name ?? "",
                    startsAt: appointment.starts_at,
                    meetLink: appointment.meet_link,
                    price: Number(appointment.price ?? 0),
                    paymentLink: appointment.patient?.payment_link ?? null,
                  });
                  window.open(url, "_blank", "noopener,noreferrer");
                }}
              >
                <DollarSign className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button size="sm" onClick={submit} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={deleteScopeOpen} onOpenChange={setDeleteScopeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir agendamento recorrente</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Este agendamento faz parte de uma série. O que deseja excluir?</p>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
            <Button variant="outline" onClick={() => removeScoped("one")}>Apenas este evento</Button>
            <Button variant="outline" onClick={() => removeScoped("forward")}>Este e os próximos</Button>
            <Button variant="destructive" onClick={() => removeScoped("all")}>Todos os eventos da recorrência</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={revertOpen} onOpenChange={setRevertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverter para evento do Google?</AlertDialogTitle>
            <AlertDialogDescription>
              O atendimento voltará a ser tratado como evento do Google Calendar. O vínculo com paciente, valor e lançamento financeiro em aberto serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={revertToGoogleEvent} disabled={saving}>
              Reverter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};

