---
name: SLA e Tarifa por Fornecedor e Região
description: Regiões por embarcador com cidades, SLA em dias úteis e tarifa única por região; acesso restrito a admin + Julio + Rodrigo Boamorte
type: feature
---
Regiões são desenhadas POR FORNECEDOR (mesma cidade pode cair em regiões diferentes em fornecedores diferentes).

Tabelas: `embarcador_regioes`, `embarcador_regiao_cidades` (uf + municipio, `municipio_norm` gerado em upper), `embarcador_regiao_sla` (prazo_dias_uteis, versionado por vigência), `embarcador_regiao_tarifas` (valor único por região — sem faixa de peso; tarifa_por_ton/tarifa_fixa, frete_minimo, GRIS, ad valorem, pedágio/100kg, adicional CT-e).

Consulta oficial: `resolver_sla_tarifa(embarcador_id, uf, municipio, data)` — usar sempre esta função, não replicar a regra no frontend.

Acesso restrito (lista fixa): admin + julio.nogueira@tlmlogistica.com.br + rodrigo.boamorte@tlmlogistica.com.br. Banco: `pode_gestao_comercial()`; frontend: `useGestaoComercial()`.

Telas: `/comercial/sla-fornecedor` e `/comercial/tarifas-regiao`. A tela `/fiscal/tabelas-frete` (`tabelas_frete` + faixas) continua existindo para o simulador fiscal/CT-e e NÃO deve ser removida.

## Componentes adicionais do frete (2026-08)
`embarcador_regiao_tarifas.componentes_extra` (jsonb array) guarda componentes
extras: `{codigo, nome, nome_dacte, tipo_calculo, valor, embutido}`.
As opções vêm da tabela `public.componentes_frete_catalogo` (RLS por
`pode_gestao_comercial()`), pré-carregada com os componentes do DACTE
(FRETE PESO, FRETE VALOR, GRIS, CAT, PEDAGIO, OUTROS) e acessórios
(TDE, TRT, adicional de entrega, reentrega, devolução, descarga/ajudante,
paletização, estadia, agendamento, escolta, despacho, frete mínimo).
`tipo_calculo`: percentual_nf | percentual_frete | valor_por_ton |
valor_por_100kg | valor_fixo | valor_por_entrega. `embutido` = componente
"A EMBUTIR" no DACTE.

## Cidades já atendidas (2026-09)
`listar_cidades_atendidas(_embarcador_id)` (security definer, gated por
`pode_gestao_comercial()`) agrupa `notas_fiscais` por `dest_uf` + município
(sem acento, upper) casando o CNPJ do emitente por dígitos (em
`notas_fiscais` o CNPJ vem formatado; em `embarcadores`, sem máscara),
retornando total de NFs, clientes distintos e última emissão.
A tela `/comercial/sla-fornecedor` mostra essa lista com checkbox para
marcar cidades e adicioná-las à região (upsert com
`onConflict: regiao_id,uf,municipio_norm`), sinalizando "já na região" e
"em outra região". Pandurata (70.940.994/0082-77) tem 27 cidades atendidas.
