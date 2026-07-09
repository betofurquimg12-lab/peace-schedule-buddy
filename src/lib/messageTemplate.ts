import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDateBR, formatTimeBR } from "./format";

export type TemplateKey =
  | "wa_reminder"
  | "wa_charge"
  | "email_confirmation"
  | "email_reminder";

export interface TemplateDef {
  key: TemplateKey;
  label: string;
  hasSubject: boolean;
  defaultSubject?: string;
  defaultBody: string;
  description: string;
}

export const TEMPLATE_DEFS: TemplateDef[] = [
  {
    key: "wa_reminder",
    label: "WhatsApp · lembrete da sessão",
    hasSubject: false,
    defaultBody:
      "Oi, {primeiro_nome}! Passando para lembrar da sua sessão {quando}.{meet_linha} Qualquer coisa me avisa.",
    description:
      "Mensagem enviada quando você clica no ícone do WhatsApp em um agendamento.",
  },
  {
    key: "wa_charge",
    label: "WhatsApp · cobrança / PIX",
    hasSubject: false,
    defaultBody:
      "Oi, {primeiro_nome}! Passando o valor da sessão de {data} às {hora}: {valor}. Pode pagar via PIX para a chave: <coloque sua chave PIX aqui>. Obrigada!",
    description:
      "Mensagem enviada ao clicar no botão $ na agenda. Inclua sua chave PIX no texto.",
  },
  {
    key: "email_confirmation",
    label: "E-mail · confirmação do agendamento",
    hasSubject: true,
    defaultSubject: "Sessão confirmada — {data} às {hora}",
    defaultBody:
      "Olá, {primeiro_nome}!\n\nSua sessão está confirmada para {data} às {hora}.{meet_linha}\n\nQualquer coisa, é só responder este e-mail.\n\n— {psicologa}",
    description:
      "E-mail enviado automaticamente para o paciente quando uma sessão é criada.",
  },
  {
    key: "email_reminder",
    label: "E-mail · lembrete antes da sessão",
    hasSubject: true,
    defaultSubject: "Lembrete: sua sessão {quando}",
    defaultBody:
      "Olá, {primeiro_nome}!\n\nLembrete da sua sessão {quando}.{meet_linha}\n\nAté já!\n\n— {psicologa}",
    description:
      "E-mail enviado automaticamente antes da sessão, conforme o tempo configurado.",
  },
];

export const getTemplateDef = (key: TemplateKey) =>
  TEMPLATE_DEFS.find((t) => t.key === key)!;

export interface TemplateVars {
  paciente?: string;
  primeiro_nome?: string;
  data?: string;
  hora?: string;
  quando?: string;
  valor?: string;
  meet?: string;
  meet_linha?: string;
  psicologa?: string;
  pix?: string;
  link_pagamento?: string;
}

export const buildVarsForAppointment = (opts: {
  patientName?: string | null;
  startsAt?: string | Date | null;
  price?: number | null;
  meetLink?: string | null;
  psicologaName?: string | null;
  paymentLink?: string | null;
}): TemplateVars => {
  const name = opts.patientName ?? "";
  const first = name.split(" ")[0] ?? "";
  let data = "";
  let hora = "";
  let quando = "";
  if (opts.startsAt) {
    const d = new Date(opts.startsAt);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    data = formatDateBR(d);
    hora = formatTimeBR(d);
    quando = sameDay ? `hoje às ${hora}` : `${data} às ${hora}`;
  }
  const meet = opts.meetLink ?? "";
  const meetLinha = meet ? ` Link da sala: ${meet}.` : "";
  const valor =
    typeof opts.price === "number" ? formatBRL(opts.price) : "";
  return {
    paciente: name,
    primeiro_nome: first,
    data,
    hora,
    quando,
    valor,
    meet,
    meet_linha: meetLinha,
    psicologa: opts.psicologaName ?? "",
    link_pagamento: opts.paymentLink ?? "",
  };
};

const PLACEHOLDER = /\{([a-z_]+)\}/g;

export const renderTemplate = (text: string, vars: TemplateVars) =>
  text.replace(PLACEHOLDER, (_, key: string) => {
    const v = (vars as Record<string, string | undefined>)[key];
    return v ?? "";
  });

interface LoadedTemplate {
  subject: string;
  body: string;
}

const cache = new Map<string, LoadedTemplate>();

export const loadTemplate = async (
  key: TemplateKey,
): Promise<LoadedTemplate> => {
  if (cache.has(key)) return cache.get(key)!;
  const def = getTemplateDef(key);
  const { data } = await supabase
    .from("message_templates")
    .select("subject, body")
    .eq("key", key)
    .maybeSingle();
  const result: LoadedTemplate = {
    subject: data?.subject ?? def.defaultSubject ?? "",
    body: data?.body ?? def.defaultBody,
  };
  cache.set(key, result);
  return result;
};

export const invalidateTemplateCache = (key?: TemplateKey) => {
  if (key) cache.delete(key);
  else cache.clear();
};

export const AVAILABLE_VARS: { token: string; description: string }[] = [
  { token: "{paciente}", description: "Nome completo do paciente" },
  { token: "{primeiro_nome}", description: "Primeiro nome do paciente" },
  { token: "{data}", description: "Data da sessão (dd/mm/aaaa)" },
  { token: "{hora}", description: "Horário (HH:mm)" },
  { token: "{quando}", description: '"hoje às 15:00" ou "10/05/2026 às 15:00"' },
  { token: "{valor}", description: "Valor da sessão em R$" },
  { token: "{meet}", description: "Link do Google Meet (vazio se não houver)" },
  { token: "{meet_linha}", description: "Frase pronta com o link, se existir" },
  { token: "{psicologa}", description: "Nome da psicóloga" },
];
