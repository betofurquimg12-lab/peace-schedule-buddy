## Problema

Hoje a grade semanal da Agenda (desktop) renderiza cada evento dentro de um único slot fixo de 1 hora, mostrando apenas o horário de início. Eventos do Google Calendar (e do sistema) com duração diferente de 50 min — por exemplo 1h30, 2h — aparecem visualmente do mesmo tamanho que uma sessão padrão, dando a impressão errada de horário livre logo abaixo.

A duração real já vem correta do banco (`duration_minutes`, `starts_at`, `ends_at`), o problema é puramente de renderização.

## Mudanças propostas

Apenas em `src/pages/Agenda.tsx` (frontend / visual):

1. **Grade desktop com altura proporcional à duração**
   - Cada linha de hora tem altura fixa (`min-h-[56px]`). Vou tratar essa altura como `HOUR_PX = 56` e posicionar os eventos absolutamente dentro da célula da hora de início, com:
     - `top = (minutosDoInício % 60) / 60 * HOUR_PX`
     - `height = duration_minutes / 60 * HOUR_PX` (mínimo ~24px para legibilidade)
   - Assim um evento de 1h30 às 14:00 ocupa visualmente da linha 14:00 até a metade da linha 15:00, e o restante da linha 15:00 continua clicável para criar novo evento.

2. **Exibir intervalo início–fim no bloco**
   - Trocar `{hm(a.starts_at)}` por `{hm(a.starts_at)} – {hm(a.ends_at)}` no card do evento, igual já é feito na visão mobile (linha 186). Isso deixa explícita a duração real para o usuário.

3. **Mobile (lista por dia)**
   - Já mostra `hm(starts_at) – hm(ends_at)`. Nenhuma mudança necessária.

## Fora de escopo

- Sync com Google: a função `google-calendar-sync` já calcula `duration_minutes` corretamente a partir de `start.dateTime`/`end.dateTime`, não precisa mudar.
- Banco de dados / migrations: nenhuma mudança.
- Lógica de criação/edição de eventos: nenhuma mudança.

## Detalhes técnicos

- O filtro `slotAppts` continua usando `dt.getHours() === h` (a célula da hora de início "hospeda" o evento), mas o card passa a usar `position: absolute` com `top`/`height` calculados, e a célula recebe `position: relative` e overflow visível controlado. Eventos que atravessam várias horas aparecerão por cima das células seguintes sem bloquear o clique nas linhas livres (uso `pointer-events-auto` só no card).
- Quando há múltiplos eventos começando na mesma hora (raro mas possível), eles continuam empilhados verticalmente como hoje dentro do espaço de 1h — mantenho o comportamento atual para não regressar nada.