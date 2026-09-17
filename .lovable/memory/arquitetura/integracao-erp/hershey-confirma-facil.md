---
name: Hershey — Confirma Fácil (API + SFTP)
description: Contrato inicial, endpoints e pendências da integração Hershey via portal Confirma Fácil (utilities.confirmafacil.com.br e SFTP gateway)
type: feature
---

Canal do embarcador **Hershey** é o portal **Confirma Fácil** (não é API própria da Hershey).

Endpoints (informados em 17/09/2026):
- Login/token: `POST https://utilities.confirmafacil.com.br/login/login`
- Carga de dados: `POST https://utilities.confirmafacil.com.br/business/v2/embarque`
- Consumo: `https://utilities.confirmafacil.com.br/filter/embarque`, `/filter/ocorrencia`, `/filter/pedido`
- Geolocalização: `https://utilities.confirmafacil.com.br/rastreamento/localizacao`
- SFTP alternativo: `sftp.vx.gateway.confirmafacil.com.br:22` (SFTP Gateway 3.5.0, Thorn Tech; aceita password/publickey/keyboard-interactive)

Contrato do login (sondado por curl em 17/09/2026):
- Só aceita `POST` (GET = 403). Corpo JSON deve conter a chave **`senha`** (com `usuario`, `login` ou `email`); corpo sem `senha` → 403 pelo WAF (Volterra/volt-adc).
- Credenciais `expresso` / senha do SFTP → **401 `{"codigo":401,"mensagem":"Usuario ou senha incorretos!"}`** ⇒ o usuário da API é diferente do usuário do SFTP (ou falta liberar IP).
- SFTP com as mesmas credenciais → `Permission denied` (senha rejeitada ou IP não liberado).

Escopo definido pelo usuário: **receber embarques/pedidos** (entrada de cargas) e **enviar canhoto/comprovante**; usar API e SFTP (o que estiver disponível). Status de entrega e GPS ficam fora do escopo inicial.

Pendências para começar: documentação dos 4 manuais (campos de cada payload), credenciais de API válidas, liberação de IP de saída, e ambiente de homologação. Nada foi implementado ainda.

Regra: como IBAC/IBAE e Pandurata, o canal só transmite NFs cujo `cnpj_emitente` seja do grupo Hershey (ver [mem://constraints/integracao-por-emitente-cnpj]).
