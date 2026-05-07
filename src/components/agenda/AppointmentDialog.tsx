import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatDateTimeBR } from "@/lib/format";
import { Trash2, MessageCircle, Lock } from "lucide-react";
import { buildSessionWaUrl } from "@/lib/sessionReminder";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
  appointment?: any;
  presetStart?: Date | null;
};

// recurrence_mode: how the user picks recurrence
//  - none      : single appointment
//  - count     : N occurrences
//  - until     : until end date
//  - infinite  : up to a hard cap (52) so we don't generate forever
const schema = z.object({
  patient_id: z.string().uuid("Selecione um paciente"),
  date: z.string().min(1),
  time: z.string().min(1),
  duration: z.coerce.number().min(10).max(480),
  modality: z.enum(["in_person", "online"]),
  price: z.coerce.number().min(0).max(99999),
  status: z.enum(["scheduled", "done", "canceled", "no_show"]),
  recurrence: z.enum(["none", "weekly", "biweekly"]),
  recurrence_mode: z.enum(["none", "count", "until", "infinite"]),
  occurrences: z.coerce.number().min(1).max(52),
  recurrence_end_date: z.string().optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

const INFINITE_CAP = 52; // safety cap for "infinita"

const toLocalDate = (d: Date) => d.toISOString().slice(0, 10);
const toLocalTime = (d: Date) => d.toTimeString().slice(0, 5);

export const AppointmentDialog = ({ open, onOpenChange, onSaved, appointment, presetStart }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [patients, setPatients] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [existingPayment, setExistingPayment] = useState<any>(null);
  const isExternal = appointment?.source === "google";
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
  });

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
              payment_status: data.paid_at ? "paid" : "scheduled_payment",
              payment_date: data.paid_at ?? data.due_date ?? toLocalDate(s),
              payment_method: data.method ?? "pix",
            }));
          } else {
            setForm((f: any) => ({ ...f, payment_status: "pending", payment_date: toLocalDate(s), payment_method: "pix" }));
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
        recurrence_mode: appointment.recurrence && appointment.recurrence !== "none" ? "count" : "none",
        occurrences: 1,
        recurrence_end_date: appointment.recurrence_end_date ?? "",
        notes: appointment.notes ?? "",
        payment_status: "pending",
        payment_date: toLocalDate(s),
        payment_method: "pix",
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
      }));
    }
    setConflict(null);
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
        if (p?.email) attendees.push({ email: p.email, displayName: p.full_name });
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

  const buildOccurrenceDates = (start: Date, mode: string, recurrence: string, occurrences: number, endDate: string): Date[] => {
    if (mode === "none" || recurrence === "none") return [start];
    const stepDays = recurrence === "weekly" ? 7 : 14;
    const dates: Date[] = [];
    if (mode === "count") {
      for (let i = 0; i < Math.min(occurrences, INFINITE_CAP); i++) {
        const d = new Date(start); d.setDate(d.getDate() + i * stepDays);
        dates.push(d);
      }
    } else if (mode === "until") {
      if (!endDate) return [start];
      const end = new Date(`${endDate}T23:59:59`);
      let i = 0;
      while (true) {
        const d = new Date(start); d.setDate(d.getDate() + i * stepDays);
        if (d > end) break;
        dates.push(d);
        i++;
        if (i > INFINITE_CAP) break;
      }
    } else if (mode === "infinite") {
      for (let i = 0; i < INFINITE_CAP; i++) {
        const d = new Date(start); d.setDate(d.getDate() + i * stepDays);
        dates.push(d);
      }
    }
    return dates;
  };

  const submit = async () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast({ title: "Verifique os dados", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    setSaving(true);
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
      // Editing only this single appointment
      const { error } = await supabase.from("appointments").update({
        patient_id: parsed.data.patient_id,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        duration_minutes: parsed.data.duration,
        modality: parsed.data.modality,
        price: parsed.data.price,
        status: parsed.data.status,
        notes: parsed.data.notes || null,
      }).eq("id", appointment.id);
      if (error) {
        setSaving(false);
        return toast({ title: "Erro", description: error.message, variant: "destructive" });
      }

      await upsertPayment(appointment.id, parsed.data.price);

      const result = await syncCalendar(
        appointment.google_event_id ? "update" : "create",
        appointment.id,
        {
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          patient_id: parsed.data.patient_id,
          google_event_id: appointment.google_event_id,
        },
      );
      if (result?.event_id) {
        await supabase.from("appointments").update({
          google_event_id: result.event_id,
          meet_link: result.meet_link ?? null,
        }).eq("id", appointment.id);
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
            .select("id, google_event_id")
            .eq("recurrence_group_id", groupId)
            .gte("starts_at", appointment.starts_at);
          toDelete = data ?? [];
        } else {
          toDelete = [{ id: appointment.id, google_event_id: appointment.google_event_id }];
        }
        for (const a of toDelete) {
          if (a.google_event_id) {
            await syncCalendar("delete", a.id, { google_event_id: a.google_event_id });
          }
        }
        await supabase.from("appointments").delete().in("id", toDelete.map((a) => a.id));
      }

      const groupId = dates.length > 1 ? crypto.randomUUID() : null;
      const recurrenceEndDate = parsed.data.recurrence_mode === "until" ? (parsed.data.recurrence_end_date || null) : null;

      const rows = dates.map((s) => {
        const e = new Date(s.getTime() + parsed.data.duration * 60000);
        return {
          patient_id: parsed.data.patient_id,
          starts_at: s.toISOString(),
          ends_at: e.toISOString(),
          duration_minutes: parsed.data.duration,
          modality: parsed.data.modality,
          price: parsed.data.price,
          status: parsed.data.status,
          recurrence: parsed.data.recurrence,
          recurrence_group_id: groupId,
          recurrence_end_date: recurrenceEndDate,
          source: "system",
          notes: parsed.data.notes || null,
          created_by: user?.id,
        };
      });

      const { data: inserted, error } = await supabase.from("appointments").insert(rows).select("id, starts_at, ends_at");
      console.log("[AppointmentDialog] insert result", { requested: rows.length, inserted: inserted?.length, error });
      if (error) {
        setSaving(false);
        return toast({ title: "Erro", description: error.message, variant: "destructive" });
      }

      if (inserted) {
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
      }

      if (inserted && inserted.length) {
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

  const remove = async () => {
    if (!appointment) return;
    if (!confirm("Excluir este agendamento?")) return;
    if (appointment.google_event_id) {
      await syncCalendar("delete", appointment.id, {
        google_event_id: appointment.google_event_id,
      });
    }
    const { error } = await supabase.from("appointments").delete().eq("id", appointment.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Excluído" });
    onSaved();
    onOpenChange(false);
  };

  // External event from Google: read-only view
  if (isExternal) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" /> Evento do Google Calendar
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="font-medium">{appointment.external_summary ?? "(Sem título)"}</div>
            <div className="text-muted-foreground">
              {formatDateTimeBR(appointment.starts_at)} — {new Date(appointment.ends_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </div>
            <p className="text-xs text-muted-foreground pt-2">
              Este horário está bloqueado porque foi criado direto no Google Calendar.
              Para alterar ou excluir, edite no próprio Google Calendar — o sistema sincroniza automaticamente em até 5 minutos.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{appointment ? "Editar consulta" : "Nova consulta"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Paciente *">
            <Select value={form.patient_id} onValueChange={onPatientChange}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data"><Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} /></Field>
            <Field label="Hora"><Input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duração (min)"><Input type="number" value={form.duration} onChange={(e) => set("duration", e.target.value)} /></Field>
            <Field label="Valor (R$)"><Input type="number" step="0.01" value={form.price} onChange={(e) => set("price", e.target.value)} /></Field>
          </div>
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

          {(
            <></>
          )}
          {true && (
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

          <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pagamento</div>
            <Field label="Status do pagamento">
              <Select value={form.payment_status} onValueChange={(v) => set("payment_status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Em aberto</SelectItem>
                  <SelectItem value="paid">Já pago</SelectItem>
                  <SelectItem value="scheduled_payment">A pagar (com previsão)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {form.payment_status !== "pending" && (
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
            {existingPayment && (
              <div className="text-[11px] text-muted-foreground">
                {existingPayment.paid_at
                  ? `Já registrado como pago em ${new Date(existingPayment.paid_at + "T00:00:00").toLocaleDateString("pt-BR")}`
                  : `Previsão atual: ${new Date(existingPayment.due_date + "T00:00:00").toLocaleDateString("pt-BR")}`}
              </div>
            )}
          </div>

          <Field label="Observações"><Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>

          {conflict && <div className="text-sm text-destructive">{conflict}</div>}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {appointment && (
            <Button variant="ghost" onClick={remove} className="text-destructive hover:text-destructive mr-auto">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          {appointment?.patient?.phone && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const url = buildSessionWaUrl({
                  phone: appointment.patient.phone,
                  patientName: appointment.patient.full_name,
                  startsAt: appointment.starts_at,
                  meetLink: appointment.meet_link,
                });
                window.open(url, "_blank", "noopener,noreferrer");
              }}
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-xs">{label}</Label>
    {children}
  </div>
);
