import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";

const CONNECTED_ACCOUNT_FALLBACK = "gessicafurquim@gmail.com";

export const GoogleCalendarSyncCard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(true);
  const connectedEmail = CONNECTED_ACCOUNT_FALLBACK;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await supabase
        .from("agenda_settings")
        .select("google_sync_enabled")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (data) {
        setEnabled((data as any).google_sync_enabled ?? true);
      }
      setLoading(false);
    })();
  }, [user]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("google-calendar-sync", { body: {} });
      if (error) throw error;
      toast({ title: "Sincronização concluída" });
    } catch (e: any) {
      toast({ title: "Falha ao sincronizar", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const toggleEnabled = async (value: boolean) => {
    if (!user) return;
    setEnabled(value);
    setSaving(true);
    const { error } = await supabase.from("agenda_settings").upsert(
      { owner_id: user.id, google_sync_enabled: value },
      { onConflict: "owner_id" },
    );
    setSaving(false);
    if (error) {
      setEnabled(!value);
      return toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    }
    toast({ title: value ? "Sincronização ativada" : "Sincronização desativada" });
  };

  if (loading) return null;

  return (
    <Card className="p-5">
      <h2 className="text-lg mb-1">Google Calendar</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Eventos do Google aparecem na agenda bloqueando horários, e agendamentos criados aqui são
        publicados lá com link do Meet.
      </p>

      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex items-start gap-3">
            {enabled ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
            )}
            <div>
              <div className="text-sm font-medium">Conta conectada: {connectedEmail}</div>
              <div className="text-xs text-muted-foreground">
                {enabled ? "Sincronização ativa." : "Sincronização desativada."}
              </div>
            </div>
          </div>
          <Switch checked={enabled} disabled={saving} onCheckedChange={toggleEnabled} />
        </div>

        <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          A conta Google usada para criar eventos e links do Meet é definida no nível do app. Para
          trocá-la, é necessário desconectar e reconectar a integração do Google Calendar nas
          configurações de conectores do projeto (ou solicitar a troca ao responsável técnico).
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={syncNow} disabled={syncing || !enabled}>
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            Sincronizar agora
          </Button>
        </div>
      </div>
    </Card>
  );
};
