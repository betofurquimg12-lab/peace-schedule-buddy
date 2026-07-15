import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_appointment",
  title: "Create appointment",
  description: "Create a new appointment for a patient.",
  inputSchema: {
    patient_id: z.string().uuid(),
    starts_at: z.string().describe("ISO timestamp"),
    ends_at: z.string().describe("ISO timestamp"),
    notes: z.string().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ patient_id, starts_at, ends_at, notes }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("appointments")
      .insert({ patient_id, starts_at, ends_at, notes, created_by: ctx.getUserId(), status: "scheduled" })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { appointment: data } };
  },
});
