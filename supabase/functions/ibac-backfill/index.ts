// Edge function: ibac-backfill
// Enfileira eventos históricos (baixas e agendamentos) na fila IBAC.
// Usado uma única vez na ativação da integração, ou para reprocessar períodos específicos.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface BackfillBody {
  data_inicio: string; // ISO date
  data_fim: string;    // ISO date
  incluir_baixas?: boolean;
  incluir_agendamentos?: boolean;
  dry_run?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Validação do usuário: precisa ser admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Apenas administradores" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as BackfillBody;
    if (!body.data_inicio || !body.data_fim) {
      return new Response(
        JSON.stringify({ error: "data_inicio e data_fim são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const incluirBaixas = body.incluir_baixas ?? true;
    const incluirAgendamentos = body.incluir_agendamentos ?? true;
    const dryRun = body.dry_run ?? false;

    // Mapa de eventos ativos
    const { data: deParaList } = await supabase
      .from("ibac_de_para_eventos")
      .select("evento_interno, ativo");
    const eventosAtivos = new Set(
      (deParaList ?? []).filter((d) => d.ativo).map((d) => d.evento_interno),
    );

    let baixasContagem = 0;
    let agendamentosContagem = 0;
    const inserts: any[] = [];

    // -------- Baixas --------
    if (incluirBaixas) {
      const { data: baixas } = await supabase
        .from("baixas_entrega")
        .select("id, nf_id, status, ocorrencia, recebedor_nome, latitude, longitude, registrado_em, veiculo_id")
        .gte("registrado_em", body.data_inicio)
        .lte("registrado_em", body.data_fim)
        .order("registrado_em", { ascending: true })
        .limit(5000);

      for (const b of baixas ?? []) {
        let evento: string | null = null;
        if (b.status === "entregue") evento = "entrega_realizada";
        else if ((b.ocorrencia ?? "").toLowerCase() === "reentrega") evento = "reentrega";
        else if (["avaria", "avariado"].includes((b.ocorrencia ?? "").toLowerCase())) evento = "avaria";
        else if (["recusa", "recusado", "recusa_entrega"].includes((b.ocorrencia ?? "").toLowerCase())) evento = "recusa_entrega";
        else if (["devolucao", "devolução"].includes((b.ocorrencia ?? "").toLowerCase())) evento = "devolucao";

        if (!evento || !eventosAtivos.has(evento)) continue;

        // Evita duplicar se já existe na fila para essa baixa
        const { data: existe } = await supabase
          .from("ibac_eventos_queue")
          .select("id")
          .eq("baixa_id", b.id)
          .eq("evento_interno", evento)
          .limit(1);
        if (existe && existe.length > 0) continue;

        const { data: nf } = await supabase
          .from("notas_fiscais")
          .select("chave_acesso, carga_id, numero_nf, cnpj_destinatario, dest_razao_social")
          .eq("id", b.nf_id)
          .maybeSingle();

        inserts.push({
          evento_interno: evento,
          nf_id: b.nf_id,
          carga_id: nf?.carga_id ?? null,
          baixa_id: b.id,
          chave_acesso: nf?.chave_acesso ?? null,
          payload: {
            nf_id: b.nf_id,
            baixa_id: b.id,
            numero_nf: nf?.numero_nf,
            chave_acesso: nf?.chave_acesso,
            cnpj_destinatario: nf?.cnpj_destinatario,
            dest_razao_social: nf?.dest_razao_social,
            ocorrencia: b.ocorrencia,
            recebedor_nome: b.recebedor_nome,
            latitude: b.latitude,
            longitude: b.longitude,
            registrado_em: b.registrado_em,
            veiculo_id: b.veiculo_id,
            backfill: true,
          },
          status: "pendente",
        });
        baixasContagem++;
      }
    }

    // -------- Agendamentos --------
    if (incluirAgendamentos && eventosAtivos.has("agendamento")) {
      const { data: ags } = await supabase
        .from("agendamentos")
        .select("id, nf_id, status, data_agendamento, observacao, created_at")
        .in("status", ["AGENDAMENTO", "REENTREGA"])
        .gte("created_at", body.data_inicio)
        .lte("created_at", body.data_fim)
        .not("data_agendamento", "is", null)
        .order("created_at", { ascending: true })
        .limit(5000);

      for (const a of ags ?? []) {
        const { data: existe } = await supabase
          .from("ibac_eventos_queue")
          .select("id")
          .eq("nf_id", a.nf_id)
          .eq("evento_interno", "agendamento")
          .limit(1);
        if (existe && existe.length > 0) continue;

        const { data: nf } = await supabase
          .from("notas_fiscais")
          .select("chave_acesso, carga_id, numero_nf, cnpj_destinatario, dest_razao_social")
          .eq("id", a.nf_id)
          .maybeSingle();

        inserts.push({
          evento_interno: "agendamento",
          nf_id: a.nf_id,
          carga_id: nf?.carga_id ?? null,
          baixa_id: null,
          chave_acesso: nf?.chave_acesso ?? null,
          payload: {
            nf_id: a.nf_id,
            agendamento_id: a.id,
            numero_nf: nf?.numero_nf,
            chave_acesso: nf?.chave_acesso,
            cnpj_destinatario: nf?.cnpj_destinatario,
            dest_razao_social: nf?.dest_razao_social,
            data_agendamento: a.data_agendamento,
            status_agendamento: a.status,
            observacao: a.observacao,
            backfill: true,
          },
          status: "pendente",
        });
        agendamentosContagem++;
      }
    }

    if (!dryRun && inserts.length > 0) {
      // Insere em lotes de 500
      for (let i = 0; i < inserts.length; i += 500) {
        const lote = inserts.slice(i, i + 500);
        const { error: errIns } = await supabase.from("ibac_eventos_queue").insert(lote);
        if (errIns) {
          return new Response(
            JSON.stringify({ error: errIns.message, inseridos_parcial: i }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        dry_run: dryRun,
        baixas_enfileiradas: baixasContagem,
        agendamentos_enfileirados: agendamentosContagem,
        total: inserts.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
