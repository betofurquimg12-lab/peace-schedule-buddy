## Objetivo

Corrigir o e-mail exibido no card do Google Calendar e tornar o toggle "ativar/desativar sincronização" realmente funcional.

## Mudanças

### 1. Frontend — `src/components/settings/GoogleCalendarSyncCard.tsx`
- Exibir sempre `gessicafurquim@gmail.com` como conta conectada (constante fixa). Parar de ler/exibir `google_sync_email` do banco.
- Manter o toggle e o botão "Sincronizar agora".

### 2. Banco — limpar dado obsoleto
- `UPDATE agenda_settings SET google_sync_email = NULL` (via tool de insert/update). O campo permanece na tabela, mas sem valor enganoso.

### 3. Edge function `supabase/functions/google-calendar-event/index.ts`
Antes de chamar a Google Calendar API, ler `agenda_settings.google_sync_enabled` (uma linha — owner). Se `false`:
- Para `create`/`update`: retornar `{ ok: true, event_id: null, meet_link: null, html_link: null, skipped: true }` sem chamar o Google.
- Para `delete`: retornar `{ ok: true, skipped: true }` sem chamar o Google.

### 4. Edge function `supabase/functions/google-calendar-sync/index.ts`
No início, ler `agenda_settings.google_sync_enabled`. Se `false`, retornar `{ ok: true, skipped: true }` imediatamente sem importar nada.

## O que NÃO muda
- Nenhuma migração de schema.
- Lógica de criação de agendamentos no app continua chamando a edge function normalmente — a função é que decide pular.
- RLS, autenticação e tipos: inalterados.

## Arquivos afetados
- `src/components/settings/GoogleCalendarSyncCard.tsx`
- `supabase/functions/google-calendar-event/index.ts`
- `supabase/functions/google-calendar-sync/index.ts`
- 1 update no banco (limpar `google_sync_email`).