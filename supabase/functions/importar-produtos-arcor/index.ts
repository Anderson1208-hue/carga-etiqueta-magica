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

    const existentes = new Map<string, string>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin
        .from("produtos")
        .select("id, cnpj_embarcador, codigo")
        .in("cnpj_embarcador", Object.keys(embMap))
        .order("codigo")
        .range(from, from + 999);
      if (error) throw error;
      (data ?? []).forEach((p) =>
        existentes.set(`${p.cnpj_embarcador}|${String(p.codigo).trim().toLowerCase()}`, p.id)
      );
      if (!data || data.length < 1000) break;
    }

    let inseridos = 0;
    let atualizados = 0;
    const erros: string[] = [];
    const novos: Record<string, unknown>[] = [];
    const upd: Record<string, unknown>[] = [];

    for (const r of rows) {
      const base = { ...r, embarcador_id: embMap[String(r.cnpj_embarcador)] ?? null };
      const id = existentes.get(
        `${r.cnpj_embarcador}|${String(r.codigo).trim().toLowerCase()}`,
      );
      if (id) upd.push({ ...base, id });
      else novos.push(base);
    }

    const CHUNK = 400;
    for (let i = 0; i < novos.length; i += CHUNK) {
      const { error } = await admin.from("produtos").insert(novos.slice(i, i + CHUNK));
      if (error) erros.push(`insert ${i}: ${error.message}`);
      else inseridos += Math.min(CHUNK, novos.length - i);
    }
    for (let i = 0; i < upd.length; i += CHUNK) {
      const { error } = await admin.from("produtos").upsert(upd.slice(i, i + CHUNK));
      if (error) erros.push(`update ${i}: ${error.message}`);
      else atualizados += Math.min(CHUNK, upd.length - i);
    }

    return new Response(JSON.stringify({ total: rows.length, inseridos, atualizados, erros }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
