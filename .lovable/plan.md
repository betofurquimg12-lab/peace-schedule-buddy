## Objetivo

Centralizar a conexão com o Google Calendar **apenas** na tela de Configurações. Ao editar/salvar o vínculo (informando o e-mail), o sistema deve sincronizar imediatamente e não exigir nenhuma ação na Agenda.

## Mudanças

### 1. `src/components/settings/GoogleCalendarSyncCard.tsx`
- Tornar o card o único ponto de gerenciamento da integração:
  - Mostrar status do vínculo: "Conectado a `email@x.com`" ou "Não conectado".
  - Botão **Editar vínculo** abre o campo de e-mail (em estado inicial bloqueado quando já existe um vínculo).
  - Validar que o e-mail é obrigatório quando "Sincronização ativada" estiver ligada.
  - Ao clicar **Salvar vínculo**:
    1. `upsert` em `agenda_settings` (`google_sync_enabled`, `google_sync_email`).
    2. Em seguida, automaticamente invocar `supabase.functions.invoke("google-calendar-sync")`.
    3. Toast: "Vínculo salvo e sincronizado".
  - Manter botão **Sincronizar agora** para forçar sync manual sem alterar dados.
  - Tratar erros do invoke e mostrar toast destrutivo.

### 2. `src/pages/Agenda.tsx`
- Remover o botão **Sincronizar Google** do cabeçalho da Agenda (passa a viver só em Configurações).
- Remover o `useEffect` que chama `syncGoogle()` automaticamente ao trocar de semana, mantendo apenas leitura local de `appointments` (a sync acontece em Configurações ou via cron). Manter `load()` ao trocar `refDate`.
- Remover imports/estado não utilizados (`syncing`, `RefreshCw`, função `syncGoogle`).

### 3. (Opcional) `supabase/functions/google-calendar-sync/index.ts`
- Garantir que a função use o `google_sync_email` salvo (já deve usar). Sem mudanças se já consome a configuração.

## Resultado

- A Agenda fica enxuta, sem botão de sincronização.
- Toda configuração/edição do Google Calendar acontece em **Configurações → Google Calendar**: ativar/desativar, informar e-mail, salvar (que dispara a sincronização imediata) e botão de sincronizar manualmente.
