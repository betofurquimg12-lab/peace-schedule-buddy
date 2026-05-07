import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw } from "lucide-react";

export const GoogleCalendarSyncCard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(true);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await supabase
        .from("agenda_settings")
        .select("google_sync_enabled, google_sync_email")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (data) {
        setEnabled((data as any).google_sync_enabled ?? true);
        setEmail((data as any).google_sync_email ?? user.email ?? "");
      } else {
        setEmail(user.email ?? "");
      }
      setLoading(false);
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("agenda_settings").upsert(
      { owner_id: user.id, google_sync_enabled: enabled, google_sync_email: email || null },
      { onConflict: "owner_id" },
    );
    setSaving(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Configurações de sincronização salvas" });
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      await supabase.functions.invoke("google-calendar-sync", { body: {} });
      toast({ title: "Sincronização concluída" });
    } catch (e: any) {
      toast({ title: "Falha", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return null;

  return (
    <Card className="p-5">
      <h2 className="text-lg mb-1">Google Calendar</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Ative a sincronização bidirecional para que eventos do Google apareçam aqui (bloqueando horários)
        e que agendamentos criados aqui apareçam lá automaticamente.
      </p>

      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <div className="text-sm font-medium">Sincronização ativada</div>
            <div className="text-xs text-muted-foreground">Quando desativada, nenhum evento será trocado entre o sistema e o Google.</div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div>
          <Label htmlFor="gcal-email">E-mail do Google integrado</Label>
          <Input
            id="gcal-email"
            type="email"
            placeholder="seuemail@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!enabled}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Os eventos serão lidos/criados na agenda principal (primary) desta conta.
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          <Button type="button" variant="outline" onClick={syncNow} disabled={syncing || !enabled}>
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> Sincronizar agora
          </Button>
        </div>
      </div>
    </Card>
  );
};
