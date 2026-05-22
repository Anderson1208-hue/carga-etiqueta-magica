import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      monitoramento_rota_id,
      latitude,
      longitude,
      accuracy,
      batch,
      heartbeat: heartbeatFlag,
    } = body;

    if (!monitoramento_rota_id || (latitude == null && (!batch || batch.length === 0))) {
      return new Response(JSON.stringify({ error: "Dados incompletos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Insert GPS positions (batch or single) — com dedup via client_ts (UPSERT)
    const positions: GpsPosition[] = batch && batch.length > 0
      ? batch
      : [{
          latitude,
          longitude,
          accuracy,
          timestamp: new Date().toISOString(),
          heartbeat: !!heartbeatFlag,
        }];

    const gpsRows = positions.map((p: GpsPosition) => {
      const ts = p.timestamp || new Date().toISOString();
      return {
        monitoramento_rota_id,
        latitude: p.latitude,
        longitude: p.longitude,
        accuracy: p.accuracy,
        registrado_em: ts,
        client_ts: ts,
        heartbeat: !!p.heartbeat,
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

    // 2. Use last position for route update and geofence checks
    // Heartbeats puros (sem movimento) não disparam geofence.
    const lastPos = positions[positions.length - 1];
    const lat = lastPos.latitude;
    const lng = lastPos.longitude;
    const isHeartbeatOnly = positions.every((p) => p.heartbeat === true);

    await supabase
      .from("monitoramento_rotas")
      .update({
        ultima_lat: lat,
        ultima_lng: lng,
        ultima_atualizacao: new Date().toISOString(),
      })
      .eq("id", monitoramento_rota_id);

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
      return new Response(JSON.stringify({ status: "ok", events: [], heartbeat: isHeartbeatOnly }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const events: string[] = [];
    const now = new Date();

    for (const parada of paradas) {
      if (!parada.latitude || !parada.longitude) continue;

      const dist = haversineDistance(lat, lng, Number(parada.latitude), Number(parada.longitude));
      const raio = (parada.raio_geofence_metros || raio_padrao) + tolerancia_gps;
      const dentroGeofence = dist <= raio;

      // RULE: Vehicle entered geofence
      if (dentroGeofence && parada.status === "programada") {
        await supabase
          .from("monitoramento_paradas")
          .update({ status: "chegou_cliente", horario_chegada: now.toISOString() })
          .eq("id", parada.id);

        // Check if out of sequence
        const anterioresNaoConcluidas = paradas.filter(
          (p: any) => p.ordem < parada.ordem && !["finalizada", "pulada"].includes(p.status)
        );

        if (anterioresNaoConcluidas.length > 0) {
          for (const ant of anterioresNaoConcluidas) {
            if (ant.status === "programada") {
              await supabase
                .from("monitoramento_paradas")
                .update({ status: "pulada", is_excecao: true })
                .eq("id", ant.id);

              await supabase.from("alertas_monitoramento").insert({
                monitoramento_rota_id,
                monitoramento_parada_id: ant.id,
                tipo: "entrega_pulada",
                mensagem: `Entrega #${ant.ordem} (${ant.razao_social || ant.cnpj_destinatario}) foi pulada`,
              });
              events.push(`pulada_${ant.id}`);
            }
          }

          await supabase
            .from("monitoramento_paradas")
            .update({ is_excecao: true, status: "fora_sequencia" })
            .eq("id", parada.id)
            .eq("status", "chegou_cliente");

          await supabase.from("alertas_monitoramento").insert({
            monitoramento_rota_id,
            monitoramento_parada_id: parada.id,
            tipo: "fora_sequencia",
            mensagem: `Entrega #${parada.ordem} (${parada.razao_social || parada.cnpj_destinatario}) atendida fora de sequência`,
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
        const minutos = (now.getTime() - chegada.getTime()) / 60000;

        if (minutos >= tempo_min_atendimento) {
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
        const minutos = (now.getTime() - chegada.getTime()) / 60000;

        if (minutos >= tempo_max_cliente) {
          const { data: existingAlert } = await supabase
            .from("alertas_monitoramento")
            .select("id")
            .eq("monitoramento_parada_id", parada.id)
            .eq("tipo", "parada_excessiva")
            .limit(1);

          if (!existingAlert || existingAlert.length === 0) {
            await supabase
              .from("monitoramento_paradas")
              .update({ status: "parada_excessiva", is_excecao: true })
              .eq("id", parada.id);

            await supabase.from("alertas_monitoramento").insert({
              monitoramento_rota_id,
              monitoramento_parada_id: parada.id,
              tipo: "parada_excessiva",
              mensagem: `Parada excessiva em #${parada.ordem} (${parada.razao_social || parada.cnpj_destinatario}) - ${Math.round(minutos)} min`,
            });
            events.push(`parada_excessiva_${parada.id}`);
          }
        }
      }

      // RULE: Vehicle LEFT geofence
      if (
        !dentroGeofence &&
        ["chegou_cliente", "em_atendimento", "parada_excessiva", "fora_sequencia"].includes(parada.status) &&
        parada.horario_chegada
      ) {
        const chegada = new Date(parada.horario_chegada);
        const permanencia = Math.round((now.getTime() - chegada.getTime()) / 60000);

        if (permanencia < tempo_min_atendimento) {
          await supabase
            .from("monitoramento_paradas")
            .update({
              status: "visita_inconsistente",
              horario_saida: now.toISOString(),
              tempo_permanencia_min: permanencia,
              is_excecao: true,
            })
            .eq("id", parada.id);

          await supabase.from("alertas_monitoramento").insert({
            monitoramento_rota_id,
            monitoramento_parada_id: parada.id,
            tipo: "visita_inconsistente",
            mensagem: `Visita inconsistente em #${parada.ordem} (${parada.razao_social || parada.cnpj_destinatario}) - apenas ${permanencia} min`,
          });
          events.push(`visita_inconsistente_${parada.id}`);
        } else {
          await supabase
            .from("monitoramento_paradas")
            .update({
              status: "finalizada",
              horario_saida: now.toISOString(),
              tempo_permanencia_min: permanencia,
              is_excecao: false,
            })
            .eq("id", parada.id);
          events.push(`finalizada_${parada.id}`);
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
