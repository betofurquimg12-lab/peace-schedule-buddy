import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_STATUS_COLORS,
  mergeStatusColors,
  STATUS_LABELS,
  STATUS_ORDER,
  textColorFor,
  type ApptStatus,
} from "@/lib/statusColors";

export const StatusColorsCard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [colors, setColors] = useState(DEFAULT_STATUS_COLORS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase
        .from("agenda_settings")
        .select("id, status_colors")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (data) {
        setSettingsId(data.id);
        setColors(mergeStatusColors((data as any).status_colors));
      }
    })();
  }, [user]);

  const setColor = (status: ApptStatus, value: string) => {
    setColors((current) => ({ ...current, [status]: value }));
  };

  const save = async () => {
    if (!settingsId) {
      toast({
        title: "Configurações da agenda não encontradas",
        description: "Salve primeiro as configurações da agenda.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("agenda_settings")
      .update({ status_colors: colors } as any)
      .eq("id", settingsId);
    setSaving(false);

    if (error) {
      toast({ title: "Erro ao salvar cores", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Cores salvas" });
  };

  return (
    <Card className="p-5">
      <h2 className="text-lg mb-1">Cores por status</h2>
      <p className="text-sm text-muted-foreground mb-4">Cor dos cards na agenda para cada status da consulta.</p>

      <div className="space-y-3">
        {STATUS_ORDER.map((status) => (
          <div key={status} className="grid gap-2 sm:grid-cols-[120px_44px_120px_1fr] sm:items-center">
            <span className="text-sm font-medium">{STATUS_LABELS[status]}</span>
            <input
              type="color"
              value={colors[status]}
              onChange={(event) => setColor(status, event.target.value)}
              className="h-9 w-11 cursor-pointer rounded border bg-background p-1"
              aria-label={`Cor para ${STATUS_LABELS[status]}`}
            />
            <Input
              value={colors[status]}
              onChange={(event) => setColor(status, event.target.value)}
              maxLength={7}
              aria-label={`Código da cor para ${STATUS_LABELS[status]}`}
            />
            <div
              className="rounded-md px-3 py-2 text-xs font-medium"
              style={{ backgroundColor: colors[status], color: textColorFor(colors[status]) }}
            >
              Paciente · 10:00
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex gap-2">
        <Button variant="outline" onClick={() => setColors({ ...DEFAULT_STATUS_COLORS })} disabled={saving}>
          Restaurar padrão
        </Button>
        <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
      </div>
    </Card>
  );
};