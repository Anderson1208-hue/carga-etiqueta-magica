import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Haversine distance in meters
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
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { monitoramento_rota_id, latitude, longitude, accuracy } = await req.json();

    if (!monitoramento_rota_id || latitude == null || longitude == null) {
      return new Response(JSON.stringify({ error: "Dados incompletos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Insert GPS position
    await supabase.from("posicoes_gps").insert({
      monitoramento_rota_id,
      latitude,
      longitude,
      accuracy,
      registrado_em: new Date().toISOString(),
    });

    // 2. Update route last position
    await supabase
      .from("monitoramento_rotas")
      .update({
        ultima_lat: latitude,
        ultima_lng: longitude,
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
      .order("ordem", { ascending: true });

    if (!paradas || paradas.length === 0) {
      return new Response(JSON.stringify({ status: "ok", events: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const events: string[] = [];
    const now = new Date();

    for (const parada of paradas) {
      if (!parada.latitude || !parada.longitude) continue;

      const dist = haversineDistance(latitude, longitude, Number(parada.latitude), Number(parada.longitude));
      const raio = (parada.raio_geofence_metros || raio_padrao) + tolerancia_gps;
      const dentroGeofence = dist <= raio;

      // RULE: Vehicle entered geofence
      if (dentroGeofence && parada.status === "programada") {
        await supabase
          .from("monitoramento_paradas")
          .update({
            status: "chegou_cliente",
            horario_chegada: now.toISOString(),
          })
          .eq("id", parada.id);

        // Check if out of sequence
        const anterioresNaoConcluidas = paradas.filter(
          (p: any) => p.ordem < parada.ordem && !["finalizada", "pulada"].includes(p.status)
        );

        if (anterioresNaoConcluidas.length > 0) {
          // Mark skipped stops
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

          // Mark current as out of sequence
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

        // Mark as em_rota the next expected stop
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
          // Check if alert already exists
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
          // Inconsistent visit
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
          // Normal exit
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
      .eq("monitoramento_rota_id", monitoramento_rota_id);

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
