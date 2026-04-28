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
import { Trash2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
  appointment?: any;
  presetStart?: Date | null;
};

const schema = z.object({
  patient_id: z.string().uuid("Selecione um paciente"),
  date: z.string().min(1),
  time: z.string().min(1),
  duration: z.coerce.number().min(10).max(480),
  modality: z.enum(["in_person", "online"]),
  price: z.coerce.number().min(0).max(99999),
  status: z.enum(["scheduled", "done", "canceled", "no_show"]),
  recurrence: z.enum(["none", "weekly", "biweekly"]),
  occurrences: z.coerce.number().min(1).max(52),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

const toLocalDate = (d: Date) => d.toISOString().slice(0, 10);
const toLocalTime = (d: Date) => d.toTimeString().slice(0, 5);

export const AppointmentDialog = ({ open, onOpenChange, onSaved, appointment, presetStart }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [patients, setPatients] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [form, setForm] = useState<any>({
    patient_id: "",
    date: toLocalDate(new Date()),
    time: "09:00",
    duration: 50,
    modality: "online",
    price: 0,
    status: "scheduled",
    recurrence: "none",
    occurrences: 1,
    notes: "",
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
      setForm({
        patient_id: appointment.patient?.id ?? appointment.patient_id,
        date: toLocalDate(s),
        time: toLocalTime(s),
        duration: Math.round((+e - +s) / 60000),
        modality: appointment.modality ?? "online",
        price: Number(appointment.price ?? 0),
        status: appointment.status ?? "scheduled",
        recurrence: appointment.recurrence ?? "none",
        occurrences: 1,
        notes: appointment.notes ?? "",
      });
    } else {
      const s = presetStart ?? new Date();
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
        occurrences: 1,
        notes: "",
      }));
    }
    setConflict(null);
  }, [appointment, presetStart, open]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const onPatientChange = (id: string) => {
    const p = patients.find((x) => x.id === id);
    setForm((f: any) => ({ ...f, patient_id: id, price: p?.default_session_price ?? f.price }));
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
      // Fetch patient email + clinic email for attendees
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
      setConflict(`Conflito com: ${conflicts[0].patient?.full_name} em ${formatDateTimeBR(conflicts[0].starts_at)}`);
      setSaving(false);
      return;
    }

    if (appointment) {
      const { error } = await supabase.from("appointments").update({
        patient_id: parsed.data.patient_id,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        duration_minutes: parsed.data.duration,
        modality: parsed.data.modality,
        price: parsed.data.price,
        status: parsed.data.status,
        recurrence: parsed.data.recurrence,
        notes: parsed.data.notes || null,
      }).eq("id", appointment.id);
      if (error) {
        setSaving(false);
        return toast({ title: "Erro", description: error.message, variant: "destructive" });
      }

      // Sync calendar (only for online or already-linked events)
      if (parsed.data.modality === "online" || appointment.google_event_id) {
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
      }

      setSaving(false);
      toast({ title: "Agendamento atualizado" });
    } else {
      const groupId = parsed.data.recurrence !== "none" && parsed.data.occurrences > 1 ? crypto.randomUUID() : null;
      const stepDays = parsed.data.recurrence === "weekly" ? 7 : parsed.data.recurrence === "biweekly" ? 14 : 0;
      const rows: any[] = [];
      const total = stepDays > 0 ? parsed.data.occurrences : 1;
      for (let i = 0; i < total; i++) {
        const s = new Date(start); s.setDate(s.getDate() + i * stepDays);
        const e = new Date(s.getTime() + parsed.data.duration * 60000);
        rows.push({
          patient_id: parsed.data.patient_id,
          starts_at: s.toISOString(),
          ends_at: e.toISOString(),
          duration_minutes: parsed.data.duration,
          modality: parsed.data.modality,
          price: parsed.data.price,
          status: parsed.data.status,
          recurrence: parsed.data.recurrence,
          recurrence_group_id: groupId,
          notes: parsed.data.notes || null,
          created_by: user?.id,
        });
      }
      const { data: inserted, error } = await supabase.from("appointments").insert(rows).select("id, starts_at, ends_at");
      if (error) {
        setSaving(false);
        return toast({ title: "Erro", description: error.message, variant: "destructive" });
      }

      // Sync each created appointment with Google Calendar (only if online)
      if (parsed.data.modality === "online" && inserted) {
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

      setSaving(false);
      toast({ title: total > 1 ? `${total} agendamentos criados` : "Agendamento criado" });
    }
    onSaved();
    onOpenChange(false);
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
          {!appointment && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Recorrência">
                <Select value={form.recurrence} onValueChange={(v) => set("recurrence", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem recorrência</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="biweekly">Quinzenal</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {form.recurrence !== "none" && (
                <Field label="Quantidade"><Input type="number" min={1} max={52} value={form.occurrences} onChange={(e) => set("occurrences", e.target.value)} /></Field>
              )}
            </div>
          )}
          <Field label="Observações"><Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>

          {conflict && <div className="text-sm text-destructive">{conflict}</div>}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {appointment && (
            <Button variant="ghost" onClick={remove} className="text-destructive hover:text-destructive mr-auto">
              <Trash2 className="h-4 w-4" />
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
