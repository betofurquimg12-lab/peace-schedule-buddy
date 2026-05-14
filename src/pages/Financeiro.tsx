import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatBRL, formatDateBR, buildWaUrl } from "@/lib/format";
import { ChevronLeft, ChevronRight, Check, MessageCircle, Plus, Trash2, ArrowUpCircle, ArrowDownCircle } from "lucide-react";

const Financeiro = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; });
  const [appts, setAppts] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [upcomingPayments, setUpcomingPayments] = useState<any[]>([]);
  const [aReceberAll, setAReceberAll] = useState<any[]>([]);
  const [vittudeAll, setVittudeAll] = useState<any[]>([]);
  const [payDialog, setPayDialog] = useState<any>(null);
  const [payForm, setPayForm] = useState({ amount: 0, paid_at: new Date().toISOString().slice(0,10), method: "pix" });
  const [receiptDialog, setReceiptDialog] = useState<any>(null);
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0,10));

  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [entryForm, setEntryForm] = useState<any>({
    type: "credit",
    description: "",
    amount: 0,
    entry_date: new Date().toISOString().slice(0,10),
    method: "pix",
    notes: "",
  });

  const range = useMemo(() => {
    const start = new Date(month);
    const end = new Date(month); end.setMonth(end.getMonth() + 1);
    return { start, end };
  }, [month]);

  const load = async () => {
    const [a, e, upcoming] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, starts_at, price, status, source, external_summary, patient:patients(id, full_name, phone), payment:payments(id, amount, paid_at, due_date, method, notes)")
        .gte("starts_at", range.start.toISOString())
        .lt("starts_at", range.end.toISOString())
        .order("starts_at", { ascending: false }),
      supabase
        .from("finance_entries")
        .select("id, type, description, amount, entry_date, method, notes")
        .gte("entry_date", range.start.toISOString().slice(0, 10))
        .lt("entry_date", range.end.toISOString().slice(0, 10))
        .order("entry_date", { ascending: false }),
      // Upcoming receipts (regardless of month) – payments with due_date in the future and not yet paid
      supabase
        .from("payments")
        .select("id, amount, due_date, method, notes, appointment:appointments(id, starts_at, patient:patients(id, full_name))")
        .is("paid_at", null)
        .not("due_date", "is", null)
        .order("due_date", { ascending: true }),
    ]);
    const normalized = (a.data ?? []).map((row: any) => ({
      ...row,
      payment: Array.isArray(row.payment) ? row.payment : row.payment ? [row.payment] : [],
    }));
    setAppts(normalized);
    setEntries(e.data ?? []);
    setUpcomingPayments(upcoming.data ?? []);
  };
  useEffect(() => { void load(); }, [month]);

  // Sessões consideradas para o financeiro: todas as não canceladas (realizadas, agendadas, etc.)
  const billable = appts.filter((a) => a.status !== "canceled" && a.status !== "no_show");
  const realized = billable; // mantém nome usado abaixo
  const totalDone = billable.reduce((s, a) => s + Number(a.price || 0), 0);
  // Recebido = pagamentos com paid_at preenchido (independe do status da sessão)
  const totalReceived = billable.reduce(
    (s, a) => s + (a.payment?.[0]?.paid_at ? Number(a.payment[0].amount) : 0),
    0,
  );
  // Previsto no mês = pagamentos sem paid_at mas com due_date
  const totalScheduled = billable.reduce(
    (s, a) => s + (a.payment?.[0] && !a.payment[0].paid_at && a.payment[0].due_date ? Number(a.payment[0].amount) : 0),
    0,
  );
  const totalPending = Math.max(0, totalDone - totalReceived - totalScheduled);

  const extraCredits = entries.filter((e) => e.type === "credit").reduce((s, e) => s + Number(e.amount), 0);
  const extraDebits = entries.filter((e) => e.type === "debit").reduce((s, e) => s + Number(e.amount), 0);
  // Caixa = só o que efetivamente entrou (recebido) menos débitos do mês
  const netResult = totalReceived + extraCredits - extraDebits;

  const byPatient = useMemo(() => {
    const map = new Map<string, { name: string; phone: string | null; sessions: number; total: number; paid: number; scheduled: number }>();
    realized.forEach((a) => {
      const k = a.patient?.id;
      if (!k) return;
      const cur = map.get(k) ?? { name: a.patient.full_name, phone: a.patient.phone, sessions: 0, total: 0, paid: 0, scheduled: 0 };
      cur.sessions += 1;
      cur.total += Number(a.price || 0);
      const p = a.payment?.[0];
      if (p?.paid_at) cur.paid += Number(p.amount);
      else if (p?.due_date) cur.scheduled += Number(p.amount);
      map.set(k, cur);
    });
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v, balance: v.total - v.paid - v.scheduled }));
  }, [realized]);

  const openPay = (a: any) => {
    setPayDialog(a);
    setPayForm({ amount: Number(a.price), paid_at: new Date().toISOString().slice(0,10), method: "pix" });
  };

  const confirmPay = async () => {
    if (!payDialog) return;
    const existing = payDialog.payment?.[0];
    const payload: any = {
      appointment_id: payDialog.id,
      amount: payForm.amount,
      paid_at: payForm.paid_at,
      due_date: null,
      method: payForm.method as any,
      created_by: user?.id,
    };
    const { error } = existing
      ? await supabase.from("payments").update(payload).eq("id", existing.id)
      : await supabase.from("payments").insert(payload);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Pagamento registrado" });
    setPayDialog(null);
    void load();
  };

  const openReceiptDialog = (p: any) => {
    setReceiptDialog(p);
    setReceiptDate(p.due_date ?? new Date().toISOString().slice(0, 10));
  };

  const confirmReceiptUpcoming = async () => {
    if (!receiptDialog) return;
    const { error } = await supabase
      .from("payments")
      .update({ paid_at: receiptDate, due_date: null })
      .eq("id", receiptDialog.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Recebimento confirmado" });
    setReceiptDialog(null);
    void load();
  };

  const removePay = async (paymentId: string) => {
    if (!confirm("Remover este pagamento?")) return;
    const { error } = await supabase.from("payments").delete().eq("id", paymentId);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    void load();
  };

  const openNewEntry = (type: "credit" | "debit") => {
    setEntryForm({
      type,
      description: "",
      amount: 0,
      entry_date: new Date().toISOString().slice(0,10),
      method: "pix",
      notes: "",
    });
    setEntryDialogOpen(true);
  };

  const submitEntry = async () => {
    if (!entryForm.description.trim()) {
      return toast({ title: "Descrição obrigatória", variant: "destructive" });
    }
    if (Number(entryForm.amount) <= 0) {
      return toast({ title: "Informe um valor maior que zero", variant: "destructive" });
    }
    const { error } = await supabase.from("finance_entries").insert({
      type: entryForm.type,
      description: entryForm.description.trim(),
      amount: Number(entryForm.amount),
      entry_date: entryForm.entry_date,
      method: entryForm.method,
      notes: entryForm.notes?.trim() || null,
      created_by: user?.id,
    });
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Lançamento registrado" });
    setEntryDialogOpen(false);
    void load();
  };

  const removeEntry = async (id: string) => {
    if (!confirm("Excluir este lançamento?")) return;
    const { error } = await supabase.from("finance_entries").delete().eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    void load();
  };

  const moveMonth = (d: number) => {
    const m = new Date(month); m.setMonth(m.getMonth() + d); setMonth(m);
  };

  return (
    <>
      <PageHeader title="Financeiro" description="Pagamentos das sessões e lançamentos manuais" />

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => moveMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => moveMonth(1)}><ChevronRight className="h-4 w-4" /></Button>
          <div className="text-sm font-medium ml-2 capitalize">
            {month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => openNewEntry("credit")}>
            <ArrowUpCircle className="h-4 w-4 text-success" /> Crédito
          </Button>
          <Button variant="outline" size="sm" onClick={() => openNewEntry("debit")}>
            <ArrowDownCircle className="h-4 w-4 text-destructive" /> Débito
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Stat label="Faturamento sessões" value={formatBRL(totalDone)} />

        <Stat label="Recebido" value={formatBRL(totalReceived)} tone="success" />
        <Stat label="Previsto a receber" value={formatBRL(totalScheduled)} tone="warning" />
        <Stat label="Sem definição" value={formatBRL(totalPending)} tone="warning" />
        <Stat label="Caixa (recebido)" value={formatBRL(netResult)} tone={netResult >= 0 ? "success" : "warning"} />
      </div>

      {(extraCredits > 0 || extraDebits > 0) && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Stat label="Outros créditos" value={formatBRL(extraCredits)} tone="success" />
          <Stat label="Outros débitos" value={formatBRL(extraDebits)} tone="warning" />
        </div>
      )}

      <Tabs defaultValue="sessions">
        <TabsList>
          <TabsTrigger value="sessions">Sessões</TabsTrigger>
          <TabsTrigger value="upcoming">A receber</TabsTrigger>
          <TabsTrigger value="entries">Lançamentos</TabsTrigger>
          <TabsTrigger value="patients">Por paciente</TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="mt-4">
          <Card className="divide-y">
            {realized.length === 0 && <div className="p-6 text-sm text-muted-foreground text-center">Nenhuma sessão realizada no mês.</div>}
            {realized.map((a) => {
              const pay = a.payment?.[0];
              const isPaid = !!pay?.paid_at;
              const isScheduled = !!pay && !pay.paid_at && !!pay.due_date;
              return (
                <div key={a.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">
                      <span className="truncate">{a.patient?.full_name ?? a.external_summary ?? "Sem título"}</span>
                      {a.source === "google" && !a.patient && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal shrink-0">Google</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{formatDateBR(a.starts_at)}</div>
                    {isPaid && (
                      <div className="text-[11px] text-success mt-0.5">
                        Pago em {formatDateBR(pay.paid_at)} · {pay.method}
                      </div>
                    )}
                    {isScheduled && (
                      <div className="text-[11px] text-warning mt-0.5">
                        Previsto para {formatDateBR(pay.due_date)} · {pay.method}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-medium">{formatBRL(Number(a.price))}</div>
                      {isPaid && <Badge className="bg-success/15 text-success border-0">Pago</Badge>}
                      {isScheduled && <Badge className="bg-warning/15 text-warning border-0">A receber</Badge>}
                      {!pay && <Badge variant="outline">Pendente</Badge>}
                    </div>
                    {isPaid ? (
                      <Button variant="ghost" size="sm" onClick={() => removePay(pay.id)}>Estornar</Button>
                    ) : isScheduled ? (
                      <Button size="sm" onClick={() => openReceiptDialog(pay)}>
                        <Check className="h-4 w-4" /> Recebi
                      </Button>
                    ) : (
                      <>
                        {a.patient?.phone && (
                          <Button asChild variant="ghost" size="icon" title="Cobrar via WhatsApp">
                            <a href={buildWaUrl(a.patient.phone, `Olá ${a.patient.full_name}, tudo bem? Passando para confirmar o pagamento da sessão de ${formatDateBR(a.starts_at)} no valor de ${formatBRL(Number(a.price))}. Obrigada!`)} target="_blank" rel="noopener noreferrer">
                              <MessageCircle className="h-4 w-4 text-success" />
                            </a>
                          </Button>
                        )}
                        <Button size="sm" onClick={() => openPay(a)}><Check className="h-4 w-4" /> Marcar pago</Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        </TabsContent>

        <TabsContent value="upcoming" className="mt-4">
          <Card className="divide-y">
            {upcomingPayments.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">Nenhum recebimento previsto.</div>
            )}
            {upcomingPayments.map((p) => (
              <div key={p.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{p.appointment?.patient?.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    Sessão de {p.appointment?.starts_at ? formatDateBR(p.appointment.starts_at) : "—"} · Previsto em {formatDateBR(p.due_date)} · {p.method}
                  </div>
                  {p.notes && <div className="text-[11px] text-muted-foreground mt-0.5">{p.notes}</div>}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm font-semibold text-warning">{formatBRL(Number(p.amount))}</div>
                  <Button size="sm" onClick={() => openReceiptDialog(p)}>
                    <Check className="h-4 w-4" /> Recebi
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        </TabsContent>

        <TabsContent value="entries" className="mt-4">
          <Card className="divide-y">
            {entries.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">
                Nenhum lançamento manual no mês. Use os botões "Crédito" ou "Débito" acima.
              </div>
            )}
            {entries.map((e) => (
              <div key={e.id} className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {e.type === "credit"
                    ? <ArrowUpCircle className="h-5 w-5 text-success shrink-0" />
                    : <ArrowDownCircle className="h-5 w-5 text-destructive shrink-0" />}
                  <div className="min-w-0">
                    <div className="font-medium truncate">{e.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateBR(e.entry_date)} · {e.method ?? "—"}
                      {e.notes ? ` · ${e.notes}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`text-sm font-semibold ${e.type === "credit" ? "text-success" : "text-destructive"}`}>
                    {e.type === "credit" ? "+" : "−"} {formatBRL(Number(e.amount))}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeEntry(e.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        </TabsContent>

        <TabsContent value="patients" className="mt-4">
          <Card className="divide-y">
            {byPatient.length === 0 && <div className="p-6 text-sm text-muted-foreground text-center">Sem dados no mês.</div>}
            {byPatient.map((p) => (
              <div key={p.id} className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.sessions} sessões · Total {formatBRL(p.total)}</div>
                </div>
                <div className="text-right space-y-0.5">
                  <div className="text-sm">Pago: <span className="text-success">{formatBRL(p.paid)}</span></div>
                  <div className="text-sm">A receber: <span className="text-warning">{formatBRL(p.scheduled)}</span></div>
                  <div className="text-sm">Em aberto: <span className={p.balance > 0 ? "text-warning" : ""}>{formatBRL(p.balance)}</span></div>
                </div>
              </div>
            ))}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: registrar pagamento */}
      <Dialog open={!!payDialog} onOpenChange={(o) => !o && setPayDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar pagamento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">{payDialog?.patient?.full_name} · {payDialog && formatDateBR(payDialog.starts_at)}</div>
            <div className="space-y-1.5">
              <Label className="text-xs">Valor (R$)</Label>
              <Input type="number" step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Data</Label>
                <Input type="date" value={payForm.paid_at} onChange={(e) => setPayForm({ ...payForm, paid_at: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Forma</Label>
                <Select value={payForm.method} onValueChange={(v) => setPayForm({ ...payForm, method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">Pix</SelectItem>
                    <SelectItem value="cash">Dinheiro</SelectItem>
                    <SelectItem value="card">Cartão</SelectItem>
                    <SelectItem value="transfer">Transferência</SelectItem>
                    <SelectItem value="other">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog(null)}>Cancelar</Button>
            <Button onClick={confirmPay}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: novo lançamento manual */}
      <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Novo {entryForm.type === "credit" ? "crédito" : "débito"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição *</Label>
              <Input
                value={entryForm.description}
                onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })}
                placeholder={entryForm.type === "credit" ? "Ex: Reembolso, venda de material" : "Ex: Aluguel da sala, material"}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor (R$) *</Label>
                <Input type="number" step="0.01" value={entryForm.amount} onChange={(e) => setEntryForm({ ...entryForm, amount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data</Label>
                <Input type="date" value={entryForm.entry_date} onChange={(e) => setEntryForm({ ...entryForm, entry_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Forma</Label>
              <Select value={entryForm.method} onValueChange={(v) => setEntryForm({ ...entryForm, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">Pix</SelectItem>
                  <SelectItem value="cash">Dinheiro</SelectItem>
                  <SelectItem value="card">Cartão</SelectItem>
                  <SelectItem value="transfer">Transferência</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Observações</Label>
              <Textarea rows={2} value={entryForm.notes} onChange={(e) => setEntryForm({ ...entryForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntryDialogOpen(false)}>Cancelar</Button>
            <Button onClick={submitEntry}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Dialog: confirmar recebimento (escolher data) */}
      <Dialog open={!!receiptDialog} onOpenChange={(o) => !o && setReceiptDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar recebimento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {receiptDialog?.appointment?.patient?.full_name ?? receiptDialog?.patient?.full_name} ·{" "}
              {formatBRL(Number(receiptDialog?.amount ?? receiptDialog?.price ?? 0))}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data do recebimento</Label>
              <Input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiptDialog(null)}>Cancelar</Button>
            <Button onClick={confirmReceiptUpcoming}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const Stat = ({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" }) => (
  <Card className="p-4">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={`text-xl font-semibold ${tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : ""}`}>{value}</div>
  </Card>
);

export default Financeiro;
