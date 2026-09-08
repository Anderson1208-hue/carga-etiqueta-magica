---
name: Sirius Log (Bauducco) - login e gravação por nota
description: Contrato validado de login SSO e gravação de status/datas nota a nota no portal Sirius Log (tracking Pandurata/Bauducco)
type: feature
---

Portal: `bauducco.siriuslog.com` (SSO WSO2 `sso.siriuslog.com`, gateway `portal.siriuslog.com`, header `tenant: bauducco.siriuslog.com`).
Login programático: fluxo authorization_code (client_id/secret públicos do bundle), token ~12h. Segredos: `SIRIUSLOG_USER`, `SIRIUSLOG_PASSWORD`.

Localizar a nota:
1. `GET /sirius-load-composition-api/nfe?number=<NF>` -> `id` interno da NF.
2. `GET /sirius-national-tracking-api/v1/trip/delivery/status/view?invoiceIds=<id>` -> `id` da viagem (tripId).
3. `GET /sirius-national-tracking-api/v1/trip/delivery/status/detail/<tripId>` -> `invoices[].invoiceDetailId` por `invoiceNumber`.

Gravação (validada em 08/09/2026, NF 758306, detailId 96244):
- **Funciona:** `PATCH /sirius-national-tracking-api/v1/delivery-invoice-detail/<invoiceDetailId>` com `{ tripInvoiceDetailedStatusId: <id>, <campoData>: "YYYY-MM-DDTHH:mm:ss-03:00" }` -> HTTP 204.
- **Falha 422:** `PATCH .../current-status` só com data, sem avançar status ("Data de saída na filial não pode ser alterada no status ...").
- Regra: data só é aceita junto com a transição de status correspondente.

Campos de data: `scheduleRequestDate`, `deliverySchedulingDate`, `estimatedDeliveryDate`, `customerArrivalDate`, `deliveryDate`, `branchEstimatedArrivalDate`, `branchArrivalDate`, `branchDepartureDate`.

Ciclo completo validado (NF 758306, detailId 96244, 08/09/2026) — cada passo 1 PATCH, HTTP 204:
1. status 23 (Em trânsito para cliente) + `branchDepartureDate`
2. status 2 (Aguardando descarga) + `customerArrivalDate`
3. status 17 (Entrega realizada aguardando canhoto) + `deliveryDate`
Após o passo 3 o portal passa a sinalizar "Notas com Data Entrega, sem POD" (canhoto ainda não anexado ali; canhoto segue pela OK Entrega).

IDs de status detalhado: 21 Em trânsito para filial da transportadora; 22 Na filial da transportadora; 23 Em trânsito para cliente; 2 Aguardando descarga; 24 Veículo no cliente check-in; 27 Veículo na doca; 17 Entrega realizada aguardando canhoto; 1 Entrega realizada aguardando baixa EDI; 20 Entrega realizada e baixada no SAP; 5 Recusa aguardando instrução embarcador; 19 Reentrega com autorização Bauducco; 3 Canhoto retido no cliente; 11 Devolução total com autorização.

Restrição: nenhuma automação/lote pode ser ligada sem autorização explícita do usuário. Função de teste: `supabase/functions/siriuslog-probe/index.ts` (default somente leitura; gravação exige `{acao:"gravar-uma", confirmar:"SIM"}`).
