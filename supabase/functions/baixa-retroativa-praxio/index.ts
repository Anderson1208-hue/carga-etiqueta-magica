import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

// Função TEMPORÁRIA de conciliação retroativa (relatório Praxio).
// Não gera canhoto e não aciona filas de envio a clientes.
const TOKEN = "praxio-2026-09-08-conciliacao";

Deno.serve(async (req) => {
  if (req.headers.get("x-import-token") !== TOKEN) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  try {
    const { rows, dry_run = true } = await req.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "rows vazio" }), { status: 400 });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await supabase.rpc("aplicar_baixa_retroativa", {
      p_rows: rows,
      p_dry_run: dry_run,
      p_origem: "praxio",
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
