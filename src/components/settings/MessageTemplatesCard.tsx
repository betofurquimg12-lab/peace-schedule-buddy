import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  TEMPLATE_DEFS,
  TemplateKey,
  AVAILABLE_VARS,
  invalidateTemplateCache,
  getTemplateDef,
} from "@/lib/messageTemplate";

type Drafts = Record<TemplateKey, { subject: string; body: string }>;

export const MessageTemplatesCard = () => {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [active, setActive] = useState<TemplateKey>("wa_reminder");
  const [drafts, setDrafts] = useState<Drafts | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const bodyRefs = useRef<Record<TemplateKey, HTMLTextAreaElement | null>>({
    wa_reminder: null,
    wa_charge: null,
    email_confirmation: null,
    email_reminder: null,
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("message_templates")
        .select("key, subject, body");
      const byKey = new Map((data ?? []).map((r: any) => [r.key, r]));
      const next = {} as Drafts;
      for (const def of TEMPLATE_DEFS) {
        const row = byKey.get(def.key) as any;
        next[def.key] = {
          subject: row?.subject ?? def.defaultSubject ?? "",
          body: row?.body ?? def.defaultBody,
        };
      }
      setDrafts(next);
      setLoading(false);
    })();
  }, []);

  const isOwner = role === "owner";

  const update = (key: TemplateKey, patch: Partial<{ subject: string; body: string }>) => {
    setDrafts((prev) => (prev ? { ...prev, [key]: { ...prev[key], ...patch } } : prev));
  };

  const insertVar = (key: TemplateKey, token: string) => {
    const ta = bodyRefs.current[key];
    if (!ta || !drafts) return;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const next = ta.value.slice(0, start) + token + ta.value.slice(end);
    update(key, { body: next });
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + token.length;
    });
  };

  const save = async (key: TemplateKey) => {
    if (!user || !drafts) return;
    const def = getTemplateDef(key);
    setSaving(true);
    const { error } = await supabase.from("message_templates").upsert(
      {
        owner_id: user.id,
        key,
        subject: def.hasSubject ? drafts[key].subject : null,
        body: drafts[key].body,
      },
      { onConflict: "owner_id,key" },
    );
    setSaving(false);
    if (error) return toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    invalidateTemplateCache(key);
    toast({ title: "Mensagem salva" });
  };

  const restore = (key: TemplateKey) => {
    const def = getTemplateDef(key);
    update(key, { subject: def.defaultSubject ?? "", body: def.defaultBody });
  };

  if (loading || !drafts) return null;

  return (
    <Card className="p-5">
      <h2 className="text-lg mb-1">Mensagens</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Edite os textos que serão enviados pelo WhatsApp e por e-mail. Use as variáveis abaixo para
        deixar a mensagem dinâmica.
      </p>

      <Tabs value={active} onValueChange={(v) => setActive(v as TemplateKey)}>
        <TabsList className="flex flex-wrap h-auto">
          {TEMPLATE_DEFS.map((def) => (
            <TabsTrigger key={def.key} value={def.key} className="text-xs">
              {def.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TEMPLATE_DEFS.map((def) => (
          <TabsContent key={def.key} value={def.key} className="space-y-4 mt-4">
            <p className="text-xs text-muted-foreground">{def.description}</p>

            {def.hasSubject && (
              <div>
                <Label htmlFor={`${def.key}-subject`}>Assunto</Label>
                <Input
                  id={`${def.key}-subject`}
                  value={drafts[def.key].subject}
                  onChange={(e) => update(def.key, { subject: e.target.value })}
                  disabled={!isOwner}
                />
              </div>
            )}

            <div>
              <Label htmlFor={`${def.key}-body`}>Mensagem</Label>
              <Textarea
                id={`${def.key}-body`}
                ref={(el) => (bodyRefs.current[def.key] = el)}
                value={drafts[def.key].body}
                onChange={(e) => update(def.key, { body: e.target.value })}
                rows={8}
                disabled={!isOwner}
                className="font-mono text-sm"
              />
            </div>

            <div>
              <div className="text-xs uppercase text-muted-foreground mb-2">Variáveis disponíveis</div>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_VARS.map((v) => (
                  <button
                    key={v.token}
                    type="button"
                    onClick={() => insertVar(def.key, v.token)}
                    disabled={!isOwner}
                    title={v.description}
                    className="text-xs rounded-md border px-2 py-1 hover:bg-muted disabled:opacity-50"
                  >
                    {v.token}
                  </button>
                ))}
              </div>
            </div>

            {isOwner && (
              <div className="flex gap-2">
                <Button onClick={() => save(def.key)} disabled={saving}>
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => restore(def.key)}>
                  Restaurar padrão
                </Button>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
};
