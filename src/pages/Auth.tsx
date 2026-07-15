import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";

function safeNext(raw: string | null): string {
  if (!raw) return "/";
  try {
    // Only accept same-origin relative paths starting with "/".
    if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
    return raw;
  } catch {
    return "/";
  }
}
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

const schema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
  name: z.string().trim().min(2, "Informe o nome").max(100).optional(),
});

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [tab, setTab] = useState("login");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password, name: tab === "signup" ? name : undefined });
    if (!parsed.success) {
      toast({ title: "Verifique os dados", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      if (tab === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { full_name: name },
          },
        });
        if (error) throw error;
        toast({ title: "Conta criada", description: "Você já pode entrar." });
        navigate("/");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/");
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message ?? "Tente novamente", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--gradient-soft)]">
      <Card className="w-full max-w-md p-8 shadow-[var(--shadow-soft)]">
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground mb-3 text-lg font-semibold">C</div>
          <h1 className="text-2xl">Calma</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestão de atendimentos clínicos</p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Entrar</TabsTrigger>
            <TabsTrigger value="signup">Criar conta</TabsTrigger>
          </TabsList>

          <form onSubmit={handleEmail} className="space-y-4 mt-6">
            <TabsContent value="signup" className="space-y-4 mt-0">
              <div className="space-y-2">
                <Label htmlFor="name">Nome completo</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
              </div>
            </TabsContent>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} maxLength={72} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {tab === "login" ? "Entrar" : "Criar conta"}
            </Button>
          </form>
        </Tabs>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Ao entrar você concorda com o uso responsável dos dados clínicos dos pacientes.
        </p>
      </Card>
    </div>
  );
};

export default Auth;
