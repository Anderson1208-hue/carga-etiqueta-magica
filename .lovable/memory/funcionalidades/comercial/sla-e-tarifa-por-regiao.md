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
