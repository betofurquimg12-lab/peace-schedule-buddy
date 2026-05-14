import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDateTimeBR } from "@/lib/format";
import { Calendar, Users, Wallet, Plus } from "lucide-react";

const Dashboard = () => {
  const [stats, setStats] = useState({ today: 0, monthRevenue: 0, monthPending: 0, sessions: 0 });
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [nextToday, setNextToday] = useState<any>(null);
  const [todayBlocks, setTodayBlocks] = useState<any[]>([]);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    const [{ data: up }, { data: monthAppts }, { data: payments }, { data: todayAppts }] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, starts_at, status, price, source, external_summary, patient:patients(full_name)")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at")
        .limit(5),
      supabase
        .from("appointments")
        .select("id, price, status")
        .gte("starts_at", start)
        .lt("starts_at", end),
      supabase.from("payments").select("amount, paid_at").gte("paid_at", start.slice(0, 10)).lt("paid_at", end.slice(0, 10)),
      supabase.from("appointments").select("id").gte("starts_at", todayStart).lt("starts_at", todayEnd),
    ]);

    const realized = (monthAppts ?? []).filter((a) => a.status === "done");
    const totalDone = realized.reduce((s, a) => s + Number(a.price || 0), 0);
    const received = (payments ?? []).reduce((s, p) => s + Number(p.amount || 0), 0);
    const pendingValue = Math.max(0, totalDone - received);

    setStats({
      today: todayAppts?.length ?? 0,
      monthRevenue: received,
      monthPending: pendingValue,
      sessions: realized.length,
    });
    setUpcoming(up ?? []);

    // Pending list: done sessions w/o payment
    const { data: doneAppts } = await supabase
      .from("appointments")
      .select("id, starts_at, price, patient:patients(full_name, phone)")
      .eq("status", "done")
      .order("starts_at", { ascending: false })
      .limit(20);
    const ids = (doneAppts ?? []).map((a) => a.id);
    if (ids.length) {
      const { data: pays } = await supabase.from("payments").select("appointment_id").in("appointment_id", ids);
      const paidSet = new Set((pays ?? []).map((p) => p.appointment_id));
      setPending((doneAppts ?? []).filter((a) => !paidSet.has(a.id)).slice(0, 5));
    }
  };

  return (
    <>
      <PageHeader
        title="Início"
        description="Visão geral dos seus atendimentos"
        action={
          <Button asChild>
            <Link to="/agenda"><Plus className="h-4 w-4" /> Nova consulta</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard icon={Calendar} label="Consultas hoje" value={stats.today.toString()} />
        <StatCard icon={Users} label="Sessões realizadas no mês" value={stats.sessions.toString()} />
        <StatCard icon={Wallet} label="Recebido no mês" value={formatBRL(stats.monthRevenue)} tone="success" />
        <StatCard icon={Wallet} label="A receber" value={formatBRL(stats.monthPending)} tone="warning" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg">Próximos atendimentos</h2>
            <Link to="/agenda" className="text-sm text-primary hover:underline">Ver agenda</Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum agendamento próximo.</p>
          ) : (
            <ul className="space-y-3">
              {upcoming.map((a) => (
                <li key={a.id} className="flex items-center justify-between border-b last:border-0 pb-3 last:pb-0">
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="font-medium truncate flex items-center gap-2">
                      <span className="truncate">{a.patient?.full_name ?? a.external_summary ?? "Sem título"}</span>
                      {a.source === "google" && !a.patient && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal shrink-0">Google</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{formatDateTimeBR(a.starts_at)}</div>
                  </div>
                  <Badge variant="secondary">{formatBRL(Number(a.price))}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg">Pagamentos pendentes</h2>
            <Link to="/financeiro" className="text-sm text-primary hover:underline">Financeiro</Link>
          </div>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tudo em dia 🎉</p>
          ) : (
            <ul className="space-y-3">
              {pending.map((a) => (
                <li key={a.id} className="flex items-center justify-between border-b last:border-0 pb-3 last:pb-0">
                  <div>
                    <div className="font-medium">{a.patient?.full_name}</div>
                    <div className="text-xs text-muted-foreground">{formatDateTimeBR(a.starts_at)}</div>
                  </div>
                  <Badge className="bg-warning text-warning-foreground hover:bg-warning">{formatBRL(Number(a.price))}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
};

const StatCard = ({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone?: "success" | "warning" }) => (
  <Card className="p-4">
    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
      <Icon className="h-3.5 w-3.5" /> {label}
    </div>
    <div className={`text-xl font-semibold ${tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : ""}`}>{value}</div>
  </Card>
);

export default Dashboard;
