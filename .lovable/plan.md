## Problema

Em "Próximos atendimentos" (Início), todos os itens aparecem como "Paciente" porque os eventos importados do Google Calendar não têm `patient_id` vinculado. O componente usa `a.patient?.full_name ?? "Paciente"` como fallback.

## Mudança

**`src/pages/Dashboard.tsx`**

1. Na query de `upcoming`, incluir `external_summary` e `source` no `select`.
2. Renderizar o nome assim:
   - Se `patient?.full_name` existir → mostrar nome do paciente.
   - Senão, se `external_summary` existir → mostrar o resumo do Google (já vem com prefixo `[dia inteiro]` quando aplicável).
   - Senão → fallback "Sem título".
3. Aplicar a mesma lógica também na lista "Pagamentos pendentes" por consistência (incluir `external_summary` no select).
4. Opcional: mostrar um badge sutil "Google" ao lado de itens vindos do calendário externo (`source === 'google'`) para diferenciar — uso `<Badge variant="outline">` discreto.

Sem mudanças de schema, sem mudanças no fluxo de sincronização, sem alteração no card da Agenda.

## Validação

Recarregar `/` e conferir que os 5 próximos atendimentos mostram a descrição real do evento (ex.: "Reunião X", "[dia inteiro] Aniversário Y") em vez de "Paciente".
