# Roadmap
- [x] Consultadas as 14 NFs transmitidas de 23/10: 11 em análise e 3 recusadas (764348/767017 erro na data de entrega; 767018 erro no número/série); 3 sem ocorrência transmitida não elegíveis. Consulta final 21,02s, sem envio. Automação de consulta autenticada configurada para segunda 26/10 às 07h/17h Brasília, incluindo roteirizações do próprio dia e anteriores desde 22/10. 20 testes passaram; registros relidos. Tela não verificada: sessão de Anderson redireciona para login.
- [x] Adicionados anexo e reenvio explícito nas recusadas (administradores), preservando originais, baixa e histórico; anexo não entra na fila automática. 15 testes passaram, função publicada, NF 766978 conferida com sessão de Anderson e reenvio sem anexo bloqueado pelo servidor (400). Não anexada foto fictícia nem realizado envio real: falta foto corretiva de Anderson para verificar aceitação pelo cliente; API pode retornar duplicidade 409, exibida sem presumir aprovação.
- [x] 23/10 17h02: revisão confirmou novas ocorrências no portal nas sete recusadas. Seis agora Registrado (764358, 764557, 764698, 766979, 766981, 767146), salvas como aprovadas sem motivo; 766978 tem nova recusa 23/10 14:18, motivo do portal Erro na data de entrega. Leitura agora considera ocorrência de entrega mais recente por DTREGISTRO, preserva ID da transmissão original e exige correspondência na mesma nota. Sem julgamento de imagem ou reenvio. 15 testes passaram; registros salvos e relidos.

- [x] 23/10: vídeo comparado e consulta automática individual verificada. Filtro indevido de série/emitente removido para espelhar busca do vídeo; lupa usa id sem aspas e RESULTADO_VALIDA é array. NF 767250: Registrado, validação 22/10 14:42, consulta 4,209 s; NF 767017: Recusado, Erro na data de entrega, validação 23/10 13:20, consulta 5,009 s. Nenhum status gravado e nenhuma imagem reenviada; consulta individual não equivale a atualização do lote.

- [x] Consulta individual de 767017 e 767250 confirmada diretamente no portal em 23/10; resultados registrados acima, sem alteração operacional.

- [x] OK Entrega: recorrência autorizada por Anderson para segunda 26/10, às 07h/17h Brasília; consulta isolada do enfileiramento/envio, incluindo notas do próprio dia desde 22/10.
- [x] 23/10 16h49: atualização de 22/10 executada e relida no banco: 24 aprovadas, 7 recusadas com motivo, NF 767617 sem ocorrência enviada/fila. Lote 156,785 s + reteste da 764700 ~4,5 s (aproximadamente 2min41s de execução; conclusão às 16h53 Brasília). Nenhuma imagem reenviada. 11 testes passaram. Conferência visual bloqueada: sessão renovada continua redirecionada ao login; valores confirmados por leitura dos registros, não pela tela.

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
- [x] 23/10: coluna Ações da tela Integração OK Entrega fixada na borda direita (sticky). Anderson não via os botões porque a tabela é mais larga que a tela e a coluna ficava fora da área visível; confirmado com sessão de administrador em 22/10 (NF 766978) que os botões só aparecem depois de rolar a tabela para a direita.
