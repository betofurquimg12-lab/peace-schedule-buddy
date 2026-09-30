# Cobrança de ausências e modo de emissão de notas

## Objetivo
Adicionar o modo de emissão de nota por paciente, permitir decidir se cancelamentos e faltas serão cobrados e refletir essas regras nas telas financeiras.

## Alterações
- Criar uma migração com `patients.nota_modo` limitado a `por_sessao` ou `mensal`, e `appointments.cobrar_ausencia` opcional.
- Atualizar os tipos locais dessas duas tabelas.
- No cadastro do paciente, exigir e salvar o modo da nota quando “Emite nota fiscal” estiver marcado.
- Na aba de notas, carregar e exibir o modo escolhido ao lado do nome.
- Na consulta, exigir a decisão de cobrança para status “Cancelada” ou “Faltou”, preservando-a somente nesses status.
- Impedir que uma sessão já paga seja marcada como não cobrada; remover lançamento financeiro não pago quando aplicável.
- Aplicar a regra de sessão faturável em consultas, totais, fechamento e listas a receber.
- Filtrar “A receber” e “Vittude” pelo mês selecionado, mantendo “A receber (Mês)” global e zerando paginações ao trocar o mês.
- Destacar os agrupamentos mensais, adicionar cobrança por WhatsApp nas duas listas solicitadas, remover a lixeira duplicada em “Pagos” e permitir voltar um fechamento para pendente.

## Detalhes técnicos
- A migração será aplicada ao Lovable Cloud e mantida no histórico do projeto.
- A cobrança por WhatsApp reutilizará a regra existente: link cadastrado usa cartão; sem link usa PIX.
- A decisão de cobrança não será propagada para outras sessões de uma recorrência; somente a sessão atual recebe o status e `cobrar_ausencia`.
- A listagem “A receber (Mês)” continuará agrupando todos os meses, conforme solicitado.

## Validação
- Conferir a compilação automática após as alterações.
- Verificar os fluxos visuais de cadastro, edição de consulta e abas financeiras no preview.
