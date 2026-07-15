import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_finance_entries",
  title: "List finance entries",
  description: "List financial entries in a date range.",
  inputSchema: {
    from: z.string().describe("Start date ISO (inclusive)."),
    to: z.string().describe("End date ISO (exclusive)."),
    status: z.string().optional().describe("Filter by status (e.g. pago, a_receber)."),
    limit: z.number().int().min(1).max(500).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("finance_entries")
      .select("*")
      .gte("entry_date", from)
      .lt("entry_date", to)
      .order("entry_date", { ascending: false })
      .limit(limit ?? 200);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { entries: data ?? [] } };
  },
});
