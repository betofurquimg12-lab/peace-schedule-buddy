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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatBRL, formatDateBR, buildWaUrl } from "@/lib/format";
import { ChevronLeft, ChevronRight, Check, MessageCircle, Plus, Trash2, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { PaginationControls, paginate } from "@/components/PaginationControls";

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

  // Pagination per tab
  const [pageSize, setPageSize] = useState(10);
  const [pages, setPages] = useState({ receivable: 1, receivable_month: 1, vittude: 1, entries: 1, patients: 1, general: 1 });
  const setPage = (k: keyof typeof pages, p: number) => setPages((s) => ({ ...s, [k]: p }));

  // Delete confirmation dialogs
  const [confirmDeletePay, setConfirmDeletePay] = useState<{ id: string } | null>(null);
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState<{ id: string } | null>(null);

  const range = useMemo(() => {
    const start = new Date(month);
    const end = new Date(month); end.setMonth(end.getMonth() + 1);
    return { start, end };
  }, [month]);

  const load = async () => {
    const [a, e, upcoming, allPending, vit] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, starts_at, price, status, source, is_block, is_vittude, external_summary, patient:patients(id, full_name, phone), payment:payments(id, amount, paid_at, due_date, method, notes)")
        .gte("starts_at", range.start.toISOString())
        .lt("starts_at", range.end.toISOString())
        .eq("is_block", false)
        .order("starts_at", { ascending: false }),
      supabase
        .from("finance_entries")
        .select("id, type, description, amount, entry_date, method, notes")
        .gte("entry_date", range.start.toISOString().slice(0, 10))
        .lt("entry_date", range.end.toISOString().slice(0, 10))
        .order("entry_date", { ascending: false }),
      supabase
        .from("payments")
        .select("id, amount, due_date, method, notes, appointment:appointments(id, starts_at, patient:patients(id, full_name))")
        .is("paid_at", null)
        .not("due_date", "is", null)
        .order("due_date", { ascending: true }),
      // A receber (global, sem filtro de mês): appointments não-bloqueio, não-vittude, não-cancelados, sem pagamento ou não pagos
      supabase
        .from("appointments")
        .select("id, starts_at, price, status, source, is_vittude, external_summary, patient:patients(id, full_name, phone), payment:payments(id, amount, paid_at, due_date, method, notes)")
        .eq("is_block", false)
        .eq("is_vittude", false)
        .not("status", "in", "(canceled,no_show)")
        .order("starts_at", { ascending: true }),
      // Vittude (global)
      supabase
        .from("appointments")
        .select("id, starts_at, status, external_summary, patient:patients(id, full_name)")
        .eq("is_vittude", true)
        .order("starts_at", { ascending: false }),
    ]);
    const normalize = (rows: any[]) => rows.map((row: any) => ({
      ...row,
      payment: Array.isArray(row.payment) ? row.payment : row.payment ? [row.payment] : [],
    }));
    setAppts(normalize(a.data ?? []));
    setEntries(e.data ?? []);
    setUpcomingPayments(upcoming.data ?? []);
    const pendingOnly = normalize(allPending.data ?? []).filter(
      (r: any) => !r.payment[0] || !r.payment[0].paid_at,
    );
    setAReceberAll(pendingOnly);
    setVittudeAll(vit.data ?? []);
  };
  useEffect(() => { void load(); }, [month]);

  // Sessões consideradas para o financeiro: todas as não canceladas (realizadas, agendadas, etc.) e não vittude (vai pra aba própria)
  const billable = appts.filter((a) => a.status !== "canceled" && a.status !== "no_show" && !a.is_vittude);
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

  const removePay = (paymentId: string) => setConfirmDeletePay({ id: paymentId });
  const doRemovePay = async () => {
    if (!confirmDeletePay) return;
    const { error } = await supabase.from("payments").delete().eq("id", confirmDeletePay.id);
    setConfirmDeletePay(null);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Lançamento financeiro excluído" });
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

  const removeEntry = (id: string) => setConfirmDeleteEntry({ id });
  const doRemoveEntry = async () => {
    if (!confirmDeleteEntry) return;
    const { error } = await supabase.from("finance_entries").delete().eq("id", confirmDeleteEntry.id);
    setConfirmDeleteEntry(null);
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

      <Tabs defaultValue="receivable">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="receivable">A receber</TabsTrigger>
          <TabsTrigger value="receivable_month">A receber (Mês)</TabsTrigger>
          <TabsTrigger value="vittude">Vittude</TabsTrigger>
          <TabsTrigger value="entries">Lançamentos</TabsTrigger>
          <TabsTrigger value="patients">Por paciente</TabsTrigger>
          <TabsTrigger value="general">Geral</TabsTrigger>
        </TabsList>

        <TabsContent value="receivable" className="mt-4">
          <Card className="divide-y">
            {aReceberAll.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">Nenhum valor a receber.</div>
            )}
            {paginate(aReceberAll, pages.receivable, pageSize).map((a) => (
              <ReceivableRow key={a.id} a={a} openPay={openPay} openReceiptDialog={openReceiptDialog} removePay={removePay} />
            ))}
            {aReceberAll.length > 0 && (
              <PaginationControls page={pages.receivable} pageSize={pageSize} total={aReceberAll.length}
                onPageChange={(p) => setPage("receivable", p)} onPageSizeChange={setPageSize} />
            )}
          </Card>
        </TabsContent>

        <TabsContent value="receivable_month" className="mt-4 space-y-4">
          {(() => {
            const groups = new Map<string, any[]>();
            aReceberAll.forEach((a) => {
              const key = a.starts_at ? a.starts_at.slice(0, 7) : "sem-previsao";
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(a);
            });
            const sorted = Array.from(groups.entries()).sort(([k1], [k2]) => {
              if (k1 === "sem-previsao") return 1;
              if (k2 === "sem-previsao") return -1;
              return k1.localeCompare(k2);
            });
            if (sorted.length === 0) return <Card className="p-6 text-sm text-muted-foreground text-center">Nenhum valor a receber.</Card>;
            // Flatten groups with headers for pagination
            type Row = { kind: "header"; key: string; label: string; subtotal: number } | { kind: "item"; key: string; a: any };
            const flat: Row[] = [];
            sorted.forEach(([key, items]) => {
              const subtotal = items.reduce((s, a) => s + Number(a.price || 0), 0);
              const label = key === "sem-previsao"
                ? "Sem Previsão"
                : new Date(key + "-01T00:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
              flat.push({ kind: "header", key: `h-${key}`, label, subtotal });
              items.forEach((a) => flat.push({ kind: "item", key: a.id, a }));
            });
            const paged = paginate(flat, pages.receivable_month, pageSize);
            return (
              <>
                <Card className="divide-y">
                  {paged.map((r) => r.kind === "header" ? (
                    <div key={r.key} className="p-3 flex items-center justify-between bg-muted/30">
                      <div className="text-sm font-semibold capitalize">{r.label}</div>
                      <div className="text-sm font-semibold text-warning">{formatBRL(r.subtotal)}</div>
                    </div>
                  ) : (
                    <ReceivableRow key={r.key} a={r.a} openPay={openPay} openReceiptDialog={openReceiptDialog} removePay={removePay} />
                  ))}
                  <PaginationControls page={pages.receivable_month} pageSize={pageSize} total={flat.length}
                    onPageChange={(p) => setPage("receivable_month", p)} onPageSizeChange={setPageSize} />
                </Card>
              </>
            );
          })()}
        </TabsContent>

        <TabsContent value="vittude" className="mt-4">
          <Card className="divide-y">
            {vittudeAll.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">Nenhum atendimento Vittude.</div>
            )}
            {paginate(vittudeAll, pages.vittude, pageSize).map((a) => (
              <div key={a.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate flex items-center gap-2">
                    <span className="truncate">{a.patient?.full_name ?? a.external_summary ?? "Sem título"}</span>
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal shrink-0">Vittude</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{a.starts_at ? formatDateBR(a.starts_at) : "—"}</div>
                </div>
                <Badge variant="secondary" className="capitalize">{statusLabel(a.status)}</Badge>
              </div>
            ))}
            {vittudeAll.length > 0 && (
              <PaginationControls page={pages.vittude} pageSize={pageSize} total={vittudeAll.length}
                onPageChange={(p) => setPage("vittude", p)} onPageSizeChange={setPageSize} />
            )}
          </Card>
        </TabsContent>

        <TabsContent value="entries" className="mt-4">
          <Card className="divide-y">
            {entries.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">
                Nenhum lançamento manual no mês. Use os botões "Crédito" ou "Débito" acima.
              </div>
            )}
            {paginate(entries, pages.entries, pageSize).map((e) => (
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
            {entries.length > 0 && (
              <PaginationControls page={pages.entries} pageSize={pageSize} total={entries.length}
                onPageChange={(p) => setPage("entries", p)} onPageSizeChange={setPageSize} />
            )}
          </Card>
        </TabsContent>

        <TabsContent value="patients" className="mt-4">
          <Card className="divide-y">
            {byPatient.length === 0 && <div className="p-6 text-sm text-muted-foreground text-center">Sem dados no mês.</div>}
            {paginate(byPatient, pages.patients, pageSize).map((p) => (
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
            {byPatient.length > 0 && (
              <PaginationControls page={pages.patients} pageSize={pageSize} total={byPatient.length}
                onPageChange={(p) => setPage("patients", p)} onPageSizeChange={setPageSize} />
            )}
          </Card>
        </TabsContent>

        <TabsContent value="general" className="mt-4">
          <Card className="divide-y">
            {realized.length === 0 && <div className="p-6 text-sm text-muted-foreground text-center">Nenhuma sessão no mês.</div>}
            {paginate(realized, pages.general, pageSize).map((a) => {
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
                      <>
                        <Button size="sm" onClick={() => openReceiptDialog(pay)}>
                          <Check className="h-4 w-4" /> Recebi
                        </Button>
                        <Button variant="ghost" size="icon" title="Excluir lançamento financeiro" onClick={() => removePay(pay.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
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
            {realized.length > 0 && (
              <PaginationControls page={pages.general} pageSize={pageSize} total={realized.length}
                onPageChange={(p) => setPage("general", p)} onPageSizeChange={setPageSize} />
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* AlertDialog: confirmar exclusão de lançamento financeiro (payment) */}
      <AlertDialog open={!!confirmDeletePay} onOpenChange={(o) => !o && setConfirmDeletePay(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento financeiro?</AlertDialogTitle>
            <AlertDialogDescription>
              O pagamento vinculado a este agendamento será removido. O agendamento em si será mantido. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doRemovePay}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog: confirmar exclusão de lançamento manual */}
      <AlertDialog open={!!confirmDeleteEntry} onOpenChange={(o) => !o && setConfirmDeleteEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>O lançamento manual será removido. Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doRemoveEntry}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

const statusLabel = (s: string) =>
  ({ scheduled: "Agendada", done: "Realizada", canceled: "Cancelada", no_show: "Faltou" }[s] ?? s);

const ReceivableRow = ({ a, openPay, openReceiptDialog, removePay }: { a: any; openPay: (a: any) => void; openReceiptDialog: (p: any) => void; removePay: (paymentId: string) => void }) => {
  const pay = a.payment?.[0];
  const isScheduled = !!pay && !pay.paid_at && !!pay.due_date;
  return (
    <div className="p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="font-medium truncate flex items-center gap-2">
          <span className="truncate">{a.patient?.full_name ?? a.external_summary ?? "Sem título"}</span>
          {a.source === "google" && !a.patient && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal shrink-0">Google</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{a.starts_at ? formatDateBR(a.starts_at) : "Sem previsão"}</div>
        {isScheduled && (
          <div className="text-[11px] text-warning mt-0.5">
            Previsto para {formatDateBR(pay.due_date)} · {pay.method}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-sm font-medium">{formatBRL(Number(a.price))}</div>
          {isScheduled
            ? <Badge className="bg-warning/15 text-warning border-0">A receber</Badge>
            : <Badge variant="outline">Pendente</Badge>}
        </div>
        {isScheduled
          ? <Button size="sm" onClick={() => openReceiptDialog(pay)}><Check className="h-4 w-4" /> Recebi</Button>
          : <Button size="sm" onClick={() => openPay(a)}><Check className="h-4 w-4" /> Marcar pago</Button>}
        {pay && (
          <Button variant="ghost" size="icon" title="Excluir lançamento financeiro" onClick={() => removePay(pay.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default Financeiro;
