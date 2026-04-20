---
name: Roteirização Modo Manual
description: Modo manual da Preparação preserva ordem definida pelo operador (drag-and-drop) ao salvar e também ao reroteirizar o veículo posteriormente.
type: feature
---
A Preparação possui dois botões de envio para a Roteirização:
1. **"Enviar para Roteirização"** — fluxo padrão (geocodifica + OSRM otimizado).
2. **"Roteirizar Manualmente"** — envia `modoManual: true` no `location.state`.

No modo manual:
- Lista de paradas editável via drag-and-drop (`@dnd-kit`) desde o início.
- Botão único "Confirmar Ordem Manual".
- `calculateRouteManual()` em `src/pages/Roteirizacao.tsx`:
  - Geocodifica em background (CEP → Logradouro+Bairro → Bairro).
  - Calcula `distancia_total_km` via Haversine entre paradas consecutivas.
  - Estima `tempo_estimado_min` como `(distancia/25)*60 + 10min*paradas`.
  - **NÃO** chama OSRM nem reordena.
- Salva em `roteirizacoes` + `roteirizacao_paradas` com `status: "concluida"`.

## Reroteirização preserva ordem manual
`src/components/roteirizacao/ReroteirizarVeiculoDialog.tsx` busca primeiro a roteirização atual da carga primária do veículo e monta um `Map<cnpj, ordem>` (`ordemPrevia`).
- CNPJs com ordem prévia → mantidos exatamente na ordem que estavam.
- CNPJs novos (NFs adicionadas depois) → posicionados ao final via `clusterAndSort` a partir da última parada conhecida.
- Só faz cluster automático completo quando NÃO existe roteirização prévia.

Isso garante que reroteirizar não destrói a ordem manual definida pelo operador.
