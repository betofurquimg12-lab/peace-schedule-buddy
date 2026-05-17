import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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

type Settings = {
  weekdays: number[];
  startTime: string;
  endTime: string;
  slotMinutes: number;
  reminder_email_day_before_enabled: boolean;
  reminder_email_day_before_minutes: number;
  reminder_email_before_enabled: boolean;
  reminder_email_before_minutes: number;
  reminder_popup_enabled: boolean;
  reminder_popup_minutes: number;
  reminder_app_enabled: boolean;
  reminder_app_minutes: number;
  email_on_appointment_changes: boolean;
};

const DEFAULTS: Settings = {
  weekdays: [1, 2, 3, 4, 5],
  startTime: "08:00",
  endTime: "18:00",
  slotMinutes: 50,
  reminder_email_day_before_enabled: true,
  reminder_email_day_before_minutes: 1440,
  reminder_email_before_enabled: true,
  reminder_email_before_minutes: 10,
  reminder_popup_enabled: true,
  reminder_popup_minutes: 5,
  reminder_app_enabled: true,
  reminder_app_minutes: 5,
  email_on_appointment_changes: true,
};

export const AgendaSettingsCard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("agenda_settings")
        .select("*")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (data) {
        setS({
          weekdays: data.weekdays ?? DEFAULTS.weekdays,
          startTime: (data.start_time as string)?.slice(0, 5) ?? DEFAULTS.startTime,
          endTime: (data.end_time as string)?.slice(0, 5) ?? DEFAULTS.endTime,
          slotMinutes: data.slot_minutes ?? DEFAULTS.slotMinutes,
          reminder_email_day_before_enabled: data.reminder_email_day_before_enabled ?? true,
          reminder_email_day_before_minutes: data.reminder_email_day_before_minutes ?? 1440,
          reminder_email_before_enabled: data.reminder_email_before_enabled ?? true,
          reminder_email_before_minutes: data.reminder_email_before_minutes ?? 10,
          reminder_popup_enabled: data.reminder_popup_enabled ?? true,
          reminder_popup_minutes: data.reminder_popup_minutes ?? 5,
          reminder_app_enabled: data.reminder_app_enabled ?? true,
          reminder_app_minutes: data.reminder_app_minutes ?? 5,
          email_on_appointment_changes: (data as any).email_on_appointment_changes ?? true,
        });
      }
      setLoading(false);
    };
    void load();
  }, [user]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));

  const toggleDay = (d: number) => {
    set("weekdays", s.weekdays.includes(d) ? s.weekdays.filter((x) => x !== d) : [...s.weekdays, d].sort());
  };

  const save = async () => {
    if (!user) return;
    if (s.weekdays.length === 0) return toast({ title: "Selecione ao menos um dia", variant: "destructive" });
    if (s.startTime >= s.endTime) return toast({ title: "Horário final deve ser após o inicial", variant: "destructive" });
    setSaving(true);
    const { error } = await supabase.from("agenda_settings").upsert(
      {
        owner_id: user.id,
        weekdays: s.weekdays,
        start_time: s.startTime,
        end_time: s.endTime,
        slot_minutes: s.slotMinutes,
        reminder_email_day_before_enabled: s.reminder_email_day_before_enabled,
        reminder_email_day_before_minutes: s.reminder_email_day_before_minutes,
        reminder_email_before_enabled: s.reminder_email_before_enabled,
        reminder_email_before_minutes: s.reminder_email_before_minutes,
        reminder_popup_enabled: s.reminder_popup_enabled,
        reminder_popup_minutes: s.reminder_popup_minutes,
        reminder_app_enabled: s.reminder_app_enabled,
        reminder_app_minutes: s.reminder_app_minutes,
      },
      { onConflict: "owner_id" },
    );
    setSaving(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Configurações salvas" });
  };

  if (loading) return null;

  return (
    <Card className="p-5">
      <h2 className="text-lg mb-1">Disponibilidade & Lembretes</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Defina os dias e horários de atendimento e quando os lembretes serão disparados.
      </p>

      <div className="space-y-6">
        {/* Disponibilidade */}
        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">Dias de atendimento</Label>
            <div className="flex flex-wrap gap-3">
              {WEEKDAYS.map((d) => (
                <label key={d.value} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={s.weekdays.includes(d.value)} onCheckedChange={() => toggleDay(d.value)} />
                  <span className="text-sm">{d.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="start">Início</Label>
              <Input id="start" type="time" value={s.startTime} onChange={(e) => set("startTime", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="end">Fim</Label>
              <Input id="end" type="time" value={s.endTime} onChange={(e) => set("endTime", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="slot">Duração da sessão (min)</Label>
              <Input id="slot" type="number" min={10} max={240} value={s.slotMinutes} onChange={(e) => set("slotMinutes", parseInt(e.target.value || "50", 10))} />
            </div>
          </div>
        </div>

        {/* Lembretes */}
        <div className="space-y-4 pt-2 border-t">
          <div>
            <Label className="block mb-1">Lembretes</Label>
            <p className="text-xs text-muted-foreground">
              Os lembretes do Google Calendar são enviados automaticamente para o paciente (por e-mail/popup).
              O alerta no app abre o WhatsApp pronto para você enviar.
            </p>
          </div>

          <ReminderRow
            title="E-mail para o paciente — véspera"
            description="Lembrete enviado pelo Google Calendar antes da sessão (em minutos)."
            enabled={s.reminder_email_day_before_enabled}
            onEnabledChange={(v) => set("reminder_email_day_before_enabled", v)}
            minutes={s.reminder_email_day_before_minutes}
            onMinutesChange={(v) => set("reminder_email_day_before_minutes", v)}
            min={60}
            max={10080}
          />
          <ReminderRow
            title="E-mail para o paciente — pouco antes"
            description="2º e-mail mais próximo da sessão."
            enabled={s.reminder_email_before_enabled}
            onEnabledChange={(v) => set("reminder_email_before_enabled", v)}
            minutes={s.reminder_email_before_minutes}
            onMinutesChange={(v) => set("reminder_email_before_minutes", v)}
            min={1}
            max={1440}
          />
          <ReminderRow
            title="Popup do Google Calendar"
            description="Notificação no aplicativo do Google Calendar do paciente."
            enabled={s.reminder_popup_enabled}
            onEnabledChange={(v) => set("reminder_popup_enabled", v)}
            minutes={s.reminder_popup_minutes}
            onMinutesChange={(v) => set("reminder_popup_minutes", v)}
            min={1}
            max={1440}
          />
          <ReminderRow
            title="Alerta no app (com botão WhatsApp)"
            description="Toast dentro do sistema com o link já preparado para enviar pelo WhatsApp."
            enabled={s.reminder_app_enabled}
            onEnabledChange={(v) => set("reminder_app_enabled", v)}
            minutes={s.reminder_app_minutes}
            onMinutesChange={(v) => set("reminder_app_minutes", v)}
            min={1}
            max={1440}
          />
          <p className="text-[11px] text-muted-foreground">
            As mudanças nos lembretes do Google se aplicam a novos agendamentos. Edite uma sessão existente
            e salve novamente para reaplicar lá também.
          </p>
        </div>

        <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar configurações"}</Button>
      </div>
    </Card>
  );
};

const ReminderRow = ({
  title, description, enabled, onEnabledChange, minutes, onMinutesChange, min, max,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  minutes: number;
  onMinutesChange: (v: number) => void;
  min: number;
  max: number;
}) => (
  <div className="flex items-start gap-4 rounded-lg border p-3">
    <Switch checked={enabled} onCheckedChange={onEnabledChange} />
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{description}</div>
    </div>
    <div className="w-32 shrink-0">
      <Label className="text-[10px] uppercase text-muted-foreground">Minutos antes</Label>
      <Input
        type="number"
        min={min}
        max={max}
        value={minutes}
        disabled={!enabled}
        onChange={(e) => onMinutesChange(parseInt(e.target.value || "0", 10))}
      />
    </div>
  </div>
);
