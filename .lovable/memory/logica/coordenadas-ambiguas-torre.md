---
name: coordenadas-ambiguas-torre
description: Paradas da mesma rota com coordenadas idênticas (<50m) não recebem chegada/saída por GPS — evita horários misturados na Torre.
type: feature
---
# Coordenadas ambíguas — GPS não gera horário

**Sintoma (26/08/2026, LNR1960):** Torre exibia chegada/saída de clientes diferentes na mesma janela de tempo. Causa raiz: 4 CNPJs distintos (ASSB filiais, Sabor Cacau Maracanã) com a MESMA coordenada `-22.9252473,-43.2365829` (`origem_coordenada='legado_desconhecido'`), raio 500m. Um único dwell (veículo parado ~30min a 530m) abria/fechava sequencialmente 4 paradas → horários fictícios.

**Regra em `processar-gps`:** antes do loop de geofence, calcula pares de paradas da rota com distância <= 50m. Todas as paradas envolvidas entram em `paradasAmbiguas` e são IGNORADAS para chegada/saída/permanência (evento `coordenadas_ambiguas_N` no retorno). Elas só são finalizadas por baixa (canhoto) ou finalização manual.

**Correção de dados:** usar `geocodificar-endereco` (Google, ROOFTOP) por logradouro+número. NÃO usar `backfill-places-nome` para filiais homônimas — a busca por nome devolve o mesmo `place_id` para todas.

Existiam ~93 endereços em 37 pontos repetidos no cadastro; o guard protege a Torre até o cadastro ser saneado.
