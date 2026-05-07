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
  const [savedEmail, setSavedEmail] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
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
        const e = (data as any).google_sync_email ?? "";
        setEmail(e || user.email || "");
        setSavedEmail(e || null);
        setEditing(!e);
      } else {
        setEmail(user.email ?? "");
        setEditing(true);
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

  const save = async () => {
    if (!user) return;
    if (enabled && !email) {
      return toast({ title: "Informe o e-mail do Google", variant: "destructive" });
    }
    setSaving(true);
    const { error } = await supabase.from("agenda_settings").upsert(
      { owner_id: user.id, google_sync_enabled: enabled, google_sync_email: email || null },
      { onConflict: "owner_id" },
    );
    setSaving(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setSavedEmail(email || null);
    setEditing(false);
    toast({ title: "Vínculo salvo", description: "Sincronizando com o Google Calendar..." });
    if (enabled) await syncNow();
  };

  if (loading) return null;

  const isConnected = !!savedEmail && enabled;

  return (
    <Card className="p-5">
      <h2 className="text-lg mb-1">Google Calendar</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Centralize aqui o vínculo com o Google Calendar. Eventos do Google aparecem na agenda
        bloqueando horários, e agendamentos criados aqui são publicados lá.
      </p>

      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <div className="text-sm font-medium">
              {isConnected ? `Conectado a ${savedEmail}` : "Não conectado"}
            </div>
            <div className="text-xs text-muted-foreground">
              {isConnected
                ? "A sincronização ocorre automaticamente."
                : "Informe o e-mail do Google e salve para vincular."}
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={(v) => { setEnabled(v); if (v && !savedEmail) setEditing(true); }} />
        </div>

        {(editing || !savedEmail) && (
          <div>
            <Label htmlFor="gcal-email">E-mail do Google</Label>
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
        )}

        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button onClick={save} disabled={saving}>
                {saving ? "Salvando..." : "Salvar vínculo"}
              </Button>
              {savedEmail && (
                <Button type="button" variant="ghost" onClick={() => { setEmail(savedEmail); setEditing(false); }}>
                  Cancelar
                </Button>
              )}
            </>
          ) : (
            <Button type="button" variant="outline" onClick={() => setEditing(true)}>
              Editar vínculo
            </Button>
          )}
          <Button type="button" variant="outline" onClick={syncNow} disabled={syncing || !enabled || !savedEmail}>
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> Sincronizar agora
          </Button>
        </div>
      </div>
    </Card>
  );
};
