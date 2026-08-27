---
name: Integração por emitente — um canal por CNPJ de emitente
description: Cada integração (IBAC, OK Entrega/Pandurata, futuras) só transmite NFs cujo cnpj_emitente pertence ao grupo daquele embarcador; nunca enviar NF de terceiro no endpoint de outro
type: constraint
---

Regra definida por Anderson em 27/08/2026, após incidente em que o ibac-sync transmitiu eventos de Pandurata, Hershey, Docile e Mars para a API da IBAC.

- **Cada integração é amarrada ao CNPJ do emitente da NF.** IBAC só recebe NFs com emitente do grupo IBAC/Cacau Show; Pandurata (OK Entrega) só NFs com emitente Pandurata; demais embarcadores seguirão o mesmo critério quando integrados.
- No `ibac-sync`, o filtro usa a raiz do CNPJ (8 primeiros dígitos) do `cnpj_emitente` confrontada com `cnpj_envio_canhoto_auto` (ativo). Itens fora do escopo são **cancelados na fila** (não apenas ignorados), com erro_mensagem "Fora do escopo IBAC (emitente não autorizado)".
- **Why:** enviar NF de outro embarcador para a API de um cliente expõe dados comerciais de terceiros e gera ruído contratual.
- **How to apply:** qualquer nova integração de saída (eventos/canhoto) DEVE ter filtro equivalente por raiz de CNPJ do emitente antes do POST, e o trigger de enfileiramento deve idealmente já barrar na entrada.
