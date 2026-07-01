import { useEffect, useState, useCallback } from "react";
import { Bell, ScanSearch } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";


type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  related_appointment_ids: string[];
  is_read: boolean;
  created_at: string;
};

const relativeTime = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  const days = Math.floor(diff / 86400);
  if (days < 7) return `há ${days}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
};

export const NotificationsBell = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);

  const runConflictScan = async () => {
    setScanning(true);
    try {
      const { data, error } = await supabase.rpc("check_existing_conflicts" as any);
      if (error) throw error;
      const count = Number(data ?? 0);
      toast.success(count > 0 ? `${count} conflito(s) encontrado(s)` : "Nenhum conflito encontrado");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao verificar conflitos");
    } finally {
      setScanning(false);
    }
  };


  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setItems(((data as any) ?? []) as Notification[]);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void load();
    const channel = supabase
      .channel(`notifications-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => void load(),
      )
      .subscribe();
    const iv = window.setInterval(load, 60_000);
    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(iv);
    };
  }, [user, load]);

  const unread = items.filter((n) => !n.is_read).length;

  const handleClick = async (n: Notification) => {
    if (!n.is_read) {
      await supabase.from("notifications" as any).update({ is_read: true }).eq("id", n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    }
    const apptId = n.related_appointment_ids?.[0];
    setOpen(false);
    if (apptId) navigate(`/agenda?appointment=${apptId}`);
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase
      .from("notifications" as any)
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
  };

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-sidebar-foreground hover:bg-sidebar-accent" aria-label="Notificações">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 justify-center text-[10px] leading-none"
            >
              {unread > 99 ? "99+" : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between gap-2 p-3 border-b">
          <div className="text-sm font-semibold">Notificações</div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={runConflictScan}
              disabled={scanning}
              className="h-7 text-xs gap-1"
              title="Verificar conflitos de agenda"
            >
              <ScanSearch className="h-3.5 w-3.5" />
              {scanning ? "Verificando..." : "Verificar conflitos"}
            </Button>
            <Button variant="ghost" size="sm" onClick={markAllRead} disabled={unread === 0} className="h-7 text-xs">
              Marcar todas como lidas
            </Button>
          </div>
        </div>

        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma notificação</div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => handleClick(n)}
                    className={`w-full text-left p-3 hover:bg-accent transition-colors ${
                      n.is_read ? "opacity-70" : "bg-accent/40"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.is_read && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{n.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-3">{n.message}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">{relativeTime(n.created_at)}</div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
