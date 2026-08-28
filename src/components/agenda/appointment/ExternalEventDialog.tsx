import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock } from "lucide-react";
import { formatDateTimeBR } from "@/lib/format";
import { Field } from "./Field";
import { PatientCombobox } from "./PatientCombobox";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
  appointment: any;
  patients: any[];
  form: any;
  setForm: (f: any) => void;
  set: (k: string, v: any) => void;
  existingPayment: any;
  convertToParticular: boolean;
  setConvertToParticular: (v: boolean) => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
  upsertPayment: (appointmentId: string, price: number) => Promise<void>;
  syncCalendar: (
    action: "create" | "update" | "delete",
    appointmentId: string,
    args: any,
  ) => Promise<{ event_id?: string; meet_link?: string | null } | null>;
  remove: () => void;
  toast: (opts: any) => void;
  onPatientChange: (id: string) => void;
};

export const ExternalEventDialog = ({
  open,
  onOpenChange,
  onSaved,
  appointment,
  patients,
  form,
  setForm,
  set,
  existingPayment,
  convertToParticular,
  setConvertToParticular,
  saving,
  setSaving,
  upsertPayment,
  syncCalendar,
  remove,
  toast,
  onPatientChange,
}: Props) => {
  const isVittudeEvent = !!appointment?.is_vittude;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setConvertToParticular(false); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isVittudeEvent ? "Atendimento Vittude" : (<><Lock className="h-4 w-4" /> Evento do Google Calendar</>)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="font-medium">{appointment.patient?.full_name ?? appointment.external_summary ?? "(Sem título)"}</div>
          <div className="text-muted-foreground">
            {formatDateTimeBR(appointment.starts_at)} — {new Date(appointment.ends_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </div>
          {!isVittudeEvent && (
            <p className="text-xs text-muted-foreground pt-2">
              Este horário está bloqueado porque foi criado direto no Google Calendar.
              Para alterar ou excluir, edite no próprio Google Calendar — o sistema sincroniza automaticamente em até 5 minutos.
            </p>
          )}



          <label className="flex items-center gap-2 text-sm rounded-md border p-2 bg-muted/30 cursor-pointer mt-2">
            <input
              type="checkbox"
              checked={convertToParticular}
              onChange={(e) => {
                if (e.target.checked && existingPayment?.paid_at) {
                  toast({
                    title: "Pagamento já registrado",
                    description: "Este atendimento já possui um pagamento registrado. Estorne o pagamento antes de convertê-lo para particular.",
                    variant: "destructive",
                  });
                  return;
                }
                setConvertToParticular(e.target.checked);
                if (!e.target.checked) {
                  setForm((f: any) => ({ ...f, patient_id: appointment.patient?.id ?? "", price: Number(appointment.price ?? 0), payment_status: "pending", payment_method: "pix" }));
                }
              }}
            />
            <span className="font-medium">Converter para atendimento particular</span>
          </label>

          <Field label="Observações">
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Anotações sobre este atendimento..."
            />
          </Field>


          {convertToParticular && (
            <div className="space-y-3 pt-1">
              <Field label="Paciente *">
                <PatientCombobox patients={patients} value={form.patient_id} onChange={onPatientChange} />
              </Field>
              <Field label="Valor (R$)">
                <Input type="number" step="0.01" value={form.price} onChange={(e) => set("price", e.target.value)} />
              </Field>
              <Field label="Status do pagamento">
                <Select
                  value={form.payment_status}
                  onValueChange={(v) => setForm((f: any) => ({ ...f, payment_status: v }))}
                >
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
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="destructive" onClick={remove}>Excluir</Button>
          {convertToParticular ? (
            <>
              <Button variant="outline" onClick={() => { setConvertToParticular(false); onOpenChange(false); }}>Cancelar</Button>
              <Button onClick={async () => {
                if (!form.patient_id) {
                  toast({ title: "Selecione um paciente", variant: "destructive" });
                  return;
                }
                setSaving(true);
                const { error } = await supabase.from("appointments").update({
                  is_vittude: false,
                  converted_to_particular: true,
                  patient_id: form.patient_id,
                  price: Number(form.price),
                  notes: form.notes || null,
                }).eq("id", appointment.id);

                if (error) {
                  setSaving(false);
                  return toast({ title: "Erro", description: error.message, variant: "destructive" });
                }
                await upsertPayment(appointment.id, Number(form.price));

                if (appointment.google_event_id) {
                  const result = await syncCalendar("update", appointment.id, {
                    starts_at: appointment.starts_at,
                    ends_at: appointment.ends_at,
                    patient_id: form.patient_id,
                    google_event_id: appointment.google_event_id,
                    skip_patient_attendee: true,
                    calendar_id: appointment.google_calendar_id,
                  });
                  if (result?.meet_link) {
                    await supabase
                      .from("appointments")
                      .update({ meet_link: result.meet_link })
                      .eq("id", appointment.id);
                  }
                }

                setSaving(false);
                toast({ title: "Atendimento convertido para particular" });
                setConvertToParticular(false);
                onSaved();
                onOpenChange(false);
              }} disabled={saving}>
                {saving ? "Salvando..." : "Salvar como particular"}
              </Button>
            </>
          ) : (
            <Button onClick={async () => {
              setSaving(true);
              const { error } = await supabase
                .from("appointments")
                .update({ notes: form.notes || null })
                .eq("id", appointment.id);
              setSaving(false);
              if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
              toast({ title: "Observações salvas" });
              onSaved();
              onOpenChange(false);
            }} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          )}

        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
