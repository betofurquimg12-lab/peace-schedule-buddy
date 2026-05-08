import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type State =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "already" }
  | { kind: "invalid" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid" });
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_ANON_KEY } },
        );
        const data = await res.json();
        if (data?.valid === true) setState({ kind: "ready" });
        else if (data?.reason === "already_unsubscribed") setState({ kind: "already" });
        else setState({ kind: "invalid" });
      } catch {
        setState({ kind: "error", message: "Não foi possível validar o link." });
      }
    })();
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setState({ kind: "submitting" });
    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
          body: JSON.stringify({ token }),
        },
      );
      const data = await res.json();
      if (data?.success) setState({ kind: "success" });
      else if (data?.reason === "already_unsubscribed") setState({ kind: "already" });
      else setState({ kind: "error", message: data?.error ?? "Falha ao processar." });
    } catch {
      setState({ kind: "error", message: "Erro de conexão." });
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-md w-full p-6 space-y-4">
        <h1 className="text-xl font-semibold">Cancelar inscrição</h1>
        {state.kind === "loading" && <p className="text-sm text-muted-foreground">Validando link...</p>}
        {state.kind === "invalid" && <p className="text-sm text-muted-foreground">Link inválido ou expirado.</p>}
        {state.kind === "already" && <p className="text-sm text-muted-foreground">Você já cancelou o recebimento desses e-mails.</p>}
        {state.kind === "ready" && (
          <>
            <p className="text-sm text-muted-foreground">
              Confirme abaixo para parar de receber e-mails deste remetente.
            </p>
            <Button onClick={confirm}>Confirmar cancelamento</Button>
          </>
        )}
        {state.kind === "submitting" && <p className="text-sm text-muted-foreground">Processando...</p>}
        {state.kind === "success" && <p className="text-sm">Pronto! Você não receberá mais esses e-mails.</p>}
        {state.kind === "error" && <p className="text-sm text-destructive">{state.message}</p>}
      </Card>
    </main>
  );
}
