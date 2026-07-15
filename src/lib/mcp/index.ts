import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listPatients from "./tools/list-patients";
import getPatient from "./tools/get-patient";
import listAppointments from "./tools/list-appointments";
import createAppointment from "./tools/create-appointment";
import listFinanceEntries from "./tools/list-finance-entries";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "clinica-mcp",
  title: "Clínica — Agendamento MCP",
  version: "0.1.0",
  instructions:
    "Ferramentas para gerenciar pacientes, agendamentos e financeiro da clínica. Use list_patients para buscar pacientes, list_appointments para consultar a agenda, create_appointment para agendar, e list_finance_entries para consultar o financeiro. Todas as ações respeitam as permissões do usuário autenticado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listPatients, getPatient, listAppointments, createAppointment, listFinanceEntries],
});
