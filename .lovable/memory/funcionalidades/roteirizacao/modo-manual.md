---
name: Roteirização Modo Manual
description: Botão alternativo na Preparação que pula geocodificação automática — operador define ordem das paradas via drag-and-drop e sistema calcula km/tempo via Haversine em background.
type: feature
---
A Preparação possui dois botões de envio para a Roteirização:
1. **"Enviar para Roteirização"** — fluxo padrão (geocodifica + OSRM otimizado).
2. **"Roteirizar Manualmente"** — envia `modoManual: true` no `location.state`.

No modo manual:
- A lista de paradas é editável via drag-and-drop (`@dnd-kit`) desde o início (sem precisar calcular rota antes).
- Botão único "Confirmar Ordem Manual" substitui Geocodificar/Calcular Rota Otimizada.
- A função `calculateRouteManual()` em `src/pages/Roteirizacao.tsx`:
  - Geocodifica em background (CEP → Logradouro+Bairro → Bairro) silenciosamente.
  - Calcula `distancia_total_km` via Haversine entre paradas consecutivas (CD → P1 → P2 → ...).
  - Estima `tempo_estimado_min` como `(distancia/25)*60 + 10min*paradas`.
  - **NÃO** chama OSRM nem reordena — respeita 100% a ordem definida pelo operador.
- Salva normalmente em `roteirizacoes` + `roteirizacao_paradas` com `status: "concluida"`.
