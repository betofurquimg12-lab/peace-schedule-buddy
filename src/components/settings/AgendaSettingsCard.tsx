import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

const WEEKDAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

export const AgendaSettingsCard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("18:00");
  const [slotMinutes, setSlotMinutes] = useState(50);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("agenda_settings")
        .select("*")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (data) {
        setWeekdays(data.weekdays ?? [1, 2, 3, 4, 5]);
        setStartTime((data.start_time as string)?.slice(0, 5) ?? "08:00");
        setEndTime((data.end_time as string)?.slice(0, 5) ?? "18:00");
        setSlotMinutes(data.slot_minutes ?? 50);
      }
      setLoading(false);
    };
    void load();
  }, [user]);

  const toggleDay = (d: number) => {
    setWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()
    );
  };

  const save = async () => {
    if (!user) return;
    if (weekdays.length === 0) {
      return toast({ title: "Selecione ao menos um dia", variant: "destructive" });
    }
    if (startTime >= endTime) {
      return toast({ title: "Horário final deve ser após o inicial", variant: "destructive" });
    }
    setSaving(true);
    const { error } = await supabase
      .from("agenda_settings")
      .upsert(
        {
          owner_id: user.id,
          weekdays,
          start_time: startTime,
          end_time: endTime,
          slot_minutes: slotMinutes,
        },
        { onConflict: "owner_id" }
      );
    setSaving(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Disponibilidade salva" });
  };

  if (loading) return null;

  return (
    <Card className="p-5">
      <h2 className="text-lg mb-1">Disponibilidade da agenda</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Defina os dias da semana e o intervalo de horários em que você atende.
      </p>

      <div className="space-y-5">
        <div>
          <Label className="mb-2 block">Dias de atendimento</Label>
          <div className="flex flex-wrap gap-3">
            {WEEKDAYS.map((d) => (
              <label key={d.value} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={weekdays.includes(d.value)}
                  onCheckedChange={() => toggleDay(d.value)}
                />
                <span className="text-sm">{d.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="start">Início</Label>
            <Input
              id="start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="end">Fim</Label>
            <Input
              id="end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="slot">Duração da sessão (min)</Label>
            <Input
              id="slot"
              type="number"
              min={10}
              max={240}
              value={slotMinutes}
              onChange={(e) => setSlotMinutes(parseInt(e.target.value || "50", 10))}
            />
          </div>
        </div>

        <Button onClick={save} disabled={saving}>
          {saving ? "Salvando..." : "Salvar disponibilidade"}
        </Button>
      </div>
    </Card>
  );
};
