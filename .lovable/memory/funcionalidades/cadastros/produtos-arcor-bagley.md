---
name: Cadastro de produtos Arcor e Bagley (planilha Siebel)
description: Importação do Maestro de Articulos Siebel — código = Siebel Part Num; Arcor 54360656003089 e Bagley 06042467001900; m³ e peso vêm da planilha.
type: feature
---
Planilha **Maestro de Articulos Siebel - MKT - Vtas (BR)** (11/09/2026) — cabeçalho na linha 4,
dados a partir da linha 5. Arcor e Bagley vêm juntos no mesmo arquivo, separados pela coluna
`Siebel Empresa`:
- ARCOR DO BRASIL LTDA → `cnpj_embarcador = 54360656003089`
- BAGLEY DO BRASIL ALIMENTOS LTDA → `cnpj_embarcador = 06042467001900`

**Chave:** `produtos.codigo` = `Siebel Part Num` (11 dígitos, ex. 90108109043) — é o `cProd`
que vem nas NFs. A coluna `Item` (6 dígitos) vai em `codigo_alternativo`.
Atenção: o Excel entrega esses campos como número; é obrigatório remover o `.0` antes de gravar.

**Mapeamento (Unidades de Despacho = caixa):** Alto/Ancho/Largo → altura/largura/comprimento em
**mm**; `Bruto`/`Neto` em **gramas** (÷1000 para kg); `Cubicaje Por Bulto` → `volume_m3`;
`Vida Util` → `shelf_life_dias`; Almacenaje `Base`→lastro, `Hiladas`→camadas,
`Bultos`→caixas_por_pallet, `Alto Del Pallet`, `Peso Del Pallet`; `CB DUN14`→dun14,
`EAN13D`→ean_tdu, `EAN13U`→ean_rsu.

**Não vem na planilha:** NCM, CEST, temperatura, tipo de pallet.

**Carga inicial (11/09/2026):** 6.013 SKUs (4.337 Arcor + 1.676 Bagley), 6.009 com m³ e peso,
`origem_cadastro = 'planilha_arcor_siebel'`. Cobre 218 dos 219 códigos já vistos em NFs; o único
sem cadastro é `90108697777` PALETE DE MADEIRA P.B.R. (não é produto).
