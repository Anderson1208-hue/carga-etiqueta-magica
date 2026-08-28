---
name: OK Entrega - filtro de emitente no banco e cutoff de produção
description: Regras da fila okentrega_queue - filtro do CNPJ emitente no SELECT, ordenação desc, cutoff 28/08/2026 e independência entre canais IBAC/OK Entrega
type: constraint
---

- O filtro do CNPJ do emitente (Pandurata raiz `70940994`) DEVE ser aplicado no SELECT do banco em `okentrega-enfileirar`, não apenas em memória. Filtrar só em memória fazia a janela (`limit`) ser ocupada pelas baixas mais antigas de todos os emitentes, e as baixas Pandurata do dia nunca entravam na fila.
- Ordenar candidatos por `registrado_em DESC` (o dia corrente tem prioridade).
- Cutoff de produção: `2026-08-28` (America/Sao_Paulo). Baixas anteriores não são transmitidas; o backlog de 371 registros de 21/05 a 10/07 foi marcado como `erro` com tentativas=99 e não deve ser reaberto.
- Em `PrestacaoContas.encerrarPrestacao`, os canais IBAC e OK Entrega são independentes: falha no bloco IBAC não pode abortar o enfileiramento/envio da OK Entrega (cada bloco em seu próprio try/catch).
- CNPJ em `notas_fiscais.cnpj_emitente` é gravado FORMATADO (`70.940.994/0082-77`). Consultas de diagnóstico devem normalizar dígitos.
- Diagnóstico: `psql` roda com role restrita e sofre RLS em algumas tabelas (ex.: `okentrega_queue` mostrou 3 de 374 linhas). Para auditoria de filas usar as ferramentas Supabase (read_query).
