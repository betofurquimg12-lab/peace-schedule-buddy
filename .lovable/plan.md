## Parte 1 — Agenda: WhatsApp em eventos do Google

Hoje os botões de WhatsApp (lembrete e cobrança) só aparecem para eventos do sistema (`!ext && !isBlock && a.patient?.phone`). Vou:

1. **Mostrar os ícones** de WhatsApp (lembrete e cobrança) também em eventos vindos do Google (`source === "google"` e `!is_block` e `!is_vittude`), tanto no grid desktop quanto na lista mobile.
2. **Novo diálogo "Enviar WhatsApp"** (`WhatsAppExternalDialog`) acionado quando o evento não tem paciente vinculado:
   - Opção A: selecionar um paciente cadastrado (autocomplete por nome).
   - Opção B: informar manualmente nome + telefone (formato BR).
   - Campo de valor (default = `price` do evento, editável; usado na cobrança).
   - Botão "Enviar lembrete" e "Cobrar" no rodapé do diálogo.
3. **Vincular paciente ao evento**: se o usuário escolher um paciente cadastrado, ao confirmar o sistema faz `update appointments set patient_id = ?` para que o lançamento passe a aparecer vinculado ao paciente no financeiro e nas próximas interações.
4. Reaproveita `buildSessionWaUrlAsync` / `buildChargeWaUrlAsync` passando os dados informados.

Eventos do Google que já tiverem `patient_id` (caso raro) seguem o fluxo direto, sem diálogo.

## Parte 2 — Financeiro: aba "Pagos"

1. Nova aba **"Pagos"** em `Financeiro.tsx`, entre "A receber (Mês)" e "Vittude".
2. Query: `payments` com `paid_at` não nulo, dentro do mês selecionado (filtro `paid_at >= range.start` e `< range.end`), incluindo `appointment(starts_at, patient.full_name)`, ordenados por `paid_at desc`.
3. Também incluir `finance_entries` do tipo `credit` no mês (lançamentos manuais já pagos), mesclados pela `entry_date` para mostrar o "recebido" completo.
4. **Totalizador no topo da listagem**: card com "Total recebido no mês" = soma dos `payments.amount` pagos no mês + créditos manuais.
5. Linhas mostram: data de pagamento, paciente/descrição, método, valor, e botão de excluir (mesma `removePay` / `removeEntry` existentes).
6. Paginação com a estrutura `pages` existente (nova chave `paid`).

## Arquivos a alterar

- `src/pages/Agenda.tsx` — mostrar ícones WA em eventos Google; abrir novo diálogo quando faltar paciente.
- `src/components/agenda/WhatsAppExternalDialog.tsx` — **novo** componente (busca paciente, input manual, valor, envio).
- `src/pages/Financeiro.tsx` — nova aba "Pagos", nova query, totalizador, paginação.

Sem mudanças de banco de dados nem de edge functions.
