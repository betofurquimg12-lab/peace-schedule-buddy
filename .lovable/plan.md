# Corrigir importação de eventos do Google Calendar

## Diagnóstico

O cron de sincronização está rodando a cada 5 minutos com sucesso (HTTP 200). A última execução retornou:

```
{"ok":true,"created":0,"updated":0,"deleted":0,"skipped":0,"total":12}
```

Ou seja, o Google está devolvendo **12 eventos**, mas nenhum entra na tabela `appointments`. O motivo está no `supabase/functions/google-calendar-sync/index.ts`:

```ts
const startISO = ev.start?.dateTime;
const endISO = ev.end?.dateTime;
if (!startISO || !endISO) { skipped++; continue; }
```

Eventos de **dia inteiro** no Google Calendar não têm `start.dateTime` — eles têm `start.date` (formato `YYYY-MM-DD`). Como toda a sua semana parece ter compromissos marcados como "dia inteiro" (ou ao menos parte deles), eles são descartados. Além disso, há um bug menor: nesse `continue` o `skipped` é incrementado, mas o resultado mostrou `skipped: 0` — sinal de que os 12 eventos estão caindo em outro caminho silencioso (possivelmente com `status` diferente de "confirmed" mas sem `dateTime`). Vou logar antes de descartar para confirmar.

## O que vou mudar

1. **`supabase/functions/google-calendar-sync/index.ts`**
   - Aceitar eventos de dia inteiro: quando `ev.start.date` existir, montar `startISO` como `YYYY-MM-DDT00:00:00-03:00` e `endISO` como `YYYY-MM-DDT23:59:59-03:00` (timezone São Paulo, igual ao resto do app).
   - Marcar esses eventos com uma flag visual no `external_summary` (prefixo "[dia inteiro] ") para a agenda diferenciar.
   - Adicionar `console.log` resumido por evento ignorado (id, status, presença de `dateTime`/`date`) para diagnosticar qualquer caso futuro.
   - Garantir que o contador `skipped` seja incrementado em todos os `continue` de descarte.
   - Retornar uma lista pequena com os IDs ignorados no JSON da resposta para facilitar debug pelo painel.

2. **`src/pages/Agenda.tsx`** (apenas se necessário após teste)
   - Confirmar que eventos de dia inteiro renderizam no card sem quebrar layout (eles vão durar das 00:00 às 23:59).
   - Se ficarem visualmente ruins ocupando o dia todo, mostrá-los como uma faixa fina no topo do dia em vez de bloco grande. Decido isso depois de ver o resultado real da sincronização.

3. **Não vou mexer** em `google-calendar-event` (criação/edição/delete a partir do app), pois esse fluxo está funcionando.

## Como vou validar

1. Após o deploy, rodo "Sincronizar agora" no card de Configurações → Google Calendar.
2. Consulto `appointments` filtrando `source = 'google'` para ver se aparecem os 12 (ou os que forem válidos).
3. Confiro o JSON de resposta da função e os logs para entender qualquer evento ainda ignorado.
4. Abro a tela /agenda na semana atual e verifico se os eventos do Google aparecem.

## Observação importante

O conector Google Calendar conecta a conta do desenvolvedor que autorizou (gessicafurquim@gmail.com). Está correto para o seu caso — você é dona dessa conta. Se um dia outras pessoas precisarem ver as próprias agendas, aí sim seria preciso OAuth por usuário, mas isso não é o que estamos fazendo agora.
