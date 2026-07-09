import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { MessageCircle } from "lucide-react";
import { formatBRL, formatDateBR, buildWaUrl } from "@/lib/format";
import { loadTemplate, renderTemplate } from "@/lib/messageTemplate";

interface Props {
  appts: any[];
  month: Date;
}

interface PatientGroup {
  id: string;
  name: string;
  phone: string | null;
  payment_link: string | null;
  sessions: any[];
}

export const FechamentoTab = ({ appts, month }: Props) => {
  // Pacientes elegíveis: não bloqueio, não cancelado/no_show, não Vittude, com paciente
  const groups: PatientGroup[] = useMemo(() => {
    const map = new Map<string, PatientGroup>();
    appts
      .filter(
        (a) =>
          !a.is_block &&
          !a.is_vittude &&
          a.status !== "canceled" &&
          a.status !== "no_show" &&
          a.patient?.id,
      )
      .forEach((a) => {
        const k = a.patient.id;
        const cur =
          map.get(k) ?? {
            id: k,
            name: a.patient.full_name,
            phone: a.patient.phone ?? null,
            payment_link: a.patient.payment_link ?? null,
            sessions: [] as any[],
          };
        cur.sessions.push(a);
        map.set(k, cur);
      });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [appts]);

  // Estado: por paciente, quais sessões estão marcadas; e se o paciente está incluído no fechamento
  const [selectedPatients, setSelectedPatients] = useState<Record<string, boolean>>({});
  const [selectedSessions, setSelectedSessions] = useState<Record<string, boolean>>({});
  const [charged, setCharged] = useState<Record<string, string>>({}); // patientId -> ISO datetime

  // Inicializa quando os grupos mudam (novo mês)
  useEffect(() => {
    const sel: Record<string, boolean> = {};
    const sess: Record<string, boolean> = {};
    groups.forEach((g) => {
      sel[g.id] = true;
      g.sessions.forEach((s) => {
        sess[s.id] = true;
      });
    });
    setSelectedPatients(sel);
    setSelectedSessions(sess);
    setCharged({});
  }, [month, groups.length]);

  const togglePatient = (id: string, checked: boolean) => {
    setSelectedPatients((s) => ({ ...s, [id]: checked }));
  };
  const toggleSession = (id: string, checked: boolean) => {
    setSelectedSessions((s) => ({ ...s, [id]: checked }));
  };
  const setAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    groups.forEach((g) => (next[g.id] = checked));
    setSelectedPatients(next);
  };

  const totalsByPatient = useMemo(() => {
    const out: Record<string, { count: number; total: number }> = {};
    groups.forEach((g) => {
      let count = 0;
      let total = 0;
      g.sessions.forEach((s) => {
        if (selectedSessions[s.id]) {
          count += 1;
          total += Number(s.price || 0);
        }
      });
      out[g.id] = { count, total };
    });
    return out;
  }, [groups, selectedSessions]);

  const summary = useMemo(() => {
    let selectedCount = 0;
    let totalValue = 0;
    groups.forEach((g) => {
      if (selectedPatients[g.id]) {
        selectedCount += 1;
        totalValue += totalsByPatient[g.id]?.total ?? 0;
      }
    });
    return {
      totalPatients: groups.length,
      selectedCount,
      totalValue,
    };
  }, [groups, selectedPatients, totalsByPatient]);

  const monthLabel = month.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const sendWhatsApp = async (g: PatientGroup) => {
    const sessions = g.sessions.filter((s) => selectedSessions[s.id]);
    if (sessions.length === 0) return;
    const total = sessions.reduce((s, x) => s + Number(x.price || 0), 0);
    const firstName = (g.name || "").split(" ")[0] ?? "";

    // Carrega o template configurado
    const tpl = await loadTemplate("wa_charge");
    const lines = sessions
      .sort(
        (a, b) =>
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      )
      .map(
        (s) =>
          `📅 ${formatDateBR(s.starts_at)} – ${formatBRL(Number(s.price || 0))}`,
      )
      .join("\n");

    // Mensagem de fechamento (formato consolidado)
    let body = `Oi, ${firstName}! Segue o resumo das sessões de ${monthLabel}:\n\n${lines}\n\nTotal: ${formatBRL(total)}`;

    // Se o template tiver instruções de PIX, anexa
    const tplRendered = renderTemplate(tpl.body, {
      primeiro_nome: firstName,
      valor: formatBRL(total),
    });
    const pixMatch = tplRendered.match(/PIX[\s\S]*$/i);
    if (pixMatch) {
      body += `\n\n${pixMatch[0]}`;
    }

    window.open(buildWaUrl(g.phone, body), "_blank", "noopener,noreferrer");
    setCharged((c) => ({ ...c, [g.id]: new Date().toISOString() }));
  };

  if (groups.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground text-center">
        Nenhum paciente com sessões no mês.
      </Card>
    );
  }

  const allSelected = groups.every((g) => selectedPatients[g.id]);

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Pacientes no mês</div>
          <div className="text-xl font-semibold">{summary.totalPatients}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Selecionados</div>
          <div className="text-xl font-semibold">{summary.selectedCount}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total do fechamento</div>
          <div className="text-xl font-semibold text-success">
            {formatBRL(summary.totalValue)}
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setAll(!allSelected)}>
          {allSelected ? "Desmarcar todos" : "Selecionar todos"}
        </Button>
      </div>

      <Card className="divide-y">
        <Accordion type="multiple" className="w-full">
          {groups.map((g) => {
            const totals = totalsByPatient[g.id] ?? { count: 0, total: 0 };
            const isSelected = !!selectedPatients[g.id];
            const chargedAt = charged[g.id];
            return (
              <AccordionItem
                key={g.id}
                value={g.id}
                className="border-b last:border-b-0"
              >
                <div className="flex items-center gap-3 px-4">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(c) => togglePatient(g.id, !!c)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Selecionar ${g.name}`}
                  />
                  <AccordionTrigger className="flex-1 py-3 hover:no-underline">
                    <div className="flex-1 flex items-center justify-between gap-3 pr-2">
                      <div className="text-left min-w-0">
                        <div className="font-medium truncate">{g.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {totals.count} sess{totals.count === 1 ? "ão" : "ões"} ·{" "}
                          {formatBRL(totals.total)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {chargedAt ? (
                          <Badge className="bg-success/15 text-success border-0">
                            Cobrado
                          </Badge>
                        ) : (
                          <Badge variant="outline">Pendente</Badge>
                        )}
                      </div>
                    </div>
                  </AccordionTrigger>
                  {isSelected && g.phone && totals.count > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Enviar fechamento via WhatsApp"
                      onClick={(e) => {
                        e.stopPropagation();
                        void sendWhatsApp(g);
                      }}
                    >
                      <MessageCircle className="h-4 w-4 text-success" />
                    </Button>
                  )}
                </div>
                <AccordionContent className="px-4">
                  <div className="divide-y border rounded-md">
                    {g.sessions
                      .slice()
                      .sort(
                        (a, b) =>
                          new Date(a.starts_at).getTime() -
                          new Date(b.starts_at).getTime(),
                      )
                      .map((s) => {
                        const pay = s.payment?.[0];
                        const isPaid = !!pay?.paid_at;
                        const isReceivable = !!pay && !pay.paid_at && !!pay.due_date;
                        return (
                          <div
                            key={s.id}
                            className="flex items-center gap-3 p-3"
                          >
                            <Checkbox
                              checked={!!selectedSessions[s.id]}
                              onCheckedChange={(c) =>
                                toggleSession(s.id, !!c)
                              }
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm">
                                {formatDateBR(s.starts_at)}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                {s.status === "done" ? (
                                  <Badge className="bg-success/15 text-success border-0">
                                    Realizada
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">Agendada</Badge>
                                )}
                                {isPaid && (
                                  <Badge className="bg-success/15 text-success border-0">
                                    Pago
                                  </Badge>
                                )}
                                {isReceivable && (
                                  <Badge className="bg-warning/15 text-warning border-0">
                                    A receber
                                  </Badge>
                                )}
                                {!pay && (
                                  <Badge variant="outline">Pendente</Badge>
                                )}
                              </div>
                            </div>
                            <div className="text-sm font-medium">
                              {formatBRL(Number(s.price || 0))}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  {chargedAt && (
                    <div className="text-[11px] text-muted-foreground mt-2">
                      Cobrança enviada em{" "}
                      {new Date(chargedAt).toLocaleString("pt-BR")}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </Card>
    </div>
  );
};
