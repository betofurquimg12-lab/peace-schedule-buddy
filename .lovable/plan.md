## Objetivo

Deixar a tela de Configurações honesta sobre como funciona a integração com o Google Calendar hoje: existe **uma única conta conectada** no nível do app (via Connectors do Lovable), e não há como cada usuário escolher um e-mail diferente sem implementar OAuth próprio.

## O que vai mudar (apenas frontend)

Reescrever o card `GoogleCalendarSyncCard` em `src/components/settings/GoogleCalendarSyncCard.tsx`:

1. **Remover o campo editável de e-mail.** Hoje ele dá a falsa impressão de que troca a agenda — mas não troca.
2. **Mostrar o estado real da conexão:**
   - "Conta conectada: `gessicafurquim@gmail.com`" (valor lido de `agenda_settings.google_sync_email`, ou um fallback fixo informativo se vazio).
   - Status verde/cinza indicando se a sincronização está ativa.
3. **Manter:**
   - O `Switch` "Sincronização ativa" (continua salvando `google_sync_enabled` em `agenda_settings`).
   - O botão "Sincronizar agora" (chama a edge function `google-calendar-sync`).
4. **Adicionar um aviso claro** explicando:
   > "A conta Google usada para criar eventos e links do Meet é definida no nível do app. Para trocá-la, é necessário desconectar e reconectar a integração em **Connectors → Google Calendar**, ou solicitar essa troca."
5. **Adicionar um botão "Abrir Connectors"** que aponta para a área de conectores (link informativo), já que a troca real acontece lá.

## O que NÃO vai mudar

- Banco de dados: nenhuma migração. Os campos `google_sync_enabled` e `google_sync_email` em `agenda_settings` continuam existindo (o e-mail vira somente leitura/exibição).
- Edge functions `google-calendar-event` e `google-calendar-sync`: continuam usando o conector compartilhado.
- Lógica de criação de agendamentos e links do Meet: idêntica.

## Arquivos afetados

- `src/components/settings/GoogleCalendarSyncCard.tsx` — reescrita do card.

## Detalhes técnicos

- O `useEffect` continua carregando `agenda_settings` para ler `google_sync_enabled` e `google_sync_email` (apenas exibição).
- `save()` passa a salvar somente o toggle `google_sync_enabled`; remove a lógica de upsert de e-mail.
- `syncNow()` permanece igual.
- Sem mudança em rotas, contextos, RLS ou tipos.

## Caminho futuro (não incluído nesta entrega)

Se mais adiante quiser permitir que cada usuário escolha sua própria conta Google pela tela, será necessário criar credenciais OAuth próprias no Google Cloud Console e implementar fluxo OAuth por usuário com armazenamento de `refresh_token` por user_id. Fica registrado para conversa futura.