# Roadmap

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
- [ ] Domingo 18/10/2026 (autorizado por Anderson, sem movimentação): (1) ampliar servidor Tiny→Mini; (2) compactar tabela de etiquetas (479 MB, 87.544 etiquetas; ganho estimado ~360 MB; trava a tabela alguns minutos). Medir tamanho antes/depois. Aguarda Anderson abrir a conversa no domingo.
- [x] 18/10: a mensagem em inglês era a janela de ampliação do próprio Lovable, não do sistema; não dá para traduzir. Traduzida para Anderson no chat.
