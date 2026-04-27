import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { AppointmentDialog } from "@/components/agenda/AppointmentDialog";
import { formatBRL } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

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

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(refDate); d.setDate(d.getDate() + i); return d;
  }), [refDate]);

  const load = async () => {
    const start = new Date(refDate); start.setHours(0, 0, 0, 0);
    const end = new Date(refDate); end.setDate(end.getDate() + 7);
    const { data } = await supabase
      .from("appointments")
      .select("id, starts_at, ends_at, price, status, patient:patients(id, full_name)")
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

  const fmtRange = `${days[0].toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${days[6].toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`;

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
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                {d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
              </div>
              {dayAppts.length === 0 ? (
                <Card className="p-3 text-xs text-muted-foreground" onClick={() => onSlot(d, 9)} role="button">
                  + Adicionar
                </Card>
              ) : (
                <div className="space-y-2">
                  {dayAppts.map((a) => (
                    <Card key={a.id} className="p-3 cursor-pointer" onClick={() => { setEditing(a); setOpen(true); }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-sm">{a.patient?.full_name}</div>
                          <div className="text-xs text-muted-foreground">{hm(a.starts_at)} – {hm(a.ends_at)}</div>
                        </div>
                        <Badge variant="secondary">{formatBRL(Number(a.price))}</Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop: week grid */}
      <Card className="hidden md:block overflow-hidden">
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b text-xs">
          <div />
          {days.map((d) => (
            <div key={d.toISOString()} className="p-2 text-center border-l">
              <div className="text-muted-foreground uppercase">{d.toLocaleDateString("pt-BR", { weekday: "short" })}</div>
              <div className={`font-semibold ${sameDay(d, new Date()) ? "text-primary" : ""}`}>
                {d.getDate()}
              </div>
            </div>
          ))}
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {Array.from({ length: 13 }, (_, i) => i + 7).map((h) => (
            <div key={h} className="grid grid-cols-[60px_repeat(7,1fr)] border-b min-h-[56px]">
              <div className="text-xs text-muted-foreground p-2 text-right">{String(h).padStart(2, "0")}:00</div>
              {days.map((d) => {
                const slotAppts = appts.filter((a) => {
                  const dt = new Date(a.starts_at);
                  return sameDay(dt, d) && dt.getHours() === h;
                });
                return (
                  <div key={d.toISOString() + h} className="border-l p-1 relative cursor-pointer hover:bg-muted/30" onClick={() => slotAppts.length === 0 && onSlot(d, h)}>
                    {slotAppts.map((a) => (
                      <button
                        key={a.id}
                        onClick={(e) => { e.stopPropagation(); setEditing(a); setOpen(true); }}
                        className="block w-full text-left bg-primary/15 hover:bg-primary/25 text-primary rounded-md px-2 py-1 text-xs mb-1"
                      >
                        <div className="font-medium truncate">{a.patient?.full_name}</div>
                        <div className="opacity-80">{hm(a.starts_at)}</div>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
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
