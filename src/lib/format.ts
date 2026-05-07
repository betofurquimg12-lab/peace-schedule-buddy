/** Limpa um número e devolve só dígitos com DDI BR. */
export const sanitizePhoneToWa = (phone?: string | null) => {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
};

export const buildWaUrl = (phone?: string | null, message?: string) => {
  const num = sanitizePhoneToWa(phone);
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${num}${text}`;
};

export const formatBRL = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

const BR_TZ = "America/Sao_Paulo";

export const formatDateBR = (d: string | Date) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: BR_TZ });

export const formatTimeBR = (d: string | Date) =>
  new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: BR_TZ });

export const formatDateTimeBR = (d: string | Date) => `${formatDateBR(d)} ${formatTimeBR(d)}`;

export const formatWeekdayLongBR = (d: string | Date) =>
  new Date(d).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: BR_TZ });

export const formatWeekdayShortBR = (d: string | Date) =>
  new Date(d).toLocaleDateString("pt-BR", { weekday: "short", timeZone: BR_TZ });
