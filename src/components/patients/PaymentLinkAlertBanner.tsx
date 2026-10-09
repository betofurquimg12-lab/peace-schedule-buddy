import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "payment-link-banner-dismissed";

export const PaymentLinkAlertBanner = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [counts, setCounts] = useState({ expired: 0, expiring: 0 });
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISSED_KEY) === "true"; }
    catch { return false; }
  });

  useEffect(() => {
    if (!user || dismissed) return;
    let cancelled = false;
    void (async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const cutoff = new Date(today);
      cutoff.setDate(cutoff.getDate() + 3);
      const cutoffDate = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
      const { data, error } = await supabase.from("patients")
        .select("payment_link, payment_link_expires_at")
        .eq("active", true)
        .not("payment_link", "is", null)
        .neq("payment_link", "")
        .not("payment_link_expires_at", "is", null)
        .lte("payment_link_expires_at", cutoffDate);
      if (cancelled || error) return;
      let expired = 0;
      let expiring = 0;
      for (const patient of data ?? []) {
        if (!patient.payment_link?.trim() || !patient.payment_link_expires_at) continue;
        const [year, month, day] = patient.payment_link_expires_at.split("-").map(Number);
        const expiry = new Date(year, month - 1, day);
        const days = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
        if (days < 0) expired++;
        else if (days <= 3) expiring++;
      }
      setCounts({ expired, expiring });
    })();
    return () => { cancelled = true; };
  }, [user, dismissed]);

  if (!user || dismissed || counts.expired + counts.expiring === 0) return null;
  const message = counts.expired > 0
    ? `${counts.expired} paciente(s) com link de pagamento vencido. Gere um novo link no cadastro.${counts.expiring > 0 ? ` Outros ${counts.expiring} vencem nos próximos 3 dias.` : ""}`
    : `${counts.expiring} paciente(s) com link de pagamento vencendo nos próximos 3 dias. Renove no cadastro.`;

  return (
    <div role="status" className={`mb-4 flex flex-wrap items-center gap-3 rounded-md border p-3 ${counts.expired > 0 ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-warning/30 bg-warning/15 text-warning"}`}>
      <AlertTriangle className="h-5 w-5 shrink-0" />
      <p className="min-w-0 flex-1 basis-48 break-words text-sm">{message}</p>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="outline" size="sm" onClick={() => navigate("/pacientes?link=vencendo")}>Ver pacientes</Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Fechar aviso" title="Fechar aviso" onClick={() => {
          setDismissed(true);
          try { sessionStorage.setItem(DISMISSED_KEY, "true"); } catch { /* ignore */ }
        }}><X className="h-4 w-4" /></Button>
      </div>
    </div>
  );
};