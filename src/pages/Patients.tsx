import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Search, MessageCircle, Pencil } from "lucide-react";
import { formatBRL, buildWaUrl } from "@/lib/format";
import { PatientFormDialog } from "@/components/patients/PatientFormDialog";
import { PaymentLinkExpiryBadge } from "@/components/patients/PaymentLinkExpiryBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const localExpiryDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const Patients = () => {
  const [list, setList] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [searchParams] = useSearchParams();
  const linkParam = searchParams.get("link");
  const [linkFilter, setLinkFilter] = useState(() => linkParam === "vencendo" ? "vencendo" : "all");
  useEffect(() => {
    if (linkParam === "vencendo") setLinkFilter("vencendo");
  }, [linkParam]);

  const load = async () => {
    const { data } = await supabase
      .from("patients")
      .select("id, full_name, phone, email, default_session_price, active, payment_link, payment_link_expires_at")
      .order("full_name");
    setList(data ?? []);
  };
  useEffect(() => { void load(); }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const filtered = list.filter((p) => {
    const matchesText = p.full_name.toLowerCase().includes(q.toLowerCase()) ||
      (p.phone ?? "").includes(q) ||
      (p.email ?? "").toLowerCase().includes(q.toLowerCase());
    const hasLink = !!p.payment_link?.trim();
    const expiryDays = p.payment_link_expires_at
      ? Math.ceil((localExpiryDate(p.payment_link_expires_at).getTime() - today.getTime()) / 86_400_000)
      : Infinity;
    const matchesLink = linkFilter === "all" ||
      (linkFilter === "with" && hasLink) ||
      (linkFilter === "without" && !hasLink) ||
      (linkFilter === "vencendo" && hasLink && expiryDays <= 7);
    return matchesText && matchesLink;
  });

  const openEdit = async (id: string) => {
    const { data, error } = await supabase.from("patients").select("*").eq("id", id).maybeSingle();
    if (error || !data) return;
    setEditing(data);
  };

  return (
    <>
      <PageHeader
        title="Pacientes"
        description="Cadastro e ficha clínica"
        action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Novo paciente</Button>}
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por nome, telefone ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={linkFilter} onValueChange={setLinkFilter}>
          <SelectTrigger className="w-full sm:w-56" aria-label="Link de pagamento"><SelectValue placeholder="Link de pagamento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="with">Com link</SelectItem>
            <SelectItem value="without">Sem link</SelectItem>
            <SelectItem value="vencendo">Vencendo/vencido</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        {filtered.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum paciente encontrado.</Card>
        )}
        {filtered.map((p) => (
          <Card key={p.id} className="p-4 flex items-center justify-between gap-3">
            <Link to={`/pacientes/${p.id}`} className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium truncate">{p.full_name}</div>
                <PaymentLinkExpiryBadge link={p.payment_link} expiresAt={p.payment_link_expires_at} />
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {[p.phone, p.email].filter(Boolean).join(" · ")} · Sessão {formatBRL(Number(p.default_session_price))}
                {p.payment_link_expires_at && ` · Link vence em ${localExpiryDate(p.payment_link_expires_at).toLocaleDateString("pt-BR")}`}
              </div>
            </Link>
            <Button variant="ghost" size="icon" title="Editar" onClick={() => void openEdit(p.id)}>
              <Pencil className="h-4 w-4" />
            </Button>
            {p.phone && (
              <Button asChild variant="ghost" size="icon" title="WhatsApp">
                <a href={buildWaUrl(p.phone)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4 text-success" />
                </a>
              </Button>
            )}
          </Card>
        ))}
      </div>

      <PatientFormDialog open={open} onOpenChange={setOpen} onSaved={load} />
      <PatientFormDialog
        open={!!editing}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        onSaved={load}
        patient={editing ?? undefined}
      />
    </>
  );
};

export default Patients;
