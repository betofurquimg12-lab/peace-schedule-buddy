import { buildWaUrl } from "./format";

export const buildSessionReminderMessage = (opts: {
  patientName: string;
  startsAt: string | Date;
  meetLink?: string | null;
}) => {
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

export const buildSessionWaUrl = (opts: {
  phone?: string | null;
  patientName: string;
  startsAt: string | Date;
  meetLink?: string | null;
}) => buildWaUrl(opts.phone, buildSessionReminderMessage(opts));
