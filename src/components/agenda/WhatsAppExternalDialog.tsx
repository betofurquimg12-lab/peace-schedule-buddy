import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { buildSessionWaUrlAsync, buildChargeWaUrlAsync } from "@/lib/sessionReminder";
import { MessageCircle, DollarSign } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  appointment: any | null;
  onLinked?: () => void;
}

type Patient = { id: string; full_name: string; phone: string | null; payment_link: string | null };

export const WhatsAppExternalDialog = ({ open, onOpenChange, appointment, onLinked }: Props) => {
  const { toast } = useToast();
  const [mode, setMode] = useState<"select" | "manual">("select");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [price, setPrice] = useState<number>(0);
  const [busy, setBusy] = useState<null | "reminder" | "charge">(null);

  useEffect(() => {
    if (!open) return;
    setMode("select");
    setSearch("");
    setSelectedId("");
    setManualName("");
    setManualPhone("");
    setPrice(Number(appointment?.price ?? 0));
    (async () => {
      const { data } = await supabase
        .from("patients")
        .select("id, full_name, phone, payment_link")
        .eq("active", true)
        .order("full_name");
      setPatients(data ?? []);
    })();
  }, [open, appointment]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return patients.slice(0, 50);
    return patients.filter((p) => p.full_name.toLowerCase().includes(q)).slice(0, 50);
  }, [patients, search]);

  const selectedPatient = patients.find((p) => p.id === selectedId);

  const resolveTarget = () => {
    if (mode === "select") {
      if (!selectedPatient) {
        toast({ title: "Selecione um paciente", variant: "destructive" });
        return null;
      }
      if (!selectedPatient.phone) {
        toast({ title: "Paciente sem telefone cadastrado", variant: "destructive" });
        return null;
      }
      return { name: selectedPatient.full_name, phone: selectedPatient.phone, patientId: selectedPatient.id };
    }
    const name = manualName.trim();
    const phone = manualPhone.trim();
    if (!phone) {
      toast({ title: "Informe o telefone", variant: "destructive" });
      return null;
    }
    return { name: name || "", phone, patientId: null as string | null };
  };

  const linkPatientIfNeeded = async (patientId: string | null) => {
    if (!patientId || !appointment?.id) return;
    const { error } = await supabase
      .from("appointments")
      .update({ patient_id: patientId })
      .eq("id", appointment.id);
    if (error) {
      toast({ title: "Erro ao vincular paciente", description: error.message, variant: "destructive" });
      return;
    }
    onLinked?.();
  };

  const send = async (kind: "reminder" | "charge") => {
    const t = resolveTarget();
    if (!t) return;
    setBusy(kind);
    try {
      const opts = {
        phone: t.phone,
        patientName: t.name,
        startsAt: appointment?.starts_at,
        meetLink: appointment?.meet_link,
        price: Number(price || 0),
      };
      const url = kind === "charge"
        ? await buildChargeWaUrlAsync(opts)
        : await buildSessionWaUrlAsync(opts);
      await linkPatientIfNeeded(t.patientId);
      window.open(url, "_blank", "noopener,noreferrer");
      onOpenChange(false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar WhatsApp</DialogTitle>
          <DialogDescription>
            Este evento veio do Google Calendar e não tem paciente vinculado. Selecione um cadastrado ou informe os dados manualmente.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === "select" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("select")}
          >
            Paciente cadastrado
          </Button>
          <Button
            type="button"
            variant={mode === "manual" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("manual")}
          >
            Informar manualmente
          </Button>
        </div>

        {mode === "select" ? (
          <div className="space-y-2">
            <Label className="text-xs">Buscar paciente</Label>
            <Input
              placeholder="Digite o nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-56 overflow-y-auto border rounded-md divide-y">
              {filtered.length === 0 && (
                <div className="p-3 text-xs text-muted-foreground text-center">Nenhum paciente.</div>
              )}
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full text-left p-2 text-sm hover:bg-muted ${selectedId === p.id ? "bg-primary/10" : ""}`}
                >
                  <div className="font-medium">{p.full_name}</div>
                  <div className="text-xs text-muted-foreground">{p.phone || "sem telefone"}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome (opcional)</Label>
              <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Nome do paciente" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">WhatsApp *</Label>
              <Input value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} placeholder="(11) 98765-4321" />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Valor da sessão (R$)</Label>
          <Input
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={!!busy}>Cancelar</Button>
          <Button
            variant="outline"
            onClick={() => send("reminder")}
            disabled={!!busy}
            className="text-emerald-600"
          >
            <MessageCircle className="h-4 w-4" /> {busy === "reminder" ? "Abrindo..." : "Enviar lembrete"}
          </Button>
          <Button
            onClick={() => send("charge")}
            disabled={!!busy}
          >
            <DollarSign className="h-4 w-4" /> {busy === "charge" ? "Abrindo..." : "Cobrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
