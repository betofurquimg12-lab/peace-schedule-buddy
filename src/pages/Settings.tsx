import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Mail } from "lucide-react";

const Settings = () => {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const [invites, setInvites] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [email, setEmail] = useState("");

  const load = async () => {
    if (role !== "owner") return;
    const [{ data: inv }, { data: roles }] = await Promise.all([
      supabase.from("invitations").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role, profile:profiles!user_roles_user_id_fkey(full_name, email)").order("created_at"),
    ]);
    setInvites(inv ?? []);
    // fallback if join doesn't resolve
    if (roles && (!roles[0] || !roles[0].profile)) {
      const ids = roles.map((r: any) => r.user_id);
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      const byId = new Map((profs ?? []).map((p) => [p.id, p]));
      setTeam(roles.map((r: any) => ({ ...r, profile: byId.get(r.user_id) })));
    } else {
      setTeam(roles ?? []);
    }
  };
  useEffect(() => { void load(); }, [role]);

  const invite = async () => {
    const parsed = z.string().trim().email().max(255).safeParse(email);
    if (!parsed.success) return toast({ title: "E-mail inválido", variant: "destructive" });
    const { error } = await supabase.from("invitations").insert({
      email: parsed.data, role: "secretary", invited_by: user?.id,
    });
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setEmail("");
    toast({ title: "Convite criado", description: "Peça que ela se cadastre com este mesmo e-mail." });
    void load();
  };

  const removeInvite = async (id: string) => {
    await supabase.from("invitations").delete().eq("id", id);
    void load();
  };

  const removeMember = async (uid: string) => {
    if (!confirm("Remover acesso desta secretária?")) return;
    await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", "secretary");
    void load();
  };

  return (
    <>
      <PageHeader title="Configurações" description="Equipe e integrações" />

      {role !== "owner" ? (
        <Card className="p-6 text-sm text-muted-foreground">Apenas a psicóloga pode gerenciar configurações.</Card>
      ) : (
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-lg mb-1">Convidar secretária</h2>
            <p className="text-sm text-muted-foreground mb-4">Ela precisa criar uma conta com o mesmo e-mail para virar secretária automaticamente.</p>
            <div className="flex gap-2">
              <Input type="email" placeholder="email@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Button onClick={invite}><Mail className="h-4 w-4" /> Convidar</Button>
            </div>

            {invites.filter((i) => !i.accepted_at).length > 0 && (
              <div className="mt-5">
                <div className="text-xs uppercase text-muted-foreground mb-2">Convites pendentes</div>
                <ul className="divide-y border rounded-lg">
                  {invites.filter((i) => !i.accepted_at).map((i) => (
                    <li key={i.id} className="p-3 flex items-center justify-between">
                      <span className="text-sm">{i.email}</span>
                      <Button variant="ghost" size="icon" onClick={() => removeInvite(i.id)}><Trash2 className="h-4 w-4" /></Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-lg mb-4">Equipe</h2>
            <ul className="divide-y">
              {team.map((m) => (
                <li key={m.user_id + m.role} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{m.profile?.full_name ?? m.profile?.email ?? m.user_id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">{m.profile?.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                      {m.role === "owner" ? "Psicóloga" : "Secretária"}
                    </Badge>
                    {m.role === "secretary" && (
                      <Button variant="ghost" size="icon" onClick={() => removeMember(m.user_id)}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg mb-1">Google Calendar</h2>
            <p className="text-sm text-muted-foreground">
              Sincronização bidirecional disponível em breve. Vamos conectar sua conta Google e configurar credenciais OAuth juntos.
            </p>
          </Card>
        </div>
      )}
    </>
  );
};

export default Settings;
