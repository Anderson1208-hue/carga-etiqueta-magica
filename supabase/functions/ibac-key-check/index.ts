// Temporário: confere se a chave informada pela IBAC é igual à configurada,
// sem expor o valor do secret. Retorna apenas true/false e metadados.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let candidate = "";
  try {
    const body = await req.json();
    candidate = String(body?.key ?? "").trim();
  } catch {
    candidate = "";
  }

  const current = (Deno.env.get("IBAC_API_KEY") ?? "").trim();
  const url = Deno.env.get("IBAC_API_URL") ?? "";

  return new Response(
    JSON.stringify({
      configurada: current.length > 0,
      tamanho_configurada: current.length,
      confere: candidate.length > 0 && candidate === current,
      url_configurada: url,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
