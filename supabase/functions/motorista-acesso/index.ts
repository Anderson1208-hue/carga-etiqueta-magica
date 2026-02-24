import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { code } = await req.json();

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
    const { data: veiculo, error: veiculoErr } = await supabase
      .from("veiculos")
      .select("id, placa, motorista, status, data")
      .eq("access_code", code.toUpperCase())
      .maybeSingle();

    if (veiculoErr || !veiculo) {
      return new Response(JSON.stringify({ error: "Código não encontrado" }), {
        status: 404,
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

    const nfs = (veiculoNfs || [])
      .map((vnf: any) => vnf.notas_fiscais)
      .filter(Boolean);

    // Get baixas for this vehicle
    const { data: baixas } = await supabase
      .from("baixas_entrega")
      .select("nf_id, status, registrado_em, recebedor_nome, ocorrencia")
      .eq("veiculo_id", veiculo.id);

    const baixasMap: Record<string, any> = {};
    (baixas || []).forEach((b: any) => {
      baixasMap[b.nf_id] = b;
    });

    const nfsComStatus = nfs.map((nf: any) => ({
      ...nf,
      entrega: baixasMap[nf.id] || null,
    }));

    return new Response(
      JSON.stringify({
        veiculo: {
          placa: veiculo.placa,
          motorista: veiculo.motorista,
          status: veiculo.status,
          data: veiculo.data,
        },
        nfs: nfsComStatus,
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
