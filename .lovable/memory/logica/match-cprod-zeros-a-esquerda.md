---
name: Match de cProd com zeros à esquerda (cadastro de produtos)
description: NFs trazem cProd zero-padded (18 dígitos); produtos.codigo é sem zeros. Todo join deve usar ltrim(...,'0') nos dois lados.
type: feature
---
O XML de vários emitentes (confirmado Masterfoods/Mars, CNPJ 29.737.368/0034-87) traz
`itens_nf.c_prod` com zeros à esquerda (`000000000060013658`), enquanto `produtos.codigo`
está cadastrado sem zeros (`60013658`).

Regra: **qualquer** casamento entre `itens_nf.c_prod` e `produtos.codigo` deve comparar
`ltrim(btrim(x),'0')` nos dois lados, além de normalizar o CNPJ
(`regexp_replace(cnpj_emitente,'\D','','g')` = `produtos.cnpj_embarcador`).

Aplicado em (14/08/2026): `aplicar_cubagem_produtos_nf` e `produtos_pendentes_cadastro`.
Sem isso, a Mars ficava sem m³ mesmo com 83 SKUs cadastrados e a fila de "pendentes de
cadastro" mostrava produtos já cadastrados.
