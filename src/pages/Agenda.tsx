import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, ChevronLeft, ChevronRight, MessageCircle, Video, DollarSign } from "lucide-react";
import { AppointmentDialog } from "@/components/agenda/AppointmentDialog";
import { formatBRL } from "@/lib/format";
import { buildSessionWaUrlAsync, buildChargeWaUrlAsync } from "@/lib/sessionReminder";
import { Badge } from "@/components/ui/badge";

const openWaForAppointment = async (a: any, kind: "reminder" | "charge") => {
  const opts = {
    phone: a.patient?.phone,
    patientName: a.patient?.full_name ?? "",
    startsAt: a.starts_at,
    meetLink: a.meet_link,
    price: Number(a.price ?? 0),
  };
  const url =
    kind === "charge"
      ? await buildChargeWaUrlAsync(opts)
      : await buildSessionWaUrlAsync(opts);
  window.open(url, "_blank", "noopener,noreferrer");
};

const startOfWeek = (d: Date) => {
  const x = new Date(d);
  const day = x.getDay();
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
};

const Agenda = () => {
  const [refDate, setRefDate] = useState(() => startOfWeek(new Date()));
  const [appts, setAppts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [presetSlot, setPresetSlot] = useState<Date | null>(null);
  const [settings, setSettings] = useState<{ weekdays: number[]; startHour: number; endHour: number }>({
    weekdays: [1, 2, 3, 4, 5],
    startHour: 7,
    endHour: 20,
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("agenda_settings")
        .select("weekdays, start_time, end_time")
        .limit(1)
        .maybeSingle();
      if (data) {
        const sh = parseInt(String(data.start_time).slice(0, 2), 10);
        const eh = parseInt(String(data.end_time).slice(0, 2), 10);
        setSettings({
          weekdays: data.weekdays ?? [1, 2, 3, 4, 5],
          startHour: isNaN(sh) ? 7 : sh,
          endHour: isNaN(eh) ? 20 : Math.max(sh + 1, eh),
        });
      }
    })();
  }, []);

  const days = useMemo(() => {
    const all = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(refDate); d.setDate(d.getDate() + i); return d;
    });
    return all.filter((d) => settings.weekdays.includes(d.getDay()));
  }, [refDate, settings.weekdays]);

  const hours = useMemo(
    () => Array.from({ length: Math.max(0, settings.endHour - settings.startHour + 1) }, (_, i) => settings.startHour + i),
    [settings.startHour, settings.endHour]
  );

  const load = async () => {
    const start = new Date(refDate); start.setHours(0, 0, 0, 0);
    const end = new Date(refDate); end.setDate(end.getDate() + 7);
    const { data } = await supabase
      .from("appointments")
      .select("id, starts_at, ends_at, price, status, meet_link, source, external_summary, google_event_id, recurrence, recurrence_group_id, recurrence_end_date, patient:patients(id, full_name, phone)")
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .order("starts_at");
    setAppts(data ?? []);
  };
  useEffect(() => { void load(); }, [refDate]);


  const move = (delta: number) => {
    const d = new Date(refDate); d.setDate(d.getDate() + delta * 7); setRefDate(d);
  };

  const onSlot = (day: Date, hour: number) => {
    const d = new Date(day); d.setHours(hour, 0, 0, 0);
    setPresetSlot(d); setEditing(null); setOpen(true);
  };

  const weekStart = refDate;
  const weekEnd = new Date(refDate); weekEnd.setDate(weekEnd.getDate() + 6);
  const fmtRange = `${weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${weekEnd.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`;

  return (
    <>
      <PageHeader
        title="Agenda"
        description="Atendimentos agendados na semana"
        action={<Button onClick={() => { setEditing(null); setPresetSlot(null); setOpen(true); }}><Plus className="h-4 w-4" /> Nova consulta</Button>}
      />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => setRefDate(startOfWeek(new Date()))}>Hoje</Button>
        </div>
        <div className="text-sm font-medium">{fmtRange}</div>
      </div>

      {/* Mobile: list view */}
      <div className="md:hidden space-y-4">
        {days.map((d) => {
          const dayAppts = appts.filter((a) => sameDay(new Date(a.starts_at), d));
          return (
            <div key={d.toISOString()}>
              <div className={`text-xs uppercase tracking-wide mb-2 ${sameDay(d, new Date()) ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                {d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
                {sameDay(d, new Date()) && <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[10px]">Hoje</span>}
              </div>
              {dayAppts.length === 0 ? (
                <Card className="p-3 text-xs text-muted-foreground" onClick={() => onSlot(d, 9)} role="button">
                  + Adicionar
                </Card>
              ) : (
                <div className="space-y-2">
                  {dayAppts.map((a) => {
                    const ext = a.source === "google";
                    return (
                      <Card key={a.id} className={`p-3 cursor-pointer ${ext ? "border-dashed bg-muted/30" : ""}`} onClick={() => { setEditing(a); setOpen(true); }}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-sm flex items-center gap-1.5">
                              {ext && <span title="Bloqueado · vindo do Google Calendar">🔒</span>}
                              {ext ? (a.external_summary ?? "Evento do Google") : a.patient?.full_name}
                            </div>
                            <div className="text-xs text-muted-foreground">{hm(a.starts_at)} – {hm(a.ends_at)}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            {!ext && a.patient?.phone && (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); void openWaForAppointment(a, "reminder"); }}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50"
                                  aria-label="Enviar lembrete pelo WhatsApp"
                                  title="Enviar lembrete pelo WhatsApp"
                                >
                                  <MessageCircle className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); void openWaForAppointment(a, "charge"); }}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-amber-600 hover:bg-amber-50"
                                  aria-label="Cobrar pelo WhatsApp"
                                  title="Cobrar pelo WhatsApp"
                                >
                                  <DollarSign className="h-4 w-4" />
                                </button>
                              </>
                            )}
                            {!ext && a.meet_link && (
                              <a
                                href={a.meet_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-primary hover:bg-primary/10"
                                aria-label="Abrir sala do Meet"
                                title="Abrir sala do Meet"
                              >
                                <Video className="h-4 w-4" />
                              </a>
                            )}
                            {!ext && <Badge variant="secondary">{formatBRL(Number(a.price))}</Badge>}
                            {ext && <Badge variant="outline" className="text-[10px]">Bloqueado</Badge>}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop: week grid */}
      <Card className="hidden md:block overflow-hidden">
        <div className="max-h-[70vh] overflow-y-scroll">
        <div className="grid border-b text-xs sticky top-0 bg-card z-10" style={{ gridTemplateColumns: `60px repeat(${days.length}, 1fr)` }}>
          <div />
          {days.map((d) => {
            const isToday = sameDay(d, new Date());
            return (
              <div key={d.toISOString()} className={`p-2 text-center border-l ${isToday ? "bg-primary/10" : ""}`}>
                <div className={`uppercase ${isToday ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                  {d.toLocaleDateString("pt-BR", { weekday: "short" })}
                </div>
                {isToday ? (
                  <div className="mt-0.5 inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    {d.getDate()}
                  </div>
                ) : (
                  <div className="font-semibold">{d.getDate()}</div>
                )}
              </div>
            );
          })}
        </div>
        {hours.map((h) => {
            const nowHour = new Date().getHours();
            const isCurrentHour = h === nowHour;
            return (
            <div key={h} className={`grid border-b min-h-[56px] ${isCurrentHour ? "bg-primary/5" : ""}`} style={{ gridTemplateColumns: `60px repeat(${days.length}, 1fr)` }}>
              <div className={`text-xs p-2 text-right ${isCurrentHour ? "text-primary font-semibold" : "text-muted-foreground"}`}>{String(h).padStart(2, "0")}:00</div>
              {days.map((d) => {
                const slotAppts = appts.filter((a) => {
                  const dt = new Date(a.starts_at);
                  return sameDay(dt, d) && dt.getHours() === h;
                });
                const isToday = sameDay(d, new Date());
                const isNowCell = isToday && isCurrentHour;
                return (
                  <div key={d.toISOString() + h} className={`border-l p-1 relative cursor-pointer hover:bg-muted/30 min-w-0 ${isNowCell ? "bg-primary/20" : isToday ? "bg-primary/5" : ""}`} onClick={() => slotAppts.length === 0 && onSlot(d, h)}>
                    {slotAppts.map((a) => {
                      const ext = a.source === "google";
                      return (
                        <div key={a.id} className="relative mb-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditing(a); setOpen(true); }}
                            className={`block w-full text-left rounded-md px-2 py-1 pr-14 text-xs ${ext ? "bg-muted text-muted-foreground border border-dashed" : "bg-primary/15 hover:bg-primary/25 text-primary"}`}
                          >
                            <div className="font-medium truncate">
                              {ext ? `🔒 ${a.external_summary ?? "Google"}` : a.patient?.full_name}
                            </div>
                            <div className="opacity-80">{hm(a.starts_at)}</div>
                          </button>
                          <div className="absolute top-1 right-1 flex items-center gap-0.5">
                            {!ext && a.patient?.phone && (
                              <a
                                href={buildSessionWaUrl({ phone: a.patient.phone, patientName: a.patient.full_name, startsAt: a.starts_at, meetLink: a.meet_link })}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex h-5 w-5 items-center justify-center rounded text-emerald-600 hover:bg-emerald-50"
                                aria-label="Enviar lembrete pelo WhatsApp"
                                title="Enviar lembrete pelo WhatsApp"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                              </a>
                            )}
                            {!ext && a.meet_link && (
                              <a
                                href={a.meet_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex h-5 w-5 items-center justify-center rounded text-primary hover:bg-primary/10"
                                aria-label="Abrir sala do Meet"
                                title="Abrir sala do Meet"
                              >
                                <Video className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            );
          })}
        </div>
      </Card>

      <AppointmentDialog
        open={open}
        onOpenChange={setOpen}
        onSaved={load}
        appointment={editing}
        presetStart={presetSlot}
      />
    </>
  );
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const hm = (d: string | Date) => new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export default Agenda;
