import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MessageCircle, Pencil } from "lucide-react";
import { formatBRL, formatDateTimeBR, buildWaUrl } from "@/lib/format";
import { PatientFormDialog } from "@/components/patients/PatientFormDialog";

const PatientDetail = () => {
  const { id } = useParams();
  const { role } = useAuth();
  const [patient, setPatient] = useState<any>(null);
  const [appts, setAppts] = useState<any[]>([]);
  const [edit, setEdit] = useState(false);

  const load = async () => {
    const { data: p } = await supabase.from("patients").select("*").eq("id", id!).maybeSingle();
    setPatient(p);
    const { data: a } = await supabase
      .from("appointments")
      .select("id, starts_at, price, status, payment:payments(amount, paid_at, method)")
      .eq("patient_id", id!)
      .order("starts_at", { ascending: false });
    setAppts(a ?? []);
  };
  useEffect(() => { if (id) void load(); }, [id]);

  if (!patient) return null;

  const now = new Date().toISOString();
  const upcoming = appts.filter((a) => a.starts_at >= now).slice().reverse(); // ascending
  const past = appts.filter((a) => a.starts_at < now);

  const totalDone = appts.filter((a) => a.status === "done").reduce((s, a) => s + Number(a.price || 0), 0);
  const paid = appts.reduce((s, a) => s + (a.payment?.[0]?.amount ? Number(a.payment[0].amount) : 0), 0);
  const balance = Math.max(0, totalDone - paid);

  return (
    <>
      <Link to="/pacientes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> Pacientes
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl">{patient.full_name}</h1>
          <p className="text-sm text-muted-foreground">{[patient.cpf && `CPF: ${patient.cpf}`, patient.phone, patient.email].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex gap-2">
          {patient.phone && (
            <Button asChild variant="outline">
              <a href={buildWaUrl(patient.phone)} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            </Button>
          )}
          <Button onClick={() => setEdit(true)}><Pencil className="h-4 w-4" /> Editar</Button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3 mb-6">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Valor padrão</div>
          <div className="text-lg font-semibold">{formatBRL(Number(patient.default_session_price))}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total realizado</div>
          <div className="text-lg font-semibold">{formatBRL(totalDone)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Saldo em aberto</div>
          <div className={`text-lg font-semibold ${balance > 0 ? "text-warning" : "text-success"}`}>{formatBRL(balance)}</div>
        </Card>
      </div>

      {role === "owner" && (patient.main_complaint || patient.history || patient.notes) && (
        <Card className="p-5 mb-6">
          <h2 className="text-lg mb-3">Dados clínicos</h2>
          {patient.main_complaint && <Section title="Queixa principal">{patient.main_complaint}</Section>}
          {patient.history && <Section title="Histórico">{patient.history}</Section>}
          {patient.notes && <Section title="Observações">{patient.notes}</Section>}
        </Card>
      )}

      <Card className="p-5 mb-6">
        <h2 className="text-lg mb-3">Próximas sessões</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma sessão agendada.</p>
        ) : (
          <ul className="divide-y">
            {upcoming.map((a) => (
              <li key={a.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{formatDateTimeBR(a.starts_at)}</div>
                  <div className="text-xs text-muted-foreground capitalize">{statusLabel(a.status)}</div>
                </div>
                <div className="text-sm">{formatBRL(Number(a.price))}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-lg mb-3">Histórico de sessões</h2>
        {past.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma sessão registrada.</p>
        ) : (
          <ul className="divide-y">
            {past.map((a) => {
              const pay = a.payment?.[0];
              return (
                <li key={a.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{formatDateTimeBR(a.starts_at)}</div>
                    <div className="text-xs text-muted-foreground capitalize">{statusLabel(a.status)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm">{formatBRL(Number(a.price))}</div>
                    <Badge variant={pay ? "secondary" : "outline"} className={pay ? "bg-success/15 text-success border-0" : ""}>
                      {pay ? "Pago" : a.status === "done" ? "Pendente" : "—"}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <PatientFormDialog open={edit} onOpenChange={setEdit} onSaved={load} patient={patient} />
    </>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-3 last:mb-0">
    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{title}</div>
    <p className="text-sm whitespace-pre-wrap">{children}</p>
  </div>
);

const statusLabel = (s: string) =>
  ({ scheduled: "Agendada", done: "Realizada", canceled: "Cancelada", no_show: "Faltou" }[s] ?? s);

export default PatientDetail;
