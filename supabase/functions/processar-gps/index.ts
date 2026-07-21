import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface GpsPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp?: string;
  heartbeat?: boolean;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (value == null) continue;
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function toSaoPauloDate(value: string | Date): string | null {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function normalizeDateOnly(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.slice(0, 10);
}

async function findLastGpsInsideStop(
  supabase: any,
  monitoramento_rota_id: string,
  parada: any,
  beforeAt: Date,
  raioPadrao: number,
  toleranciaGps: number,
): Promise<Date | null> {
  if (!parada.horario_chegada || !parada.latitude || !parada.longitude) {
    return null;
  }

  const { data, error } = await supabase
    .from("posicoes_gps")
    .select("registrado_em, latitude, longitude")
    .eq("monitoramento_rota_id", monitoramento_rota_id)
    .eq("heartbeat", false)
    .gte("registrado_em", parada.horario_chegada)
    .lt("registrado_em", beforeAt.toISOString())
    .order("registrado_em", { ascending: false })
    .limit(1000);

  if (error) {
    console.error(
      "[processar-gps] erro ao buscar último GPS dentro da parada:",
      error,
    );
    return null;
  }

  const raio = (parada.raio_geofence_metros || raioPadrao) + toleranciaGps;
  const stopLat = Number(parada.latitude);
  const stopLng = Number(parada.longitude);

  for (const pos of data || []) {
    const posLat = Number(pos.latitude);
    const posLng = Number(pos.longitude);
    const eventAt = new Date(pos.registrado_em);
    if (
      !Number.isFinite(posLat) || !Number.isFinite(posLng) ||
      Number.isNaN(eventAt.getTime())
    ) continue;

    const dist = haversineDistance(posLat, posLng, stopLat, stopLng);
    if (dist <= raio) return eventAt;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const coords = body.coords ?? body.location?.coords ?? {};
    const extras = body.extras ?? body.location?.extras ?? {};
    const {
      batch,
      heartbeat: heartbeatFlag,
      source = "legacy-js",
    } = body;

    const monitoramento_rota_id = firstString(
      body.monitoramento_rota_id,
      extras.monitoramento_rota_id,
      body.params?.monitoramento_rota_id,
    );
    const latitude = firstNumber(body.latitude, coords.latitude);
    const longitude = firstNumber(body.longitude, coords.longitude);
    const accuracy = firstNumber(body.accuracy, coords.accuracy) ?? 0;
    const clientTs = firstString(
      body.timestamp,
      body.client_ts,
      body.recorded_at,
      body.created_at,
    );

    if (
      !monitoramento_rota_id ||
      (latitude == null && (!batch || batch.length === 0))
    ) {
      return new Response(JSON.stringify({ error: "Dados incompletos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: rotaAtual } = await supabase
      .from("monitoramento_rotas")
      .select("ultima_atualizacao, status, data")
      .eq("id", monitoramento_rota_id)
      .maybeSingle();

    const rotaData = normalizeDateOnly(rotaAtual?.data);

    // 1. Insert GPS positions (batch or single) — com dedup via client_ts (UPSERT)
    const positions: GpsPosition[] = batch && batch.length > 0 ? batch : [{
      latitude: latitude as number,
      longitude: longitude as number,
      accuracy,
      timestamp: clientTs || new Date().toISOString(),
      heartbeat: !!heartbeatFlag,
    }];

    // Rotas de distribuição são diárias: ignore pings de outro dia operacional.
    // Isso evita percurso/torre contaminados por pernoite ou fila offline antiga.
    const validPositions = positions
      .map((p: GpsPosition) => ({
        ...p,
        timestamp: p.timestamp || new Date().toISOString(),
      }))
      .filter((p) => {
        if (!rotaData) return true;
        return toSaoPauloDate(p.timestamp as string) === rotaData;
      })
      .sort((a, b) =>
        new Date(a.timestamp as string).getTime() -
        new Date(b.timestamp as string).getTime()
      );

    if (validPositions.length === 0) {
      return new Response(
        JSON.stringify({
          status: "ok",
          events: [],
          ignored_out_of_day: positions.length,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Auto-promoção: primeiro ping válido em rota 'aguardando' vira 'ativa'.
    // Qualquer outro status não-operacional é ignorado.
    if (rotaAtual?.status === "aguardando") {
      await supabase
        .from("monitoramento_rotas")
        .update({ status: "ativa" })
        .eq("id", monitoramento_rota_id)
        .eq("status", "aguardando");
      rotaAtual.status = "ativa";
    } else if (rotaAtual?.status !== "ativa") {
      return new Response(
        JSON.stringify({
          status: "ok",
          events: [],
          ignored_inactive_route: true,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const gpsRows = validPositions.map((p: GpsPosition) => {
      const ts = p.timestamp || new Date().toISOString();
      return {
        monitoramento_rota_id,
        latitude: p.latitude,
        longitude: p.longitude,
        accuracy: p.accuracy,
        registrado_em: ts,
        client_ts: ts,
        heartbeat: !!p.heartbeat,
        source,
      };
    });

    // INSERT direto. O índice único é PARCIAL (WHERE client_ts IS NOT NULL),
    // e PostgREST não consegue resolver onConflict em índice parcial — por isso
    // não usamos upsert aqui. Em caso raro de duplicata (mesmo client_ts),
    // o código 23505 é capturado e ignorado.
    const { error: insertErr } = await supabase
      .from("posicoes_gps")
      .insert(gpsRows);
    if (insertErr && (insertErr as any).code !== "23505") {
      console.error("[processar-gps] insert error:", insertErr);
    }

    // 2. Use valid positions for route update and geofence checks
    // Heartbeats puros (sem movimento) não disparam geofence.
    const lastPos = validPositions[validPositions.length - 1];
    const lat = lastPos.latitude;
    const lng = lastPos.longitude;
    const lastTs = lastPos.timestamp || new Date().toISOString();
    const isHeartbeatOnly = validPositions.every((p) => p.heartbeat === true);

    // 2.1 Detecta GAP de GPS > 5min — provável "Permitir o tempo todo" ausente
    // ou app morto pelo SO. Cria um alerta único por janela para a Torre.
    const GAP_THRESHOLD_MS = 5 * 60 * 1000;
    const nowMs = new Date(lastTs).getTime();

    if (
      rotaAtual?.ultima_atualizacao && rotaAtual.status === "ativa" &&
      Date.now() - nowMs < 10 * 60 * 1000
    ) {
      const gapMs = nowMs - new Date(rotaAtual.ultima_atualizacao).getTime();
      if (gapMs > GAP_THRESHOLD_MS) {
        const minutos = Math.round(gapMs / 60000);
        // Evita duplicar alerta — só insere se não houver gps_instavel nos últimos 10min
        const { data: jaExiste } = await supabase
          .from("alertas_monitoramento")
          .select("id")
          .eq("monitoramento_rota_id", monitoramento_rota_id)
          .eq("tipo", "gps_instavel")
          .gte("created_at", new Date(nowMs - 10 * 60 * 1000).toISOString())
          .limit(1);

        if (!jaExiste || jaExiste.length === 0) {
          await supabase.from("alertas_monitoramento").insert({
            monitoramento_rota_id,
            tipo: "gps_instavel",
            mensagem:
              `GPS ficou ${minutos} min sem enviar posição — provável falha de permissão "Permitir o tempo todo" ou otimização de bateria.`,
          });
        }
      }
    }

    const shouldUpdateLatest = !rotaAtual?.ultima_atualizacao ||
      new Date(lastTs).getTime() >=
        new Date(rotaAtual.ultima_atualizacao).getTime();

    if (shouldUpdateLatest) {
      await supabase
        .from("monitoramento_rotas")
        .update({
          ultima_lat: lat,
          ultima_lng: lng,
          ultima_atualizacao: lastTs,
        })
        .eq("id", monitoramento_rota_id);
    }

    // 3. Get config
    const { data: config } = await supabase
      .from("monitoramento_config")
      .select("*")
      .limit(1)
      .single();

    const raio_padrao = config?.raio_padrao_metros || 100;
    const tempo_min_atendimento = config?.tempo_minimo_atendimento_min || 5;
    const tempo_max_cliente = config?.tempo_maximo_cliente_min || 60;
    const tolerancia_gps = config?.tolerancia_gps_metros || 30;

    // 4. Get all paradas for this route
    const { data: paradas } = await supabase
      .from("monitoramento_paradas")
      .select("*")
      .eq("monitoramento_rota_id", monitoramento_rota_id)
      .order("ordem", { ascending: true })
      .limit(2000);

    if (!paradas || paradas.length === 0 || isHeartbeatOnly) {
      return new Response(
        JSON.stringify({
          status: "ok",
          events: [],
          heartbeat: isHeartbeatOnly,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const events: string[] = [];
    const paradasState = [...paradas];
    const routePositions = validPositions.filter((p) => p.heartbeat !== true);

    for (const pos of routePositions) {
      const posLat = Number(pos.latitude);
      const posLng = Number(pos.longitude);
      const eventAt = new Date(pos.timestamp as string);
      if (
        !Number.isFinite(posLat) || !Number.isFinite(posLng) ||
        Number.isNaN(eventAt.getTime())
      ) continue;

      for (const parada of paradasState) {
        if (!parada.latitude || !parada.longitude) continue;

        const dist = haversineDistance(
          posLat,
          posLng,
          Number(parada.latitude),
          Number(parada.longitude),
        );
        const raio = (parada.raio_geofence_metros || raio_padrao) +
          tolerancia_gps;
        const dentroGeofence = dist <= raio;

        // RULE: Vehicle entered geofence
        if (dentroGeofence && parada.status === "programada") {
          const paradaAnteriorAberta = paradasState.some(
            (p: any) =>
              p.ordem < parada.ordem &&
              [
                "chegou_cliente",
                "em_atendimento",
                "parada_excessiva",
                "fora_sequencia",
              ].includes(p.status) &&
              p.horario_chegada &&
              !p.horario_saida,
          );

          // Um ping não pode iniciar duas paradas ao mesmo tempo. Se a parada
          // anterior ainda está aberta, primeiro precisamos de um ping factual
          // de saída dela; caso contrário os horários ficam artificiais.
          if (paradaAnteriorAberta) {
            events.push(`aguardando_saida_anterior_${parada.id}`);
            continue;
          }

          parada.status = "chegou_cliente";
          parada.horario_chegada = eventAt.toISOString();
          await supabase
            .from("monitoramento_paradas")
            .update({
              status: "chegou_cliente",
              horario_chegada: parada.horario_chegada,
            })
            .eq("id", parada.id);

          // Fecha parada anterior aberta somente com evidência GPS dela mesma.
          // Nunca usa a chegada da próxima parada como horário de saída: se não houver
          // último ping comprovado dentro do cliente anterior, a parada continua aberta.
          const abertasAnteriores = paradasState.filter(
            (p: any) =>
              p.ordem < parada.ordem &&
              [
                "chegou_cliente",
                "em_atendimento",
                "parada_excessiva",
                "fora_sequencia",
              ].includes(p.status) &&
              p.horario_chegada &&
              (!p.horario_saida ||
                new Date(p.horario_saida).getTime() > eventAt.getTime()),
          );
          for (const ant of abertasAnteriores) {
            const chegadaAnt = new Date(ant.horario_chegada);
            if (eventAt.getTime() <= chegadaAnt.getTime()) continue;

            const lastInsideAnt = await findLastGpsInsideStop(
              supabase,
              monitoramento_rota_id,
              ant,
              eventAt,
              raio_padrao,
              tolerancia_gps,
            );

            if (
              !lastInsideAnt || lastInsideAnt.getTime() <= chegadaAnt.getTime()
            ) {
              events.push(`sem_saida_factual_${ant.id}`);
              continue;
            }

            const permAnt = Math.max(
              0,
              Math.round(
                (lastInsideAnt.getTime() - chegadaAnt.getTime()) / 60000,
              ),
            );
            const novoStatus = permAnt < tempo_min_atendimento
              ? "visita_inconsistente"
              : "finalizada";
            ant.status = novoStatus;
            ant.horario_saida = lastInsideAnt.toISOString();
            ant.tempo_permanencia_min = permAnt;
            ant.is_excecao = novoStatus === "visita_inconsistente";
            await supabase
              .from("monitoramento_paradas")
              .update({
                status: novoStatus,
                horario_saida: ant.horario_saida,
                tempo_permanencia_min: permAnt,
                is_excecao: ant.is_excecao,
              })
              .eq("id", ant.id);
            events.push(`${novoStatus}_${ant.id}_by_next_arrival`);
          }

          // Check if out of sequence
          const anterioresNaoConcluidas = paradasState.filter(
            (p: any) =>
              p.ordem < parada.ordem &&
              !["finalizada", "pulada", "visita_inconsistente"].includes(
                p.status,
              ),
          );

          if (anterioresNaoConcluidas.length > 0) {
            for (const ant of anterioresNaoConcluidas) {
              if (ant.status === "programada") {
                ant.status = "pulada";
                ant.is_excecao = true;
                await supabase
                  .from("monitoramento_paradas")
                  .update({ status: "pulada", is_excecao: true })
                  .eq("id", ant.id);

                await supabase.from("alertas_monitoramento").insert({
                  monitoramento_rota_id,
                  monitoramento_parada_id: ant.id,
                  tipo: "entrega_pulada",
                  mensagem: `Entrega #${ant.ordem} (${
                    ant.razao_social || ant.cnpj_destinatario
                  }) foi pulada`,
                });
                events.push(`pulada_${ant.id}`);
              }
            }

            parada.is_excecao = true;
            parada.status = "fora_sequencia";
            await supabase
              .from("monitoramento_paradas")
              .update({ is_excecao: true, status: "fora_sequencia" })
              .eq("id", parada.id)
              .eq("status", "chegou_cliente");

            await supabase.from("alertas_monitoramento").insert({
              monitoramento_rota_id,
              monitoramento_parada_id: parada.id,
              tipo: "fora_sequencia",
              mensagem: `Entrega #${parada.ordem} (${
                parada.razao_social || parada.cnpj_destinatario
              }) atendida fora de sequência`,
            });
            events.push(`fora_sequencia_${parada.id}`);
          }

          events.push(`chegou_${parada.id}`);
        }

        // RULE: Check minimum time for "em_atendimento"
        if (
          dentroGeofence &&
          ["chegou_cliente", "fora_sequencia"].includes(parada.status) &&
          parada.horario_chegada
        ) {
          const chegada = new Date(parada.horario_chegada);
          const minutos = (eventAt.getTime() - chegada.getTime()) / 60000;

          if (minutos >= tempo_min_atendimento) {
            parada.status = "em_atendimento";
            await supabase
              .from("monitoramento_paradas")
              .update({ status: "em_atendimento" })
              .eq("id", parada.id);
            events.push(`em_atendimento_${parada.id}`);
          }
        }

        // RULE: Check excessive stay
        if (
          dentroGeofence &&
          parada.status === "em_atendimento" &&
          parada.horario_chegada
        ) {
          const chegada = new Date(parada.horario_chegada);
          const minutos = (eventAt.getTime() - chegada.getTime()) / 60000;

          if (minutos >= tempo_max_cliente) {
            const { data: existingAlert } = await supabase
              .from("alertas_monitoramento")
              .select("id")
              .eq("monitoramento_parada_id", parada.id)
              .eq("tipo", "parada_excessiva")
              .limit(1);

            if (!existingAlert || existingAlert.length === 0) {
              parada.status = "parada_excessiva";
              parada.is_excecao = true;
              await supabase
                .from("monitoramento_paradas")
                .update({ status: "parada_excessiva", is_excecao: true })
                .eq("id", parada.id);

              await supabase.from("alertas_monitoramento").insert({
                monitoramento_rota_id,
                monitoramento_parada_id: parada.id,
                tipo: "parada_excessiva",
                mensagem: `Parada excessiva em #${parada.ordem} (${
                  parada.razao_social || parada.cnpj_destinatario
                }) - ${Math.round(minutos)} min`,
              });
              events.push(`parada_excessiva_${parada.id}`);
            }
          }
        }

        // RULE: Vehicle LEFT geofence
        // Horário de saída precisa ser factual: o último ping ainda dentro do
        // raio da parada. O primeiro ping fora prova que saiu, mas NÃO é o
        // horário em que estava no cliente.
        if (
          !dentroGeofence &&
          [
            "chegou_cliente",
            "em_atendimento",
            "parada_excessiva",
            "fora_sequencia",
          ].includes(parada.status) &&
          parada.horario_chegada
        ) {
          const chegada = new Date(parada.horario_chegada);
          // Guard: ignora pings fora de ordem (mais antigos que a chegada) — evita
          // registrar horario_saida < horario_chegada e marcar visita_inconsistente indevidamente.
          if (eventAt.getTime() <= chegada.getTime()) continue;
          const lastInside = await findLastGpsInsideStop(
            supabase,
            monitoramento_rota_id,
            parada,
            eventAt,
            raio_padrao,
            tolerancia_gps,
          );
          if (!lastInside || lastInside.getTime() <= chegada.getTime()) {
            events.push(`sem_saida_factual_${parada.id}`);
            continue;
          }
          const permanencia = Math.max(
            0,
            Math.round((lastInside.getTime() - chegada.getTime()) / 60000),
          );

          if (permanencia < tempo_min_atendimento) {
            parada.status = "visita_inconsistente";
            parada.horario_saida = lastInside.toISOString();
            parada.tempo_permanencia_min = permanencia;
            parada.is_excecao = true;
            await supabase
              .from("monitoramento_paradas")
              .update({
                status: "visita_inconsistente",
                horario_saida: parada.horario_saida,
                tempo_permanencia_min: permanencia,
                is_excecao: true,
              })
              .eq("id", parada.id);

            await supabase.from("alertas_monitoramento").insert({
              monitoramento_rota_id,
              monitoramento_parada_id: parada.id,
              tipo: "visita_inconsistente",
              mensagem: `Visita inconsistente em #${parada.ordem} (${
                parada.razao_social || parada.cnpj_destinatario
              }) - apenas ${permanencia} min`,
            });
            events.push(`visita_inconsistente_${parada.id}`);
          } else {
            parada.status = "finalizada";
            parada.horario_saida = lastInside.toISOString();
            parada.tempo_permanencia_min = permanencia;
            parada.is_excecao = false;
            await supabase
              .from("monitoramento_paradas")
              .update({
                status: "finalizada",
                horario_saida: parada.horario_saida,
                tempo_permanencia_min: permanencia,
                is_excecao: false,
              })
              .eq("id", parada.id);
            events.push(`finalizada_${parada.id}`);
          }
        }
      }
    }

    // Update route completion count
    const { data: updatedParadas } = await supabase
      .from("monitoramento_paradas")
      .select("status")
      .eq("monitoramento_rota_id", monitoramento_rota_id)
      .limit(2000);

    const concluidas = (updatedParadas || []).filter((p: any) =>
      ["finalizada"].includes(p.status)
    ).length;

    const allDone = (updatedParadas || []).every((p: any) =>
      ["finalizada", "pulada", "visita_inconsistente"].includes(p.status)
    );

    await supabase
      .from("monitoramento_rotas")
      .update({
        paradas_concluidas: concluidas,
        status: allDone ? "finalizada" : "ativa",
      })
      .eq("id", monitoramento_rota_id);

    return new Response(JSON.stringify({ status: "ok", events }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro processar GPS:", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
