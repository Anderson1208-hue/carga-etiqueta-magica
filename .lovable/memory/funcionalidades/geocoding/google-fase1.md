---
name: Geocoding Google Fase 1
description: Edge function geocodificar-endereco + tabela geocode_cache. Substitui BrasilAPI para coordenadas precisas de destinatários.
type: feature
---

# Geocoding Google (Fase 1)

## Objetivo
Coordenada precisa (ROOFTOP) do endereço do cliente **sem depender do motorista**. Usado por roteirização e Torre (geofence).

## Componentes
- **Connector:** `google_maps` (gateway). Secrets: `GOOGLE_MAPS_API_KEY`, `LOVABLE_API_KEY`.
- **Tabela:** `public.geocode_cache` (cache_key UNIQUE, latitude, longitude, formatted_address, location_type, place_id, hit_count).
- **Edge Function:** `supabase/functions/geocodificar-endereco/index.ts`.
  - Input: `{ logradouro, numero, bairro, cidade, uf, cep, endereco_id? }`.
  - Fluxo: normaliza chave → busca cache → se miss chama `${GATEWAY_URL}/maps/api/geocode/json` → grava cache → (opcional) atualiza `destinatario_enderecos.latitude/longitude`.
  - `region=br&language=pt-BR`.

## Cache key
Normalização: uppercase + strip acentos + campos concatenados por `|`. CEP só dígitos.

## Fora do escopo (Fase 1)
- Fiscalização "baixa fora do raio" (Fase 2).
- Aprendizado automático via consenso de motoristas (fase futura).
- UI de geocodificação em massa (a definir).

## Custo
Google Geocoding: US$5 / 1000 requests, US$200/mês grátis. Cache reduz para praticamente zero após primeiro hit por endereço.
