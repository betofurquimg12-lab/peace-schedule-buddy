import { buildWaUrl } from "./format";
import {
  buildVarsForAppointment,
  loadTemplate,
  renderTemplate,
} from "./messageTemplate";

interface BaseOpts {
  patientName: string;
  startsAt: string | Date;
  meetLink?: string | null;
  price?: number | null;
}

const fallbackReminder = (opts: BaseOpts) => {
  const d = new Date(opts.startsAt);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const when = sameDay ? `hoje às ${time}` : `${d.toLocaleDateString("pt-BR")} às ${time}`;
  const firstName = (opts.patientName || "").split(" ")[0] || "";
  const linkLine = opts.meetLink ? ` Link da sala: ${opts.meetLink}.` : "";
  return `Oi, ${firstName}! Passando para lembrar da sua sessão ${when}.${linkLine} Qualquer coisa me avisa.`;
};

export const buildSessionReminderMessage = (opts: BaseOpts) => fallbackReminder(opts);

/** Async — usa o template editável `wa_reminder` salvo em Configurações. */
export const buildSessionReminderMessageAsync = async (opts: BaseOpts) => {
  try {
    const tpl = await loadTemplate("wa_reminder");
    const vars = buildVarsForAppointment(opts);
    return renderTemplate(tpl.body, vars);
  } catch {
    return fallbackReminder(opts);
  }
};

export const buildSessionWaUrl = (opts: BaseOpts & { phone?: string | null }) =>
  buildWaUrl(opts.phone, buildSessionReminderMessage(opts));

export const buildSessionWaUrlAsync = async (opts: BaseOpts & { phone?: string | null }) =>
  buildWaUrl(opts.phone, await buildSessionReminderMessageAsync(opts));

/** Mensagem de cobrança — usa template `wa_charge`. */
export const buildChargeMessageAsync = async (opts: BaseOpts) => {
  const tpl = await loadTemplate("wa_charge");
  const vars = buildVarsForAppointment(opts);
  return renderTemplate(tpl.body, vars);
};

export const buildChargeWaUrlAsync = async (
  opts: BaseOpts & { phone?: string | null },
) => buildWaUrl(opts.phone, await buildChargeMessageAsync(opts));
