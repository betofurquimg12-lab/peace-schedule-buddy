## Visão Geral
App web para sua esposa (psicóloga) gerenciar atendimentos, com acesso também para secretária(s). Inclui agenda, cadastro de pacientes, integração com WhatsApp e Google Calendar, e controle financeiro das sessões.

## 1. Autenticação e Papéis
- Login por **e-mail/senha** e **Google**.
- Dois papéis:
  - **Psicóloga (owner)** → acesso total, incluindo notas clínicas e financeiro.
  - **Secretária** → cadastra pacientes, agenda consultas e marca pagamentos. **Não vê notas clínicas.**
- Tela para a psicóloga convidar/remover secretárias por e-mail.

## 2. Cadastro de Pacientes
- Campos obrigatórios: **nome** + **telefone OU e-mail**.
- Campos opcionais: data de nascimento, endereço resumido, responsável (se menor).
- **Dados clínicos simples**: queixa principal, histórico breve, observações por sessão (visível só para a psicóloga).
- **Valor da sessão por paciente** (configurável individualmente, usado como padrão ao agendar).
- Botão **"Abrir WhatsApp"** → abre `wa.me/<telefone>` em nova aba, com templates rápidos (confirmação, lembrete, reagendamento).
- Histórico de sessões e situação financeira do paciente na ficha.

## 3. Calendário e Agendamentos
- Visualização **mês / semana / dia**, responsiva.
- Criar agendamento direto da grade (clique no horário) ou pelo botão "+ Nova consulta".
- Campos do agendamento: paciente, data/hora, duração (padrão 50min), modalidade (presencial/online), valor (puxa do paciente, editável), status (agendada / realizada / cancelada / faltou).
- Detecção de conflito de horário com aviso.
- Suporte a **recorrência** (semanal, quinzenal).
- Arrastar para reagendar.

## 4. Controle Financeiro
- Cada sessão tem **valor** e **status de pagamento**: Pendente / Pago.
- Ao marcar como pago: registrar **data de pagamento** e **forma** (Pix, dinheiro, cartão, transferência).
- Tela **"Financeiro"** com:
  - **Resumo mensal**: total recebido, total pendente, nº de atendimentos realizados, ticket médio.
  - **Por paciente**: extrato com sessões, valores, pago/pendente e saldo devedor.
  - Filtros por período e por status.
- Botão "Cobrar via WhatsApp" em sessões pendentes → abre `wa.me` com mensagem pré-pronta do valor em aberto.

## 5. Dashboard Inicial
- Próximos atendimentos do dia/semana.
- Pacientes com pagamento pendente.
- Resumo rápido do mês (faturamento e sessões).

## 6. Integração Google Calendar (bidirecional, só da psicóloga)
- A psicóloga conecta a conta Google nas configurações (OAuth).
- Sincronização bidirecional do calendário principal:
  - Agendamentos criados no app aparecem no Google Calendar.
  - Eventos criados/movidos no Google se refletem no app.
- Secretária **não** conecta calendário próprio — ela vê e edita o calendário da psicóloga dentro do app.
- *Observação:* essa integração exige configuração de credenciais OAuth no Google Cloud Console (Client ID e Secret). Faremos isso em uma etapa dedicada, e eu te guio passo a passo quando chegarmos lá.

## Ordem de Construção
1. **Fundação**: login, papéis (psicóloga/secretária), convites.
2. **Pacientes**: cadastro, ficha, valor por paciente, notas clínicas, botão WhatsApp.
3. **Calendário**: agenda visual, criar/editar/recorrência, status da sessão.
4. **Financeiro**: marcação de pagamento, resumo mensal e extrato por paciente, cobrança via WhatsApp.
5. **Dashboard**: visão geral.
6. **Google Calendar**: OAuth + sincronização bidirecional.

Vou começar pelas etapas 1 a 5 assim que aprovar. A etapa 6 entra logo em seguida, com as instruções para gerar as credenciais Google.
