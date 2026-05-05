# Plano: Lembretes de sessão (WhatsApp 1-clique + Google Calendar + alerta 5 min antes)

Três camadas combinadas, todas grátis:

1. **WhatsApp manual** — botão de 1 clique na agenda com mensagem pronta + link do Meet.
2. **Google Calendar** — lembretes automáticos por e-mail para o paciente (já que o paciente é convidado do evento).
3. **Alerta 5 min antes para você (psicóloga/secretária)** — uma notificação dentro do app que abre direto o WhatsApp com a mensagem pronta. Basta clicar "Enviar".

---

## Parte A — Botão de WhatsApp na Agenda

**Onde:** card de cada consulta (semana desktop e lista mobile) e dentro do `AppointmentDialog` ao editar.

**Comportamento:**
- Ícone do WhatsApp ao lado do nome do paciente. Só aparece se houver telefone.
- Clique abre `wa.me/55XXXXX` em nova aba com mensagem pré-preenchida:
  > Oi, {nome}! Passando para lembrar da sua sessão hoje às {hora}. Link da sala: {meet_link}. Qualquer coisa me avisa.
- Se for presencial (sem `meet_link`), a frase do link é omitida.
- Reaproveita `buildWaUrl` em `src/lib/format.ts`.

**Arquivos:**
- `src/pages/Agenda.tsx` — incluir `phone`, `meet_link` no select e botão nos cards.
- `src/components/agenda/AppointmentDialog.tsx` — botão "Enviar lembrete pelo WhatsApp" no rodapé ao editar.

---

## Parte B — Alerta automático 5 min antes (dentro do app)

Como o WhatsApp não pode ser enviado de forma 100% automática sem custo, a solução é: o app monitora a agenda e **5 minutos antes** de cada sessão mostra um pop-up/toast com o botão "Enviar WhatsApp agora" já carregado com a mensagem e o link do Meet.

**Como funciona (tudo no front, sem custo):**
- Hook global `useUpcomingSessionAlerts` rodando no `AppLayout` enquanto o usuário estiver logado.
- A cada 60 segundos, busca consultas das próximas 10 minutos.
- Quando uma consulta entra na janela de 5 min antes do início e ainda não foi alertada, abre um **toast persistente** (sonner) com:
  - Nome do paciente, horário, link do Meet.
  - Botão **"Abrir WhatsApp"** (mesma URL `wa.me` da Parte A).
  - Botão **"Dispensar"**.
- Para evitar repetir o alerta após dispensar/recarregar, marca como visto em `localStorage` (chave por `appointment_id`).
- Adicional: solicita permissão de notificação do navegador uma vez; se concedida, dispara também uma `Notification` nativa do sistema operacional — útil quando a aba está em background.

**Limitação honesta a comunicar ao usuário:** o alerta só dispara se o app estiver aberto numa aba do navegador (mesmo em background). Se o navegador estiver fechado, não toca. Por isso o Google Calendar (Parte C) entra como reforço.

**Arquivos novos:**
- `src/hooks/useUpcomingSessionAlerts.ts`
- `src/components/agenda/SessionAlertToast.tsx` (conteúdo do toast com os botões)

**Arquivo editado:**
- `src/components/AppLayout.tsx` — montar o hook quando autenticado.

---

## Parte C — Lembrete automático do Google Calendar para o paciente

A função `google-calendar-event` já cria evento com Meet e envia convite (`sendUpdates=all`). Hoje configura só 1 popup de 10 min. Vou ajustar `reminders.overrides` para:

- E-mail 1 dia antes (1440 min)
- E-mail 10 min antes
- Popup 5 min antes

Esses lembretes vão para o paciente **se ele tiver e-mail cadastrado** no agendamento. No `AppointmentDialog`, mostrar aviso discreto quando o paciente não tiver e-mail.

**Arquivo:**
- `supabase/functions/google-calendar-event/index.ts` — atualizar `reminders.overrides`.

---

## O que NÃO entra agora

- Envio automático de WhatsApp pelo servidor (precisaria Twilio pago — adiável).
- Templates editáveis em Configurações (próxima iteração).
- Job server-side (cron + edge function) para o alerta — desnecessário porque o disparo precisa de ação humana de qualquer jeito; rodar no cliente é suficiente e mais simples.
