// Sonda temporária, somente leitura: login no portal MO/Cacau Show e lista de canhotos.
// Nunca retorna token nem resposta de autenticação.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const BASE = "https://cacaushow.mosistemas.com/app/";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const out: Record<string, unknown> = {};
  try {
    const email = Deno.env.get("IBAC_PORTAL_USUARIO") ?? "";
    const senha = Deno.env.get("IBAC_PORTAL_SENHA") ?? "";
    const body = await req.json().catch(() => ({}));
    const t0 = Date.now();
    const lr = await fetch(BASE + "api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "sigla-sistema": "APP" },
      body: JSON.stringify({ email, senha, empresa: body.empresa ?? null, siglaSistema: "APP" }),
    });
    const lj: any = await lr.json().catch(() => null);
    out.login_status = lr.status;
    out.login_ms = Date.now() - t0;
    out.tem_token = !!lj?.id;
    out.empresas = Array.isArray(lj?.empresas)
      ? lj.empresas.map((e: any) => ({ oid: e?.oid, nome: e?.nome ?? e?.razaoSocial ?? e?.descricao }))
      : null;
    out.login_keys = lj ? Object.keys(lj) : null;
    if (lj?.id) {
      const params = new URLSearchParams(body.params ?? { page: "1", limit: "3" });
      const cr = await fetch(BASE + "api/transportador/canhotos?" + params, {
        headers: { "auth-token": lj.id, "sigla-sistema": "APP" },
      });
      const txt = await cr.text();
      out.canhotos_status = cr.status;
      out.amostra = txt.slice(0, 3500);
    }
  } catch (e) {
    out.erro = String(e);
  }
  return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
