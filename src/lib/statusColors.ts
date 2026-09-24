export type ApptStatus = "scheduled" | "done" | "canceled" | "no_show";

export const STATUS_ORDER: ApptStatus[] = ["scheduled", "done", "canceled", "no_show"];

export const STATUS_LABELS: Record<ApptStatus, string> = {
  scheduled: "Agendada",
  done: "Realizada",
  canceled: "Cancelada",
  no_show: "Faltou",
};

export const DEFAULT_STATUS_COLORS: Record<ApptStatus, string> = {
  scheduled: "#DCEBE2",
  done: "#BFD9C9",
  canceled: "#F1DAD6",
  no_show: "#F5E3C0",
};

export const mergeStatusColors = (v: unknown): Record<ApptStatus, string> =>
  ({ ...DEFAULT_STATUS_COLORS, ...(v && typeof v === "object" ? (v as Record<string, string>) : {}) });

export const textColorFor = (hex: string) => {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#1F2A24";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.55 ? "#1F2A24" : "#FFFFFF";
};