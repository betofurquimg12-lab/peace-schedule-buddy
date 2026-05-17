import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const schema = z
  .object({
    full_name: z.string().trim().min(2, "Informe o nome").max(120),
    phone: z.string().trim().max(30).optional().or(z.literal("")),
    email: z.string().trim().email("E-mail inválido").max(255).optional().or(z.literal("")),
    cpf: z.string().trim().max(20).optional().or(z.literal("")),
    birth_date: z.string().optional().or(z.literal("")),
    address: z.string().trim().max(255).optional().or(z.literal("")),
    city: z.string().trim().max(120).optional().or(z.literal("")),
    state: z.string().trim().max(120).optional().or(z.literal("")),
    country: z.string().trim().max(120).optional().or(z.literal("")),
    responsible_name: z.string().trim().max(120).optional().or(z.literal("")),
    responsible_phone: z.string().trim().max(30).optional().or(z.literal("")),
    default_session_price: z.coerce.number().min(0).max(99999),
    main_complaint: z.string().trim().max(2000).optional().or(z.literal("")),
    history: z.string().trim().max(5000).optional().or(z.literal("")),
    notes: z.string().trim().max(5000).optional().or(z.literal("")),
  })
  .refine((d) => !!(d.phone || d.email), { message: "Informe telefone ou e-mail", path: ["phone"] });

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
  patient?: any;
};

export const PatientFormDialog = ({ open, onOpenChange, onSaved, patient }: Props) => {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const isOwner = role === "owner";
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({
    full_name: "",
    phone: "",
    email: "",
    cpf: "",
    birth_date: "",
    address: "",
    city: "",
    state: "",
    country: "Brasil",
    responsible_name: "",
    responsible_phone: "",
    default_session_price: 0,
    main_complaint: "",
    history: "",
    notes: "",
  });

  useEffect(() => {
    if (patient) {
      setForm({
        full_name: patient.full_name ?? "",
        phone: patient.phone ?? "",
        email: patient.email ?? "",
        cpf: patient.cpf ?? "",
        birth_date: patient.birth_date ?? "",
        address: patient.address ?? "",
        city: patient.city ?? "",
        state: patient.state ?? "",
        country: patient.country ?? "",
        responsible_name: patient.responsible_name ?? "",
        responsible_phone: patient.responsible_phone ?? "",
        default_session_price: patient.default_session_price ?? 0,
        main_complaint: patient.main_complaint ?? "",
        history: patient.history ?? "",
        notes: patient.notes ?? "",
      });
    } else {
      setForm({
        full_name: "", phone: "", email: "", cpf: "", birth_date: "", address: "",
        city: "", state: "", country: "Brasil",
        responsible_name: "", responsible_phone: "", default_session_price: 0,
        main_complaint: "", history: "", notes: "",
      });
    }
  }, [patient, open]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const submit = async () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast({ title: "Verifique os dados", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      full_name: parsed.data.full_name,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      birth_date: parsed.data.birth_date || null,
      address: parsed.data.address || null,
      city: parsed.data.city || null,
      state: parsed.data.state || null,
      country: parsed.data.country || null,
      responsible_name: parsed.data.responsible_name || null,
      responsible_phone: parsed.data.responsible_phone || null,
      default_session_price: parsed.data.default_session_price,
    };
    if (isOwner) {
      payload.main_complaint = parsed.data.main_complaint || null;
      payload.history = parsed.data.history || null;
      payload.notes = parsed.data.notes || null;
    }
    const op = patient
      ? supabase.from("patients").update(payload).eq("id", patient.id)
      : supabase.from("patients").insert({ ...payload, created_by: user?.id });
    const { error } = await op;
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: patient ? "Paciente atualizado" : "Paciente criado" });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{patient ? "Editar paciente" : "Novo paciente"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basic">
          <TabsList>
            <TabsTrigger value="basic">Dados básicos</TabsTrigger>
            {isOwner && <TabsTrigger value="clinical">Dados clínicos</TabsTrigger>}
          </TabsList>

          <TabsContent value="basic" className="space-y-3 mt-4">
            <Field label="Nome completo *"><Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} /></Field>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Telefone"><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(11) 99999-9999" /></Field>
              <Field label="E-mail"><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Data de nascimento"><Input type="date" value={form.birth_date} onChange={(e) => set("birth_date", e.target.value)} /></Field>
              <Field label="Valor padrão da sessão (R$)"><Input type="number" step="0.01" value={form.default_session_price} onChange={(e) => set("default_session_price", e.target.value)} /></Field>
            </div>
            <Field label="Endereço"><Input value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Cidade"><Input value={form.city} onChange={(e) => set("city", e.target.value)} /></Field>
              <Field label="Estado / Província"><Input value={form.state} onChange={(e) => set("state", e.target.value)} /></Field>
              <Field label="País"><Input value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="Brasil" /></Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Responsável (se menor)"><Input value={form.responsible_name} onChange={(e) => set("responsible_name", e.target.value)} /></Field>
              <Field label="Telefone do responsável"><Input value={form.responsible_phone} onChange={(e) => set("responsible_phone", e.target.value)} /></Field>
            </div>
          </TabsContent>

          {isOwner && (
            <TabsContent value="clinical" className="space-y-3 mt-4">
              <Field label="Queixa principal"><Textarea rows={3} value={form.main_complaint} onChange={(e) => set("main_complaint", e.target.value)} /></Field>
              <Field label="Histórico"><Textarea rows={4} value={form.history} onChange={(e) => set("history", e.target.value)} /></Field>
              <Field label="Observações"><Textarea rows={4} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter>
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
