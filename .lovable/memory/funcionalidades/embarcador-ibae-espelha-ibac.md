---
name: IBAE espelha 100% as regras da IBAC
description: Embarcador IBAE (Cacau Show, Linhares/ES, CNPJ raiz 42431457) usa exatamente as mesmas regras da IBAC — canhoto, status, dupla bipagem, m³ por planilha
type: feature
---

**IBAE INDUSTRIA BRASILEIRA DE ALIMENTOS ESPECIAIS LTDA** — CNPJ `42.431.457/0001-09`
(raiz `42431457`), Linhares/ES. Também é carga Cacau Show, com **todas** as regras
da IBAC (raiz `61472205`) aplicadas de forma idêntica:

- Transmissão de status de entrega e de canhoto pela integração IBAC
  (`cnpj_envio_canhoto_auto` com a raiz `42431457` ativa — é essa tabela que define
  escopo em `ibac-sync`, `ibac-enfileirar-canhotos`, `conciliar_veiculo_ibac` e
  `conferencia_interna_status_veiculo`).
- Conferência interna em duas etapas; Etapa 1 com **dupla bipagem obrigatória**.
- m³ **nunca** lido do XML; entra por planilha/NOTFIS (fator 300 kg/m³).
- Geocodificação de destinatários pela fachada "Cacau Show" + logradouro/número
  (`backfill-places-nome`).

Fonte única no frontend: `src/lib/embarcadores-cacau.ts`
(`CACAU_EMITENTE_RAIZES`, `isEmitenteCacau`, `CACAU_EMITENTE_REGEX`). Novo emitente
do grupo = adicionar a raiz lá **e** em `cnpj_envio_canhoto_auto`.
