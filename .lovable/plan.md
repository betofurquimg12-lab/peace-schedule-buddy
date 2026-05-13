
## Visão geral

Mudança grande envolvendo schema, sync com Google Calendar, Financeiro, Agenda, Dashboard e ficha do paciente. Vou agrupar em blocos para facilitar revisão e implementação.

---

## 1. Banco de dados (migração)

Adicionar colunas em `appointments`:

- `is_vittude boolean not null default false` — marca atendimentos da plataforma Vittude (sem pagamento direto, listados em aba própria).
- `is_block boolean not null default false` — distingue bloqueios de horário de sessões.
- `block_reason text` — motivo opcional do bloqueio.

Não vou criar enum novo de "status de pagamento" — Vittude vira uma flag, e os outros estados (pago / a receber / pendente) continuam derivados da tabela `payments`. Isso evita migração de enum complexa e mantém coerência com a UI atual.

Sem mudanças em RLS (as policies de `appointments` cobrem as novas colunas).

## 2. Sincronização Google Calendar (`google-calendar-sync`)

- **Exclusão automática:** já existe (`ev.status === 'cancelled'` deleta a linha local). Vou reforçar tratando também o caso "evento sumiu": fazer um diff entre `google_event_id`s retornados pela API e os existentes em DB com `source='google'` na janela `[past, future]`, e deletar os que não vieram mais (cobre exclusões "hard").
- **Detecção Vittude:** se `ev.summary` contém "Vittude" (case-insensitive), extrair o nome do paciente (regex: remove o prefixo `Vittude - Consulta Virtual com `, fallback para o que vier depois do último " com "), salvar como `external_summary` apenas o nome limpo, marcar `is_vittude=true` e tentar vincular `patient_id` via match exato `lower(full_name)`.
- **Bloqueios:** eventos do Google que não são Vittude continuam entrando como `source='google'` (já são tratados como "bloqueio" hoje no UI). Não preciso de mudança extra aqui.

## 3. Agenda (`Agenda.tsx` + `AppointmentDialog.tsx`)

### Agenda (página)
- Botão **"Sincronizar"** no header, ao lado de "Nova consulta", que invoca `supabase.functions.invoke("google-calendar-sync")` e recarrega.
- Card visual diferente para `is_block` (cor mais escura, rótulo "Bloqueado") e para `is_vittude` (tag "Vittude").
- Eventos Vittude exibem só o nome limpo do paciente (já vem normalizado do sync).

### Dialog de agendamento
- Toggle no topo **"Bloqueio de agenda"**. Quando ativo, formulário simplifica para: data/hora início, data/hora fim, motivo (textarea), recorrência. Sem paciente/preço/pagamento. Salva com `is_block=true`, `patient_id=null`, `price=0`, `source='system'`.
- Novo valor **"Vittude"** no select "Status do pagamento". Quando selecionado: oculta data e forma de pagamento, define `is_vittude=true` ao salvar e não cria linha em `payments`. Ao reabrir, detecta `is_vittude` e pré-seleciona "Vittude".
- Tag "Vittude" editável no diálogo (checkbox/toggle independente, espelha `is_vittude`).
- **Excluir com recorrência:** se `recurrence_group_id` existir, abrir modal com 3 opções:
  - Apenas este evento → delete só `appointment.id`.
  - Este e os próximos → delete `recurrence_group_id = X AND starts_at >= appointment.starts_at`.
  - Todos → delete `recurrence_group_id = X`.
  Para cada um, chamar `syncCalendar('delete', ...)` antes do delete em DB.
- **Bug recorrência ao editar status:** atualmente, `recurrenceChanged` não dispara ao mudar só status, então o caminho "edit single" é seguido (correto). Vou auditar e garantir que o UPDATE tem `.eq("id", appointment.id)` (já tem) e que nenhum outro caminho propaga. Adicionar guarda explícita: ao editar appointment de série, alterações de `status`, `notes`, `price`, `payment_*` afetam só esta linha — nunca tocam siblings. Documentar via comentário.

## 4. Financeiro (`Financeiro.tsx`)

Reordenar abas para: **A receber | A receber (Mês) | Vittude | Lançamentos | Por paciente | Geral**.

- **A receber** (nova lógica, sem filtro de mês): consulta global `appointments` onde `is_block=false`, `is_vittude=false`, `status not in ('canceled','no_show')`, sem pagamento ou com pagamento não-pago. Lista achatada ordenada por `starts_at`.
- **A receber (Mês):** mesma query, agrupada por `YYYY-MM` de `starts_at` com subtotal por mês. Itens sem `starts_at` (não deve acontecer hoje) ou explicitamente sem previsão (futuro: pagamentos sem `due_date` em pacientes recorrentes) vão para grupo **"Sem Previsão"** no fim.
- **Vittude:** consulta `appointments` com `is_vittude=true`, sem filtro de mês, ordenada por `starts_at desc`. Mostra paciente + data, sem coluna de valor/pagamento (ou apenas informativo).
- **Lançamentos / Por paciente / Geral:** mantêm comportamento atual ("Geral" = aba "Sessões" renomeada).
- Bloqueios (`is_block=true`) ficam fora de todas as abas/cálculos do Financeiro.
- Cards de resumo no topo passam a excluir Vittude e bloqueios.

## 5. Status automático "Realizada"

Implementar via **trigger / função agendada**:
- Criar função `public.mark_past_appointments_done()` que faz `UPDATE appointments SET status='done' WHERE status='scheduled' AND ends_at < now() AND is_block=false`.
- Agendar via `pg_cron` a cada 15 min (já há infra para cron neste projeto).
- Backup client-side: ao carregar Dashboard/Agenda, chamar a mesma função via RPC (`supabase.rpc('mark_past_appointments_done')`) para feedback imediato.

## 6. Dashboard (`Dashboard.tsx`)

- Card **"Sessões realizadas no mês"**: já conta `status='done'` no mês — manter, mas garantir exclusão de `is_block=true` e `is_vittude` opcionalmente incluída (incluir, pois Vittude também é sessão realizada).
- Novo card **"Próxima sessão hoje"**: primeira appointment com `starts_at >= now()` e `starts_at < amanhã`, `is_block=false`. Mostra horário + nome do paciente; tag "Vittude" se `is_vittude`. Substitui um dos cards existentes ou entra como 5º (4 hoje + 1 = grid `lg:grid-cols-5`).
- **Aviso de bloqueios do dia:** card destacado listando bloqueios de hoje (`is_block=true` no intervalo do dia), com horário e motivo.
- "Próximos atendimentos" e "Pagamentos pendentes": filtrar `is_block=false`.

## 7. Ficha do paciente (`PatientDetail.tsx`)

Adicionar seção **"Próximas sessões"** acima ou ao lado do histórico, com query `appointments` do paciente onde `starts_at >= now()` ordenado asc, mostrando data/hora, modalidade, status, valor.

---

## Detalhes técnicos

```text
appointments (novas colunas)
├── is_vittude  bool   default false
├── is_block    bool   default false
└── block_reason text  null
```

```sql
-- Função e cron para auto-realizar
create or replace function public.mark_past_appointments_done()
returns void language sql security definer set search_path=public as $$
  update public.appointments
     set status = 'done'
   where status = 'scheduled'
     and ends_at < now()
     and is_block = false;
$$;

select cron.schedule('mark-past-appointments-done', '*/15 * * * *',
  $$ select public.mark_past_appointments_done(); $$);
```

Sync Vittude (extrato):

```ts
const isVittude = /vittude/i.test(ev.summary ?? '');
const cleanName = (ev.summary ?? '')
  .replace(/^Vittude\s*-\s*Consulta\s*Virtual\s*com\s*/i, '')
  .trim();
```

Modal de delete com recorrência: novo `<AlertDialog>` com 3 botões; chama helper `deleteRecurrence(scope: 'one'|'forward'|'all')`.

## Validação

1. Criar evento "Vittude - Consulta Virtual com Maria" no Google → após sync aparece com nome "Maria" + tag Vittude na Agenda, e na aba "Vittude" do Financeiro.
2. Excluir esse evento no Google → some do sistema na próxima sync (ou ao clicar Sincronizar).
3. Criar bloqueio na Agenda → aparece com visual escuro, não aparece no Financeiro, aparece como aviso no Dashboard.
4. Criar série recorrente, mudar status de uma sessão → só ela muda.
5. Excluir sessão de série → modal aparece com 3 opções e cada uma comporta-se corretamente.
6. Sessão `scheduled` de ontem → vira `done` automaticamente após cron rodar (ou imediatamente ao abrir Dashboard).
7. Abas do Financeiro na ordem nova; "A receber (Mês)" agrupa corretamente.
8. Ficha do paciente mostra próximas sessões.

