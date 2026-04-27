import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Search, MessageCircle } from "lucide-react";
import { formatBRL, buildWaUrl } from "@/lib/format";
import { PatientFormDialog } from "@/components/patients/PatientFormDialog";

const Patients = () => {
  const [list, setList] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("patients")
      .select("id, full_name, phone, email, default_session_price, active")
      .order("full_name");
    setList(data ?? []);
  };
  useEffect(() => { void load(); }, []);

  const filtered = list.filter((p) =>
    p.full_name.toLowerCase().includes(q.toLowerCase()) ||
    (p.phone ?? "").includes(q) ||
    (p.email ?? "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <>
      <PageHeader
        title="Pacientes"
        description="Cadastro e ficha clínica"
        action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Novo paciente</Button>}
      />

      <div className="relative mb-4">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por nome, telefone ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="grid gap-2">
        {filtered.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum paciente encontrado.</Card>
        )}
        {filtered.map((p) => (
          <Card key={p.id} className="p-4 flex items-center justify-between gap-3">
            <Link to={`/pacientes/${p.id}`} className="flex-1 min-w-0">
              <div className="font-medium truncate">{p.full_name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {[p.phone, p.email].filter(Boolean).join(" · ")} · Sessão {formatBRL(Number(p.default_session_price))}
              </div>
            </Link>
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
    </>
  );
};

export default Patients;
