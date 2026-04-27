import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Calendar, Users, LayoutDashboard, Wallet, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Início", icon: LayoutDashboard, end: true },
  { to: "/agenda", label: "Agenda", icon: Calendar },
  { to: "/pacientes", label: "Pacientes", icon: Users },
  { to: "/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/config", label: "Configurações", icon: Settings },
];

export const AppLayout = () => {
  const { user, role, signOut } = useAuth();
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <aside className="md:w-60 md:min-h-screen bg-sidebar text-sidebar-foreground flex md:flex-col border-b md:border-b-0 md:border-r border-sidebar-border">
        <div className="p-4 md:p-6 flex md:block items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-sidebar-primary text-sidebar-primary-foreground inline-flex items-center justify-center font-semibold">C</div>
          <div className="md:mt-3">
            <div className="font-semibold leading-tight">Calma</div>
            <div className="text-[11px] text-sidebar-foreground/70 capitalize">{role === "owner" ? "Psicóloga" : role === "secretary" ? "Secretária" : ""}</div>
          </div>
        </div>
        <nav className="flex md:flex-col gap-1 px-2 md:px-3 pb-2 md:pb-0 overflow-x-auto md:overflow-visible flex-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                )
              }
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden md:block p-3 border-t border-sidebar-border">
          <div className="text-xs text-sidebar-foreground/70 mb-2 truncate">{user?.email}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent" onClick={signOut}>
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="p-4 md:p-8 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
