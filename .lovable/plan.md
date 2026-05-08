## Objetivo

Três frentes interligadas:
1. Templates de mensagem editáveis em **Configurações** (WhatsApp lembrete, WhatsApp cobrança, E-mail confirmação, E-mail lembrete).
2. Botão **$** na agenda (card e diálogo) que abre o WhatsApp já com a mensagem de cobrança preenchida.
3. Configurar o **servidor de e-mail (Lovable Emails)** para os lembretes automáticos e confirmações.

---

## 1. Banco — nova tabela de templates

Criar `message_templates` (uma linha por chave + owner):

| coluna | tipo |
|---|---|
| `id` | uuid PK |
| `owner_id` | uuid (FK auth.users) |
| `key` | text — `wa_reminder` \| `wa_charge` \| `email_confirmation` \| `email_reminder` |
| `subject` | text (usado só nos templates de e-mail) |
| `body` | text |
| `created_at` / `updated_at` | timestamptz |

Constraints: `unique(owner_id, key)`. RLS: leitura para qualquer membro da clínica (`is_clinic_member`); insert/update/delete só para `owner` dono. Trigger de `updated_at`.

Seed automático: quando um template é lido e não existe, o frontend cria com o texto padrão.

### Variáveis suportadas (substituídas em runtime no cliente/servidor)

- `{paciente}`, `{primeiro_nome}`
- `{data}`, `{hora}`, `{quando}` (ex.: "hoje às 15:00")
- `{valor}` (formatado BRL)
- `{meet}` (link do Meet, vazio se não houver)
- `{pix}` (chave PIX — vem do template, ou seja, o usuário digita a chave dentro do próprio texto editável; a variável só existe para reuso entre templates se o usuário quiser)
- `{psicologa}` (nome do owner do `profiles`)

Defaults:
- **wa_reminder**: `Oi, {primeiro_nome}! Passando para lembrar da sua sessão {quando}. {meet} Qualquer coisa me avisa.`
- **wa_charge**: `Oi, {primeiro_nome}! Passando o valor da sessão de {data} às {hora}: {valor}. Pode pagar via PIX para a chave: <coloque sua chave aqui>. Obrigada!`
- **email_confirmation** (subject): `Sessão confirmada — {data} às {hora}` / body com saudação, dados, link Meet.
- **email_reminder** (subject): `Lembrete: sua sessão {quando}` / body com link Meet.

---

## 2. Configurações — novo card "Mensagens"

Novo arquivo `src/components/settings/MessageTemplatesCard.tsx`:
- Tabs com 4 abas (WhatsApp lembrete, WhatsApp cobrança, E-mail confirmação, E-mail lembrete).
- Cada aba: campo `subject` (apenas e-mails) + `Textarea` grande para `body`.
- Lista de variáveis disponíveis com botões "inserir" que injetam `{token}` na posição do cursor.
- Botões Salvar / Restaurar padrão.
- Apenas `owner` pode editar (checa `role` do `useAuth`).

Renderizado dentro de `src/pages/Settings.tsx` (entre `AgendaSettingsCard` e `GoogleCalendarSyncCard`).

Helper `src/lib/messageTemplate.ts`:
- `renderTemplate(text, vars)` — substitui placeholders.
- `loadTemplate(key)` — busca/cria com defaults.
- `DEFAULT_TEMPLATES` — fonte única dos textos padrão.

---

## 3. Agenda — botão $ + uso dos templates

Atualizar `src/lib/sessionReminder.ts`:
- `buildSessionReminderMessage` passa a aceitar opcionalmente um `template` (string) e usa `renderTemplate`. Se nenhum template for passado, mantém o texto atual como fallback.
- Nova função `buildChargeMessage({ template, patientName, startsAt, price })`.

Em `src/pages/Agenda.tsx`:
- Carregar `wa_reminder` e `wa_charge` em `useEffect` uma vez (cache em estado).
- Adicionar botão `<DollarSign>` ao lado do botão WhatsApp, em **ambas** as renderizações (linhas ~143 e ~235), com `aria-label="Cobrar via WhatsApp"`. `href` = `buildWaUrl(patient.phone, renderedChargeMessage)`. Esconder quando o paciente não tiver telefone.

Em `src/components/agenda/AppointmentDialog.tsx`:
- Adicionar botão $ no rodapé de ações (próximo do botão WhatsApp existente na linha 646), mesmo comportamento.

---

## 4. Lembretes por e-mail — infraestrutura

Como não há domínio de e-mail configurado ainda, o primeiro passo é o usuário fazer o setup do domínio de envio. Depois disso, eu cuido do resto automaticamente:

1. **Configurar domínio de envio** (passo manual do usuário via diálogo).
2. **Configurar a infraestrutura de e-mail** (filas, tabelas, cron — automático).
3. **Criar templates de e-mail** (`appointment-confirmation` e `appointment-reminder`) usando React Email; o conteúdo do `body`/`subject` vem da tabela `message_templates` via `templateData`, então eles permanecem editáveis em Configurações.
4. **Edge function `appointment-email`**: chamada quando um agendamento é criado (e re-chamada para lembretes via cron). Lê o template do banco, renderiza placeholders, e invoca `send-transactional-email`.
5. **Cron de lembretes**: estende a lógica que já existe em `agenda_settings` (`reminder_email_before_minutes` etc.). Edge function `process-appointment-reminders` rodando a cada 1 min via `pg_cron`, varrendo agendamentos cujo `starts_at - reminder_email_before_minutes <= now() < starts_at` e que ainda não têm `reminder_sent_at`. Marca `reminder_sent_at = now()` ao enfileirar.
6. **Trigger de confirmação**: ao inserir um `appointment` com `source = 'system'` e `patient.email` preenchido, o app dispara `appointment-email` com tipo `confirmation`.

---

## 5. Arquivos afetados / criados

**Novos**
- `src/components/settings/MessageTemplatesCard.tsx`
- `src/lib/messageTemplate.ts`
- `supabase/functions/appointment-email/index.ts`
- `supabase/functions/process-appointment-reminders/index.ts`
- `supabase/functions/_shared/transactional-email-templates/appointment-confirmation.tsx`
- `supabase/functions/_shared/transactional-email-templates/appointment-reminder.tsx`

**Editados**
- `src/lib/sessionReminder.ts` — suporta template customizado e cobrança.
- `src/pages/Agenda.tsx` — botão $ nos cards + carregar templates.
- `src/components/agenda/AppointmentDialog.tsx` — botão $ no rodapé.
- `src/pages/Settings.tsx` — incluir `<MessageTemplatesCard />`.

**Migração SQL** — criar `message_templates` com RLS + trigger.

---

## 6. Ordem de execução

1. Migração `message_templates` (aprovação do usuário).
2. Helper + card de templates + botão $ na agenda (entrega imediata, funciona com WhatsApp sem depender de e-mail).
3. Pedir ao usuário que configure o domínio de envio (diálogo).
4. Após setup do domínio: infraestrutura de e-mail + edge functions + cron.

---

## Pergunta aberta resolvida
- **PIX**: vai como texto livre dentro do template `wa_charge` (o usuário digita a chave/instrução no próprio editor). Sem campo separado no banco.