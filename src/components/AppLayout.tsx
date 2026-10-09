import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Calendar, Users, LayoutDashboard, Wallet, Settings, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useUpcomingSessionAlerts } from "@/hooks/useUpcomingSessionAlerts";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import { PaymentLinkAlertBanner } from "@/components/patients/PaymentLinkAlertBanner";

const nav = [
  { to: "/", label: "Início", icon: LayoutDashboard, end: true },
  { to: "/agenda", label: "Agenda", icon: Calendar },
  { to: "/pacientes", label: "Pacientes", icon: Users },
  { to: "/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/config", label: "Configurações", icon: Settings },
];

export const AppLayout = () => {
  const { user, role, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try { localStorage.setItem("sidebar-collapsed", String(next)); } catch { /* ignore */ }
      return next;
    });
  };
  useUpcomingSessionAlerts(!!user);
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <aside className={cn("relative md:sticky md:top-0 md:h-screen bg-sidebar text-sidebar-foreground flex md:flex-col border-b md:border-b-0 md:border-r border-sidebar-border transition-[width]", collapsed ? "md:w-16" : "md:w-60")}>
        <Button
          variant="ghost"
          size="icon"
          className={cn("hidden md:inline-flex absolute top-3 right-3 h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent", collapsed && "md:left-1/2 md:right-auto md:-translate-x-1/2")}
          onClick={toggleCollapsed}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
        <div className={cn("p-4 md:p-6 flex md:block items-center gap-3", collapsed && "md:pt-14")}>
          <div className="flex items-center gap-3 flex-1 md:flex-none">
            <div className="h-9 w-9 rounded-full bg-sidebar-primary text-sidebar-primary-foreground inline-flex items-center justify-center font-semibold">C</div>
            <div className={cn("md:mt-3", collapsed && "md:hidden")}>
              <div className="font-semibold leading-tight">Calma</div>
              <div className="text-[11px] text-sidebar-foreground/70 capitalize">{role === "owner" ? "Psicóloga" : role === "secretary" ? "Secretária" : ""}</div>
            </div>
          </div>
          <div className="md:hidden ml-auto"><NotificationsBell /></div>
          <div className={cn("hidden md:block md:mt-3", collapsed && "md:text-center")}><NotificationsBell /></div>
        </div>
        <TooltipProvider>
          <nav className="flex md:flex-col gap-1 px-2 md:px-3 pb-2 md:pb-0 overflow-x-auto md:overflow-visible flex-1">
            {nav.map((n) => {
              const link = (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors",
                      collapsed && "md:justify-center md:px-0",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                    )
                  }
                >
                  <n.icon className="h-4 w-4 shrink-0" />
                  <span className={cn(collapsed && "md:hidden")}>{n.label}</span>
                </NavLink>
              );
              return collapsed ? (
                <Tooltip key={n.to}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right" className="hidden md:block">{n.label}</TooltipContent>
                </Tooltip>
              ) : link;
            })}
          </nav>
        </TooltipProvider>
        <div className="hidden md:block p-3 border-t border-sidebar-border">
          <div className={cn("text-xs text-sidebar-foreground/70 mb-2 truncate", collapsed && "hidden")}>{user?.email}</div>
          <Button variant="ghost" size={collapsed ? "icon" : "sm"} className={cn("text-sidebar-foreground hover:bg-sidebar-accent", collapsed ? "w-full" : "w-full justify-start")} onClick={signOut} title={collapsed ? "Sair" : undefined}>
            <LogOut className="h-4 w-4" /> <span className={cn(collapsed && "hidden")}>Sair</span>
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="p-4 md:p-6">
          <PaymentLinkAlertBanner />
          <Outlet />
        </div>
      </main>
    </div>
  );
};
