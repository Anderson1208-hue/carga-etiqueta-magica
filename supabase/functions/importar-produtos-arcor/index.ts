import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: file, error: dlErr } = await admin.storage
      .from("imports-temp")
      .download("arcor-siebel.json");
    if (dlErr) throw dlErr;

    const rows = JSON.parse(await file.text()) as Record<string, unknown>[];

    const embMap: Record<string, string> = {
      "54360656003089": "ffd7a991-4695-4005-adf9-3bc1ec59a73c",
      "06042467001900": "b76a5990-40ae-489c-bd84-ce9937050760",
    };

    let ok = 0;
    const erros: string[] = [];
    const CHUNK = 400;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const lote = rows.slice(i, i + CHUNK).map((r) => ({
        ...r,
        embarcador_id: embMap[String(r.cnpj_embarcador)] ?? null,
      }));
      const { error } = await admin.rpc("importar_produtos_lote", {
        payload: { produtos: lote },
      });
      if (error) erros.push(`${i}: ${error.message}`);
      else ok += lote.length;
    }

    return new Response(JSON.stringify({ total: rows.length, ok, erros }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
