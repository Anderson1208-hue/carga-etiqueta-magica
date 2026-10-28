// Consulta somente leitura do portal MO/Cacau Show (Canhotos - Transportador).
// Grava status, status de validação e "possui imagem" por chave da NF.
// Nunca aprova, exclui ou envia imagem; nunca devolve token ou resposta de login.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { operatorAccessStatus } from "../_shared/approved-operator.ts";
import { chavesJaValidas, filtrarPendentes } from "../_shared/ibac-consulta-regras.ts";

const BASE = "https://cacaushow.mosistemas.com/app/";
const LIMIT = 200;
const MAX_PAGINAS = 30;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ts = (v: unknown) => {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

Deno.serve(async (req) => {
  try { return await handler(req); } catch (e) { return json({ error: String((e as Error)?.message ?? e) }, 500); }
});

async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const cronToken = req.headers.get("x-okentrega-cron");
  let autorizado = false;
  if (cronToken) {
    const { data } = await admin.rpc("okentrega_validar_cron", { p_token: cronToken });
    autorizado = data === true;
  }
  if (!autorizado) {
    const st = await operatorAccessStatus(req.headers.get("Authorization"), admin as any);
    if (st) return json({ error: st === 401 ? "Não autenticado" : "Operador não aprovado" }, st);
  }

  const t0 = Date.now();
  const lr = await fetch(BASE + "api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "sigla-sistema": "APP" },
    body: JSON.stringify({
      email: Deno.env.get("IBAC_PORTAL_USUARIO") ?? "",
      senha: Deno.env.get("IBAC_PORTAL_SENHA") ?? "",
      empresa: null,
      siglaSistema: "APP",
    }),
  });
  const lj: any = await lr.json().catch(() => null);
  if (!lj?.id) return json({ error: "Falha no login do portal Cacau Show" }, 502);
  const headers = {
    "auth-token": String(lj.id),
    "sigla-sistema": String(lj.produto ?? "APP"),
    Cookie: `auth-token=${lj.id}; timezone-offset=180`,
    Accept: "application/json",
  };

  let offset = 0, total = 0, gravadas = 0, puladas = 0, paginas = 0;
  const vistas = new Set<string>();
  const mapear = (x: any) => ({
    chave: x.chave,
    numero_nf: x.numero != null ? String(x.numero) : null,
    status_portal: x.status ?? null,
    status_validacao: x.statusValidacaoIA ?? null,
    possui_imagem: x.possuiImagem ?? null,
    justificativa: x.justificativa ?? null,
    recebedor: x.recebedor ?? null,
    data_entrega: ts(x.dataEntregaNfe),
    data_criacao_portal: ts(x.dataCriacao),
    consultado_em: new Date().toISOString(),
  });
  while (paginas < MAX_PAGINAS) {
    const r = await fetch(`${BASE}api/transportador/canhotos?limit=${LIMIT}&offset=${offset}`, { headers });
    if (!r.ok) return json({ error: `Portal respondeu ${r.status}`, gravadas }, 502);
    const p: any = await r.json();
    const rows = Array.isArray(p?.data) ? p.data : [];
    total = Number(p?.total ?? 0);
    const up = rows
      .filter((x: any) => typeof x?.chave === "string" && x.chave.length === 44)
      .map(mapear);
    up.forEach((u: any) => vistas.add(u.chave));
    const chaves = up.map((u: any) => u.chave);
    const validas = await chavesJaValidas(admin, chaves);
    const { aGravar, puladas: puladasPagina } = filtrarPendentes(up, validas);
    puladas += puladasPagina;
    if (aGravar.length) {
      const { error } = await admin.from("ibac_portal_validacao").upsert(aGravar, { onConflict: "chave" });
      if (error) return json({ error: error.message, gravadas }, 500);
      gravadas += aGravar.length;
    }
    paginas++;
    offset += LIMIT;
    if (rows.length < LIMIT || offset >= total) break;
  }
  // A lista sem filtro só traz notas cadastradas recentemente no portal.
  // Canhotos enviados nos últimos 30 dias que não vieram na lista e ainda não
  // estão VÁLIDO aqui são consultados individualmente pela chave (somente leitura).
  const desde = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: enviados } = await admin.from("ibac_eventos_queue")
    .select("chave_acesso").eq("evento_interno", "envio_canhoto").eq("status", "enviado")
    .gte("enviado_em", desde).not("chave_acesso", "is", null).order("enviado_em", { ascending: false }).limit(2000);
  const candidatas = [...new Set((enviados ?? []).map((e: any) => e.chave_acesso as string))]
    .filter((c) => c.length === 44 && !vistas.has(c));
  const jaValidas = await chavesJaValidas(admin, candidatas);
  const individuais = candidatas.filter((c) => !jaValidas.has(c)).slice(0, 150);
  let individuaisGravadas = 0, naoEncontradas = 0;
  for (const chave of individuais) {
    if (Date.now() - t0 > 120000) break;
    await new Promise((r) => setTimeout(r, 400));
    const r = await fetch(`${BASE}api/transportador/canhotos?limit=5&offset=0&chave=${chave}`, { headers });
    if (!r.ok) continue;
    const p: any = await r.json().catch(() => null);
    const hit = (Array.isArray(p?.data) ? p.data : []).filter((x: any) => x?.chave === chave);
    if (hit.length !== 1) { naoEncontradas++; continue; }
    const { error } = await admin.from("ibac_portal_validacao").upsert([mapear(hit[0])], { onConflict: "chave" });
    if (!error) individuaisGravadas++;
  }
  gravadas += individuaisGravadas;
  return json({ ok: true, total_portal: total, gravadas, puladas, paginas, individuais: individuais.length, individuais_gravadas: individuaisGravadas, nao_encontradas: naoEncontradas, duracao_ms: Date.now() - t0 });
}
