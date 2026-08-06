import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type NotaFiscalMotorista = {
  id: string;
  numero_nf: string;
  dest_razao_social: string | null;
  dest_logradouro: string | null;
  dest_numero: string | null;
  dest_bairro: string | null;
  dest_cidade: string | null;
  dest_uf: string | null;
  dest_cep: string | null;
  peso_bruto: number | null;
};

type VeiculoNfRow = { notas_fiscais: NotaFiscalMotorista | null };

type BaixaEntregaRow = {
  nf_id: string;
  status: string;
  registrado_em: string | null;
  recebedor_nome: string | null;
  ocorrencia: string | null;
};

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { code, action } = payload;

    if (!code || typeof code !== "string" || code.length !== 6) {
      return new Response(JSON.stringify({ error: "Código inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find vehicle by access code
    const { data: veiculoBase, error: veiculoErr } = await supabase
      .from("veiculos")
      .select("id, placa, motorista, status, data")
      .eq("access_code", code.toUpperCase())
      .maybeSingle();

    if (veiculoErr || !veiculoBase) {
      return new Response(JSON.stringify({ error: "Código não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PERNOITE: quando o veículo pernoita, as NFs são movidas para um novo
    // registro de veículo (dia seguinte) com outro access_code. O motorista
    // continua usando o código antigo, então seguimos a cadeia de sucessores
    // (pernoite_origem_id) até o último registro para não perder as NFs.
    let veiculo = veiculoBase;
    for (let i = 0; i < 10; i++) {
      const { data: sucessor } = await supabase
        .from("veiculos")
        .select("id, placa, motorista, status, data")
        .eq("pernoite_origem_id", veiculo.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!sucessor) break;
      veiculo = sucessor;
    }


    if (action === "registrar-baixa") {
      const {
        nf_id,
        ocorrencia,
        recebedor_nome,
        observacao,
        latitude,
        longitude,
        foto_base64,
        foto_mime,
      } = payload;

      if (!nf_id || !ocorrencia) {
        return new Response(JSON.stringify({ error: "Dados da baixa incompletos" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (ocorrencia === "entregue" && (!foto_base64 || typeof foto_base64 !== "string")) {
        return new Response(JSON.stringify({ error: "Foto do canhoto é obrigatória para entrega" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: vinculo } = await supabase
        .from("veiculo_nfs")
        .select("nf_id")
        .eq("veiculo_id", veiculo.id)
        .eq("nf_id", nf_id)
        .maybeSingle();

      if (!vinculo) {
        return new Response(JSON.stringify({ error: "NF não vinculada a este código" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: baixaExistente } = await supabase
        .from("baixas_entrega")
        .select("id")
        .eq("veiculo_id", veiculo.id)
        .eq("nf_id", nf_id)
        .maybeSingle();

      if (baixaExistente) {
        return new Response(JSON.stringify({ error: "Esta NF já possui baixa registrada" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Upload foto (apenas se enviada)
      let fotoPath: string | null = null;
      if (foto_base64 && typeof foto_base64 === "string") {
        try {
          const mime = typeof foto_mime === "string" && foto_mime.startsWith("image/") ? foto_mime : "image/jpeg";
          const ext = mime.split("/")[1]?.split("+")[0] || "jpg";
          const fileName = `${veiculo.id}/${nf_id}_${Date.now()}.${ext}`;
          const bytes = base64ToBytes(foto_base64);

          const { error: uploadErr } = await supabase.storage
            .from("comprovantes")
            .upload(fileName, bytes, { contentType: mime, upsert: false });

          if (uploadErr) {
            return new Response(JSON.stringify({ error: "Falha ao enviar foto" }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          fotoPath = fileName;
        } catch {
          return new Response(JSON.stringify({ error: "Foto inválida" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const { error: insertError } = await supabase.from("baixas_entrega").insert({
        veiculo_id: veiculo.id,
        nf_id,
        status: ocorrencia === "entregue" ? "entregue" : "ocorrencia",
        ocorrencia,
        recebedor_nome: recebedor_nome || null,
        foto_path: fotoPath,
        latitude: typeof latitude === "number" ? latitude : null,
        longitude: typeof longitude === "number" ? longitude : null,
        registrado_por: null,
        registrado_em: new Date().toISOString(),
      });

      if (insertError) {
        return new Response(JSON.stringify({ error: "Erro ao registrar baixa" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get NFs linked to this vehicle
    const { data: veiculoNfs } = await supabase
      .from("veiculo_nfs")
      .select(`
        nf_id,
        notas_fiscais (
          id,
          numero_nf,
          dest_razao_social,
          dest_logradouro,
          dest_numero,
          dest_bairro,
          dest_cidade,
          dest_uf,
          dest_cep,
          peso_bruto
        )
      `)
      .eq("veiculo_id", veiculo.id);

    const nfs = ((veiculoNfs || []) as VeiculoNfRow[])
      .map((vnf) => vnf.notas_fiscais)
      .filter((nf): nf is NotaFiscalMotorista => Boolean(nf));

    // Get baixas for this vehicle
    const { data: baixas } = await supabase
      .from("baixas_entrega")
      .select("nf_id, status, registrado_em, recebedor_nome, ocorrencia")
      .eq("veiculo_id", veiculo.id);

    const baixasMap: Record<string, BaixaEntregaRow> = {};
    ((baixas || []) as BaixaEntregaRow[]).forEach((b) => {
      baixasMap[b.nf_id] = b;
    });

    const nfsComStatus = nfs.map((nf) => ({
      ...nf,
      entrega: baixasMap[nf.id] || null,
    }));

    // Rota de monitoramento ativa (para o APK iniciar GPS em segundo plano).
    // Primeiro tenta pelo veículo exato; se não encontrar, cai para a placa.
    // Isso cobre placas com múltiplos cadastros/códigos gerados em dias diferentes.
    // Aceita 'ativa' OU 'aguardando' — Torre pré-provisiona rotas em 'aguardando'
    // e o primeiro ping GPS promove para 'ativa'. Se filtrarmos só 'ativa', o
    // APK recebe monitoramento_rota_id=null e nunca começa a enviar GPS.
    const { data: rotaAtivaPorVeiculo } = await supabase
      .from("monitoramento_rotas")
      .select("id")
      .eq("veiculo_id", veiculo.id)
      .in("status", ["ativa", "aguardando"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let rotaAtiva = rotaAtivaPorVeiculo;
    if (!rotaAtiva) {
      const { data: rotaAtivaPorPlaca } = await supabase
        .from("monitoramento_rotas")
        .select("id")
        .eq("placa", veiculo.placa)
        .in("status", ["ativa", "aguardando"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      rotaAtiva = rotaAtivaPorPlaca;
    }

    let ultimoGps: { source: string | null; registrado_em: string | null } | null = null;
    if (rotaAtiva?.id) {
      const { data: posicao } = await supabase
        .from("posicoes_gps")
        .select("source, registrado_em")
        .eq("monitoramento_rota_id", rotaAtiva.id)
        .order("registrado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      ultimoGps = posicao ?? null;
    }

    return new Response(
      JSON.stringify({
        veiculo: {
          id: veiculo.id,
          placa: veiculo.placa,
          motorista: veiculo.motorista,
          status: veiculo.status,
          data: veiculo.data,
        },
        nfs: nfsComStatus,
        monitoramento_rota_id: rotaAtiva?.id ?? null,
        ultimo_gps_source: ultimoGps?.source ?? null,
        ultimo_gps_registrado_em: ultimoGps?.registrado_em ?? null,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
