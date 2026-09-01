---
name: OK Entrega - filtro de emitente no banco e cutoff de produção
description: Regras da fila okentrega_queue - filtro do CNPJ emitente no SELECT, ordenação desc, cutoff 28/08/2026 e independência entre canais IBAC/OK Entrega
type: constraint
---

- O filtro do CNPJ do emitente (Pandurata raiz `70940994`) DEVE ser aplicado no SELECT do banco em `okentrega-enfileirar`, não apenas em memória. Filtrar só em memória fazia a janela (`limit`) ser ocupada pelas baixas mais antigas de todos os emitentes, e as baixas Pandurata do dia nunca entravam na fila.
- Ordenar candidatos por `registrado_em DESC` (o dia corrente tem prioridade).
- Cutoff de produção definitivo: `2026-09-01` (America/Sao_Paulo) — decisão do Anderson em 01/09/2026: só notas roteirizadas/baixadas a partir de hoje entram na fila; o backlog Pandurata anterior NUNCA deve ser transmitido (nem os 371 registros marcados como `erro`, nem os de 28/08).
- A Edge `okentrega-sync` deve preparar a imagem no modo `recibo` (recorte da tira da DANFE: centro em 24% da altura, faixa de 22%, P&B + contraste) — implementado em `_shared/okentrega-image.ts`. Sem esse modo a foto retrato caía no `contain` e chegava ilegível na OK Entrega.
- Em `PrestacaoContas.encerrarPrestacao`, os canais IBAC e OK Entrega são independentes: falha no bloco IBAC não pode abortar o enfileiramento/envio da OK Entrega (cada bloco em seu próprio try/catch).
- CNPJ em `notas_fiscais.cnpj_emitente` é gravado FORMATADO (`70.940.994/0082-77`). Consultas de diagnóstico devem normalizar dígitos.
- Diagnóstico: `psql` roda com role restrita e sofre RLS em algumas tabelas (ex.: `okentrega_queue` mostrou 3 de 374 linhas). Para auditoria de filas usar as ferramentas Supabase (read_query).
