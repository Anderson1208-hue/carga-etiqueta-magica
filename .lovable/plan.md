# Canhoto esquecido: encerrar prestação com pendência controlada

## Problema
O motorista entregou, mas não trouxe o canhoto físico. Hoje só existem dois caminhos: encerrar a prestação (e a NF fica "entregue sem foto", erro na Conciliação IBAC e nunca sobe imagem) ou travar o veículo esperando o papel. Precisamos de um terceiro caminho: encerrar registrando a falta, e reabrir só a foto quando o canhoto aparecer.

## Regra operacional proposta

1. Na linha da NF, o operador escolhe **"Canhoto pendente"** (novo status de conferência, ao lado de OK / Pendência).
   - Exige motivo obrigatório: `esquecido_motorista`, `perdido`, `retido_no_cliente`, `ilegível_refazer`, `outro` + observação livre.
   - A baixa e a entrega permanecem válidas (status entregue, GPS, recebedor). Só a imagem fica devendo.
2. **Encerrar Prestação de Contas passa a ser permitido** com linhas nesse estado. A Conciliação IBAC classifica essas NFs como `canhoto_pendente_recuperacao` com gravidade **atenção** (não erro) — o encerramento não pede confirmação por causa delas.
3. O encerramento **não enfileira** a imagem dessas NFs. Os eventos operacionais (entregue) continuam indo normalmente.
4. Fica registrado quem marcou, quando, motivo e prazo (SLA sugerido: 2 dias úteis). Vira uma fila de cobrança.

## Recuperação do canhoto

Nova tela **/canhotos-pendentes** (operação e admin), lista aberta por veículo/motorista/NF/dias em atraso, com:
- foto do canhoto pelo celular ou upload do arquivo digitalizado;
- geração automática da tira paisagem 1536×240 (mesma regra do envio) com prévia antes de confirmar;
- ao confirmar: grava `foto_path` + `foto_recibo_path`, muda o status para OK, registra o evento de recuperação e **enfileira a imagem na IBAC na hora** (não espera novo encerramento).

Alternativa complementar (mesma fila, sem retrabalho para o operador): o motorista, ao abrir o app, vê as NFs com canhoto pendente da própria placa e pode bater a foto direto — o app já sabe gerar a tira e sincronizar.

## Painéis e cobrança
- Contador "Canhotos pendentes de recuperação" no card de resumo da prestação e no Dashboard, com quebra por motorista.
- Alerta quando passar do SLA (2 dias úteis) — a NF sobe para gravidade **erro** na conciliação, forçando decisão (recuperado, reentrega ou perda formalizada).

## Detalhes técnicos
- `baixas_entrega`: novos campos `canhoto_pendente_motivo`, `canhoto_pendente_em`, `canhoto_pendente_por`, `canhoto_recuperado_em`, `canhoto_recuperado_por`; `conferencia_status` aceita `canhoto_pendente`.
- `conciliar_veiculo_ibac`: nova classificação `canhoto_pendente_recuperacao` (atenção; vira erro após o SLA) antes do atual `entregue_sem_foto`.
- `ibac-enfileirar-canhotos`: ignorar baixas com canhoto pendente; enfileirar no ato da recuperação (RPC ou invoke direto pela tela).
- Reaproveitar `blobCanhotoRecibo` de `src/lib/okentrega-canhoto.ts` para gerar a tira, e `CanhotoViewer` para a prévia.
- Eventos em `nf_eventos` para auditoria: `canhoto_pendente` e `canhoto_recuperado`.

## Fora do escopo
Não altera a regra "imagem só sobe após encerrar prestação" para os casos normais, nem o fluxo de exclusão de foto ruim já existente (esse continua sendo refação pelo motorista no mesmo dia).
