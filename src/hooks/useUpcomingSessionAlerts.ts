import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { buildSessionWaUrl } from "@/lib/sessionReminder";

const STORAGE_KEY = "session-alerts-fired-v1";
const POLL_MS = 30_000;

const loadFired = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
};
const saveFired = (m: Record<string, number>) => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const cleaned = Object.fromEntries(Object.entries(m).filter(([, t]) => t > cutoff));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
};

export const useUpcomingSessionAlerts = (enabled: boolean) => {
  const firedRef = useRef<Record<string, number>>(loadFired());
  const [config, setConfig] = useState<{ enabled: boolean; minutes: number }>({ enabled: true, minutes: 5 });

  useEffect(() => {
    if (!enabled) return;
    void supabase
      .from("agenda_settings")
      .select("reminder_app_enabled, reminder_app_minutes")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setConfig({ enabled: !!data.reminder_app_enabled, minutes: data.reminder_app_minutes ?? 5 });
      });
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !config.enabled) return;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      try { void Notification.requestPermission(); } catch { /* ignore */ }
    }

    let cancelled = false;
    const minutesBefore = Math.max(1, config.minutes);

    const tick = async () => {
      const now = new Date();
      const windowEnd = new Date(now.getTime() + (minutesBefore + 1) * 60_000);
      const { data, error } = await supabase
        .from("appointments")
        .select("id, starts_at, meet_link, source, patient:patients(full_name, phone)")
        .gte("starts_at", now.toISOString())
        .lte("starts_at", windowEnd.toISOString())
        .neq("status", "canceled");
      if (cancelled || error || !data) return;

      const fired = firedRef.current;
      let changed = false;
      for (const a of data) {
        if (a.source === "google") continue; // skip external events
        const startMs = new Date(a.starts_at).getTime();
        const minsUntil = (startMs - Date.now()) / 60_000;
        if (minsUntil > minutesBefore) continue;
        if (minsUntil < -1) continue;
        if (fired[a.id]) continue;

        const patient: any = a.patient;
        const name = patient?.full_name ?? "Paciente";
        const phone = patient?.phone;
        const time = new Date(a.starts_at).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const waUrl = buildSessionWaUrl({
          phone,
          patientName: name,
          startsAt: a.starts_at,
          meetLink: a.meet_link,
        });

        toast(`Sessão às ${time} — ${name}`, {
          description: phone
            ? "Toque em Enviar WhatsApp para mandar o lembrete."
            : "Sem telefone cadastrado para envio de WhatsApp.",
          duration: 10 * 60_000,
          action: phone
            ? {
                label: "Enviar WhatsApp",
                onClick: () => window.open(waUrl, "_blank", "noopener,noreferrer"),
              }
            : undefined,
        });

        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            new Notification(`Sessão em ${Math.max(0, Math.round(minsUntil))} min`, {
              body: `${name} • ${time}`,
              tag: a.id,
            });
          } catch { /* ignore */ }
        }

        fired[a.id] = Date.now();
        changed = true;
      }
      if (changed) saveFired(fired);
    };

    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [enabled, config.enabled, config.minutes]);
};
