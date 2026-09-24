# Plano: travas de espaço no banco (sem perda de dado de negócio)

## Respostas às dúvidas

**Histórico de conferência permanece?** Sim. O histórico da NF (quem conferiu, quando, etiqueta X/Y, produto) fica gravado em outra tabela, a de eventos da NF (243 mil eventos de conferência hoje). Ela não depende das etiquetas. Excluir etiquetas não apaga esse histórico.

**O que seria afetado por excluir etiquetas de NF entregue:**
- Reimprimir etiqueta de nota já entregue: deixa de ser possível (a nota já foi entregue, não há uso).
- Reentrega IBAC/IBAE: precisa das etiquetas para bipar de novo. Por isso a regra só exclui quando a nota está entregue de forma definitiva (não reentrega/retorno) e com prazo de carência.
- Divergências de etiqueta: o registro fica na auditoria, não na etiqueta.
- Relatórios de contagem de caixas de cargas antigas: passam a usar o total gravado na NF/evento.

**"O banco corta campo de log grande demais" — explicação simples:** é uma regra colocada dentro do próprio banco, como um porteiro. Toda vez que alguém tenta gravar um registro de log, o banco confere o tamanho do texto. Se for enorme (ex.: uma imagem inteira), ele guarda só o começo e anota "cortado, tamanho original X". Assim, mesmo que no futuro alguém programe uma integração errada, o banco não volta a inchar como aconteceu com a IBAC. Só vale para tabelas de log técnico, nunca para notas, baixas ou fotos.

## Etapas de implantação (cada uma só com sua autorização)

1. **Log IBAC – respostas:** parar de guardar a resposta inteira; guardar só código, mensagem curta e tamanho. Limpar as respostas antigas pesadas (manter datas, resultado e tempos). Reorganizar a tabela à noite.
2. **Porteiro de tamanho:** limite automático (ex.: 4 KB) nos campos de texto dos logs técnicos (IBAC, OK Entrega, Sirius Log, e-mails, auditoria).
3. **Etiquetas:** excluir etiquetas de NFs entregues há mais de 30 dias, sem reentrega pendente, em lotes pequenos durante a madrugada. Histórico de conferência preservado.
4. **Retenção de logs técnicos:** manter 90 dias de detalhe; depois, só resumo (data, resultado).
5. **Painel de espaço:** aviso quando alguma tabela crescer fora do normal.

## Nunca muda
- Fotos/comprovantes nunca são apagados.
- Notas, baixas, eventos da NF e auditoria preservados.
- App do motorista não é alterado.

## Detalhes técnicos
- Etapa 1: `ibac-sync` grava `response_body` truncado; UPDATE em lotes zera bodies antigos; VACUUM FULL/recópia em janela.
- Etapa 2: trigger BEFORE INSERT/UPDATE que aplica `left(campo, 4096)` e registra tamanho original.
- Etapa 3: job pg_cron diário; critério NF `entregue` + `baixas_entrega` sem reentrega posterior + 30 dias; delete em lotes de 5.000; `tg_reentrega_cacau_reabre_expedicao` depende de etiquetas, por isso a carência.
