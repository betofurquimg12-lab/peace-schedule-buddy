import { z } from "zod";

// recurrence_mode: how the user picks recurrence
//  - none      : single appointment
//  - count     : N occurrences
//  - until     : until end date
//  - infinite  : up to a hard cap (52) so we don't generate forever
export const schema = z.object({
  patient_id: z.string().optional().or(z.literal("")),
  date: z.string().min(1),
  time: z.string().min(1),
  duration: z.coerce.number().min(10).max(480),
  modality: z.enum(["in_person", "online"]),
  price: z.coerce.number().min(0).max(99999),
  status: z.enum(["scheduled", "done", "canceled", "no_show"]),
  recurrence: z.enum(["none", "weekly", "biweekly"]),
  recurrence_mode: z.enum(["none", "count", "until", "infinite"]),
  occurrences: z.coerce.number().int().min(1).max(52),
  recurrence_end_date: z.string().optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  is_block: z.boolean().optional(),
  block_reason: z.string().max(500).optional().or(z.literal("")),
});

export const INFINITE_CAP = 52; // safety cap for "infinita"

export const toLocalDate = (d: Date) => d.toISOString().slice(0, 10);
export const toLocalTime = (d: Date) => d.toTimeString().slice(0, 5);

export const buildOccurrenceDates = (start: Date, mode: string, recurrence: string, occurrences: number, endDate: string): Date[] => {
  if (mode === "none" || recurrence === "none") return [start];
  const stepDays = recurrence === "weekly" ? 7 : 14;
  const dates: Date[] = [];
  if (mode === "count") {
    for (let i = 0; i < Math.min(occurrences, INFINITE_CAP); i++) {
      const d = new Date(start); d.setDate(d.getDate() + i * stepDays);
      dates.push(d);
    }
  } else if (mode === "until") {
    if (!endDate) return [start];
    const end = new Date(`${endDate}T23:59:59`);
    let i = 0;
    while (true) {
      const d = new Date(start); d.setDate(d.getDate() + i * stepDays);
      if (d > end) break;
      dates.push(d);
      i++;
      if (i > INFINITE_CAP) break;
    }
  } else if (mode === "infinite") {
    for (let i = 0; i < INFINITE_CAP; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i * stepDays);
      dates.push(d);
    }
  }
  return dates;
};
