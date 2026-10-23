# Roadmap

- [ ] OK Entrega: consultar validação no portal para roteirizações a partir de 22/10/2026; medir a duração da consulta do dia 22; atualização diária às 07h e 17h de Brasília. Ativação recorrente depende da estimativa de custo e autorização de Anderson; primeiro verificar acesso e método de consulta.

- [ ] Analisar em 24/10/2026 o incidente relatado por Anderson em 23/10: motorista marcou reentrega indevidamente; Gilson desfez a baixa na prestação de contas, mas a NF apareceu na Preparação em vez de retornar ao motorista para inclusão do canhoto e baixa correta. Anderson autorizou investigação somente, sem mudanças operacionais. Confirmado no banco: registrar reentrega remove vínculo com veículo, limpa agenda e define CARGA NO DEPOSITO; excluir a baixa não tem gatilho inverso. Histórico recente: Gilson desfez três reentregas de KWN4F37 em 22/10 (NFs 4360543, 4377613, 4360546), hoje todas entregues; NF 4359314/LPY9J85 teve reentrega desfeita em 21/10 e outra reentrega registrada cinco minutos depois, hoje sem vínculo. Bloqueador: obter número da NF e placa do incidente para confirmar qual sequência corresponde ao relato; não presumir que seja LOW9508.

- [x] 16/10: consulta de endereços/coordenadas restrita a perfis ativos na tabela e nas funções geocodificar-endereco/backfill-geocode. Cinco testes passaram; sessão aprovada consultou o cache e anônimo não recebeu dados. Histórico disponível não permite atribuir ou contar consultas anteriores das contas externas; não confundir ausência de registro com ausência de acesso.

- [x] 16/10: sete contas externas e cadastro antigo do Gilson excluídos; conta @tlmlogistica.com.br preservada, ativa e com sessão mantida. Exclusão confirmada e ferramenta temporária removida.

- [x] Organizar o menu em pastas e subpastas laterais, preservando funções e permissões; sem implementar faturamento. Verificado com acesso de Anderson, incluindo menu recolhido.

- [x] Acesso dos operadores confirmado: 24 liberados e 5 bloqueados — Anderson confirmou que os bloqueios são intencionais e devem continuar.
- [x] Reorganizar a tabela de etiquetas: executada em 02/10 às 23:59. Espaço caiu de 1228 MB para 478 MB (09/10), com 603.400 etiquetas preservadas.
- [x] Fotos leves nas telas, IA uma vez por foto, rotinas de 2 min só seg–sex, limpeza diária do histórico técnico.
- [ ] Aumentar o banco para 30 GB em outra janela, separada da reorganização. Data ainda a definir.
- [x] Aviso de crescimento do banco por e-mail ligado (anderson.teixeira@tlmlogistica.com.br).

- [x] Desligar acompanhamento alerta-saude-gps (cron alerta-saude-gps-15min). Encerrado em 09/10; nenhum alerta de problema foi enviado nos dias de acompanhamento.
- [ ] 15/10/2026 15h Brasília (autorizado por Anderson): (1) ampliar servidor do banco pico→micro (+~19 créditos/mês); (2) vigia externo que avisa por e-mail quando o banco não responde; (3) orientar convite de segundo responsável. Aguarda Anderson abrir a conversa no horário (o agente não executa sozinho).
- [x] 16/10 queda do banco: corrigidas 169 regras de acesso que conferiam permissão linha a linha (consultas 5s→0,3s).
- [x] Domingo 18/10/2026: servidor ampliado Tiny→Mini (17h55); etiquetas compactadas 479 MB→55 MB, banco 1.293 MB→868 MB, 83.517 etiquetas preservadas.
- [x] 18/10: a mensagem em inglês era a janela de ampliação do próprio Lovable, não do sistema; não dá para traduzir. Traduzida para Anderson no chat.
