---
name: transistorsoft-v9-config
description: Transistorsoft Capacitor v9 exige config agrupada; não usar formato flat/legacy.
type: constraint
---
# Transistorsoft Capacitor v9 — Config Agrupada

`@transistorsoft/capacitor-background-geolocation` v9 usa `Config` agrupado:
- `geolocation` — accuracy, distanceFilter, stop detection.
- `activity` — detecção de movimento/parada.
- `http` — url, headers, params, `rootProperty`.
- `persistence` — `locationTemplate`, `extras`, `persistMode`.
- `app` — `stopOnTerminate`, `startOnBoot`, `enableHeadless`, `notification`, rationale.
- `logger` — debug/logLevel.

**Nunca reverter para config flat/legacy** (`desiredAccuracy`, `url`, `httpRootProperty`, `locationTemplate`, `persistMode`, `notification` na raiz). Em v9 isso é ignorado ou aplicado parcialmente e causa GPS que só atualiza com app aberto / tela ativa.

**Por quê:** Docs e tipos locais v9 (`@transistorsoft/background-geolocation-types`) definem `Config` apenas com grupos; `httpRootProperty` foi renomeado para `http.rootProperty`.
