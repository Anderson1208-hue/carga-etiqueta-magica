# OK Entrega confiável por construção

## Objetivo
Impedir definitivamente o envio automático de canhotos incorretos ou não validados e separar “recebido pela API” de “aprovado pelo cliente”. Nenhuma das 19 notas já tratadas será reenviada.

## Implementação
1. **Validação obrigatória antes do envio**
   - Remover o fallback silencioso que transmite um recorte geométrico quando a validação inteligente está indisponível.
   - Exigir leitura da NF correta, orientação legível e presença de assinatura antes de qualquer transmissão automática.
   - Falhas ou indisponibilidade da validação irão para `revisao`, nunca para envio ou repetição automática.

2. **Máquina de estados idempotente**
   - Estados distintos: `pendente`, `processando`, `aguardando_aprovacao`, `aprovado`, `recusado`, `revisao`, `erro`, `bloqueado`.
   - Reserva atômica do item para impedir duas execuções simultâneas.
   - HTTP 200 significa somente “aguardando aprovação”; nunca “concluído”.
   - HTTP 409 será terminal e tratado como ocorrência já existente, sem novas tentativas automáticas.

3. **Evidência e revisão operacional**
   - Persistir origem/resultado da validação e a imagem exata preparada para envio.
   - Exibir claramente na Integração OK Entrega: revisão necessária, aguardando aprovação, aprovado e recusado.
   - Permitir ao administrador visualizar original e faixa final antes de liberar uma exceção.

4. **Conciliação do portal**
   - Preparar rotina de consulta do resultado definitivo usando o endpoint oficial da OK Entrega.
   - Se esse endpoint não estiver disponível na documentação/credencial atual, manter o estado “aguardando aprovação” e sinalizar a pendência operacional, sem declarar sucesso falso.

5. **Implantação segura**
   - Preservar a blocklist e o cutoff existentes.
   - Não alterar o aplicativo do motorista e não apagar imagens.
   - Bloquear as 19 NFs informadas contra retransmissão.
   - Validar com chamadas sem transmissão e liberar o automático somente após a barreira de qualidade passar.

## Detalhes técnicos
- Alteração da fila e índices via migração, mantendo regras de acesso atuais.
- Edge Function com compare-and-set para reserva, classificação de erros transitórios/terminais e fail-closed na imagem.
- A imagem enviada será armazenada separadamente da original para auditoria.
- Testes cobrirão indisponibilidade da IA, NF divergente, assinatura ausente, duplicidade 409 e concorrência.
