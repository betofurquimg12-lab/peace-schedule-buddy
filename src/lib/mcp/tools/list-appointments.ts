import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_appointments",
  title: "List appointments",
  description: "List appointments in a date range. Dates are ISO 8601 timestamps.",
  inputSchema: {
    from: z.string().describe("Start ISO timestamp (inclusive)."),
    to: z.string().describe("End ISO timestamp (exclusive)."),
    patient_id: z.string().uuid().optional().describe("Filter by patient id."),
    limit: z.number().int().min(1).max(500).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, patient_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("appointments")
      .select("id, patient_id, starts_at, ends_at, status, external_summary, is_vittude, is_block, block_reason, notes, source")
      .gte("starts_at", from)
      .lt("starts_at", to)
      .order("starts_at")
      .limit(limit ?? 200);
    if (patient_id) q = q.eq("patient_id", patient_id);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { appointments: data ?? [] } };
  },
});
