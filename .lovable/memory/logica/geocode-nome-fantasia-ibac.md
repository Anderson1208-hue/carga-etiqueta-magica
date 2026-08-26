---
name: geocode-nome-fantasia-ibac
description: Embarcador IBAC — geocodificar destinatários pela fachada "Cacau Show" + logradouro/número, nunca pela razão social da franquia.
type: feature
---
# IBAC (Cacau Show) — busca por nome fantasia

**Regra do cliente:** para o embarcador IBAC, endereço/localização de destinatário deve ser procurado pelo **nome fantasia "Cacau Show"**, não pela razão social. As lojas são franquias com CNPJ/razão social próprios (ASSB, Sabor Cacau, Mada Ia, Chocoban, PDG Doces, Chocolates A e B...) — o Google indexa somente a fachada.

**Implementação em `backfill-places-nome`:**
- Monta `cnpjsIbac` a partir de `notas_fiscais` com `cnpj_emitente` raiz `61472205` (IBAC INDUSTRIA BRASILEIRA DE ALIMENTOS E CHOCOLATES). Todo destinatário nessa lista usa `nome = "Cacau Show"`, independente da raiz do CNPJ — precede `destinatario_apelidos_busca`.
- `textQuery` passou a incluir **logradouro + número**: `"Cacau Show, R. Campos Sales, 28, Tijuca, Rio de Janeiro, RJ, Brasil"`. Sem rua/número, franquias homônimas da mesma rede voltavam o MESMO `place_id` e empilhavam paradas na mesma coordenada (bug da Torre em 26/08/2026, LNR1960).

Validado em dry-run: 5 lojas da Tijuca/Maracanã → 5 `place_id` distintos, endereços de fachada corretos.
