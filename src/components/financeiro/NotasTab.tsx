import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatBRL } from "@/lib/format";
import { Copy, Check, AlertTriangle, Undo2 } from "lucide-react";

const ASSINATURA = "Psicóloga Gessica Furquim CRP 0815590";

interface Props {
  month: Date;
}

interface Group {
  id: string;
  name: string;
  cpf: string | null;
  sessions: { id: string; starts_at: string; price: number }[];
  total: number;
  descricao: string;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

const brl = (v: number) => formatBRL(v).replace(/\u00a0/g, " ");

const joinDates = (dates: string[]) =>
  dates.length <= 1 ? dates.join("") : `${dates.slice(0, -1).join(", ")} e ${dates[dates.length - 1]}`;

const buildDescricao = (sessions: { starts_at: string; price: number }[], total: number) => {
  const n = sessions.length;
  const samePrice = sessions.every((s) => s.price === sessions[0].price);
  if (n === 1) {
    return `1 Sessão de psicoterapia realizada no dia ${fmtDate(sessions[0].starts_at)}, no valor de ${brl(sessions[0].price)}. ${ASSINATURA}`;
  }
  if (samePrice) {
    return `${n} Sessões de psicoterapia realizadas nos dias ${joinDates(sessions.map((s) => fmtDate(s.starts_at)))}, cada uma no valor de ${brl(sessions[0].price)}. ${ASSINATURA}`;
  }
  const itens = sessions.map((s) => `${fmtDate(s.starts_at)} (${brl(s.price)})`);
  return `${n} Sessões de psicoterapia realizadas nos dias ${joinDates(itens)}, totalizando ${brl(total)}. ${ASSINATURA}`;
};

export const NotasTab = ({ month }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [appts, setAppts] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [numeros, setNumeros] = useState<Record<string, string>>({});

  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const competencia = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;

  const load = async () => {
    setLoading(true);
    const [a, i] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, starts_at, price, patient:patients!inner(id, full_name, cpf, default_session_price, emite_nota)")
        .eq("status", "done")
        .eq("is_block", false)
        .eq("patient.emite_nota", true)
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .order("starts_at", { ascending: true }),
      (supabase as any).from("invoices").select("*").eq("competencia", competencia),
    ]);
    if (a.error) toast({ title: "Erro ao carregar sessões", description: a.error.message, variant: "destructive" });
    if (i.error) toast({ title: "Erro ao carregar notas", description: i.error.message, variant: "destructive" });
    setAppts(a.data ?? []);
    setInvoices(i.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competencia]);

  const groups: Group[] = useMemo(() => {
    const map = new Map<string, Group>();
    for (const a of appts) {
      const p = a.patient;
      if (!p?.id) continue;
      const price = Number(a.price) > 0 ? Number(a.price) : Number(p.default_session_price ?? 0);
      if (!map.has(p.id)) map.set(p.id, { id: p.id, name: p.full_name, cpf: p.cpf, sessions: [], total: 0, descricao: "" });
      map.get(p.id)!.sessions.push({ id: a.id, starts_at: a.starts_at, price });
    }
    return Array.from(map.values())
      .map((g) => {
        const total = g.sessions.reduce((s, x) => s + x.price, 0);
        return { ...g, total, descricao: buildDescricao(g.sessions, total) };
      })
      .sort((x, y) => x.name.localeCompare(y.name, "pt-BR"));
  }, [appts]);

  const invoiceByPatient = useMemo(() => {
    const m = new Map<string, any>();
    invoices.forEach((inv) => m.set(inv.patient_id, inv));
    return m;
  }, [invoices]);

  const pendentes = groups.filter((g) => !invoiceByPatient.has(g.id));
  const emitidas = groups.filter((g) => invoiceByPatient.has(g.id));

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copiado` });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  const marcarEmitida = async (g: Group) => {
    const { error } = await (supabase as any).from("invoices").upsert(
      {
        patient_id: g.id,
        competencia,
        appointment_ids: g.sessions.map((s) => s.id),
        sessions_count: g.sessions.length,
        valor_total: g.total,
        descricao: g.descricao,
        numero_nota: numeros[g.id]?.trim() || null,
        created_by: user?.id,
      },
      { onConflict: "patient_id,competencia" },
    );
    if (error) {
      toast({ title: "Erro ao marcar nota", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Nota marcada como emitida" });
    load();
  };

  const desfazer = async (g: Group) => {
    const inv = invoiceByPatient.get(g.id);
    if (!inv) return;
    const { error } = await (supabase as any).from("invoices").delete().eq("id", inv.id);
    if (error) {
      toast({ title: "Erro ao desfazer", description: error.message, variant: "destructive" });
      return;
    }
    load();
  };

  if (loading) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  if (groups.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Nenhuma sessão realizada neste mês para pacientes com "Emite nota fiscal" marcado. Marque a opção no cadastro do paciente.
      </Card>
    );
  }

  const renderCard = (g: Group) => {
    const inv = invoiceByPatient.get(g.id);
    const semValor = g.sessions.some((s) => !s.price);
    return (
      <Card key={g.id} className={`p-4 space-y-3 ${inv ? "opacity-70" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{g.name}</p>
            <p className="text-sm text-muted-foreground">
              {g.sessions.length} {g.sessions.length === 1 ? "sessão" : "sessões"} · {brl(g.total)}
            </p>
          </div>
          {inv ? (
            <Badge variant="secondary">Emitida{inv.numero_nota ? ` · nº ${inv.numero_nota}` : ""}</Badge>
          ) : (
            <Badge>Pendente</Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {g.cpf ? (
            <>
              <span className="text-sm">CPF: <span className="font-mono">{g.cpf}</span></span>
              <Button size="sm" variant="outline" onClick={() => copy(g.cpf!, "CPF")}>
                <Copy className="h-3.5 w-3.5 mr-1" /> Copiar CPF
              </Button>
            </>
          ) : (
            <span className="flex items-center gap-1 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" /> Sem CPF no cadastro
            </span>
          )}
        </div>

        {semValor && (
          <p className="flex items-center gap-1 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" /> Sessão sem valor. Ajuste o valor padrão do paciente.
          </p>
        )}

        <div className="rounded-md bg-muted p-3 text-sm">{g.descricao}</div>
        <Button size="sm" variant="outline" onClick={() => copy(g.descricao, "Descrição")}>
          <Copy className="h-3.5 w-3.5 mr-1" /> Copiar descrição
        </Button>

        {inv ? (
          <Button size="sm" variant="ghost" onClick={() => desfazer(g)}>
            <Undo2 className="h-3.5 w-3.5 mr-1" /> Desfazer emissão
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="max-w-[180px]"
              placeholder="Nº da nota (opcional)"
              value={numeros[g.id] ?? ""}
              onChange={(e) => setNumeros((n) => ({ ...n, [g.id]: e.target.value }))}
            />
            <Button size="sm" onClick={() => marcarEmitida(g)}>
              <Check className="h-3.5 w-3.5 mr-1" /> Marcar como emitida
            </Button>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {pendentes.length} pendente{pendentes.length === 1 ? "" : "s"} · {emitidas.length} emitida{emitidas.length === 1 ? "" : "s"}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {pendentes.map(renderCard)}
        {emitidas.map(renderCard)}
      </div>
    </div>
  );
};