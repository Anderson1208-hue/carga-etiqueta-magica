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
const MAX_RODADAS = 20; // 20 blocos encadeados ≈ 1.600 notas por consulta
const ORCAMENTO_MS = 110000;
const INICIO_ACOMPANHAMENTO = "2026-10-22T03:00:00.000Z";

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
  // Continuação encadeada da consulta individual (sem teto fixo de notas por rodada).
  const corpo: any = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const continuacao = corpo?.fase === "individual";
  const apos = typeof corpo?.apos === "string" && /^\d{44}$/.test(corpo.apos) ? corpo.apos : "";
  const rodada = Number.isInteger(corpo?.rodada) ? Math.min(Math.max(corpo.rodada, 1), MAX_RODADAS) : 1;
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
  while (!continuacao && paginas < MAX_PAGINAS) {
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
  const faseIndividual = async () => {
    // A lista sem filtro só traz notas cadastradas recentemente no portal.
    // Canhotos enviados nos últimos 30 dias que não vieram na lista e ainda não
    // estão VÁLIDO aqui são consultados individualmente pela chave (somente leitura).
    // Janela: últimos 30 dias, nunca antes do início do acompanhamento (22/10/2026).
    const trintaDias = new Date(Date.now() - 30 * 86400000).toISOString();
    const desde = trintaDias > INICIO_ACOMPANHAMENTO ? trintaDias : INICIO_ACOMPANHAMENTO;
    const { data: enviados } = await admin.from("ibac_eventos_queue")
      .select("chave_acesso").eq("evento_interno", "envio_canhoto").eq("status", "enviado")
      .gte("enviado_em", desde).not("chave_acesso", "is", null).order("enviado_em", { ascending: false }).limit(5000);
    // Ordem estável por chave + cursor: cada bloco continua de onde o anterior parou.
    const candidatas = [...new Set((enviados ?? []).map((e: any) => e.chave_acesso as string))]
      .filter((c) => c.length === 44 && !vistas.has(c) && c > apos)
      .sort();
    const jaValidas = await chavesJaValidas(admin, candidatas);
    const individuais = candidatas.filter((c) => !jaValidas.has(c));
    let individuaisGravadas = 0, naoEncontradas = 0, processadas = 0, bloqueioPortal = false;
    for (const chave of individuais) {
      if (Date.now() - t0 > ORCAMENTO_MS) break;
      await new Promise((r) => setTimeout(r, 1100));
      const r = await fetch(`${BASE}api/transportador/canhotos?limit=5&offset=0&chave=${chave}`, { headers });
      if (r.status === 429) { bloqueioPortal = true; break; }
      processadas++;
      if (!r.ok) continue;
      const p: any = await r.json().catch(() => null);
      const hit = (Array.isArray(p?.data) ? p.data : []).filter((x: any) => x?.chave === chave);
      if (hit.length !== 1) { naoEncontradas++; continue; }
      const { error } = await admin.from("ibac_portal_validacao").upsert([mapear(hit[0])], { onConflict: "chave" });
      if (!error) individuaisGravadas++;
    }
    const restantes = individuais.length - processadas;
    let encadeado = false;
    if (restantes > 0 && processadas > 0 && !bloqueioPortal && rodada < MAX_RODADAS) {
      const fwd: Record<string, string> = { "Content-Type": "application/json" };
      const cron = req.headers.get("x-okentrega-cron");
      const auth = req.headers.get("Authorization");
      const apikey = req.headers.get("apikey");
      if (cron) fwd["x-okentrega-cron"] = cron;
      if (auth) fwd["Authorization"] = auth;
      if (apikey) fwd["apikey"] = apikey;
      const proxima = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ibac-portal-consultar`, {
        method: "POST", headers: fwd,
        body: JSON.stringify({ fase: "individual", apos: individuais[processadas - 1], rodada: rodada + 1 }),
      }).then((r) => r.body?.cancel()).catch(() => console.log(JSON.stringify({ erro: "encadeamento_falhou", rodada })));
      await proxima;
      encadeado = true;
    }
    console.log(JSON.stringify({ rodada, candidatas: individuais.length, processadas, gravadas: individuaisGravadas, nao_encontradas: naoEncontradas, restantes, encadeado, bloqueioPortal }));
  return { individuais: individuais.length, processadas, restantes, encadeado, individuaisGravadas, naoEncontradas };
  };
  if (continuacao) {
    // Bloco encadeado: responde na hora e trabalha em segundo plano.
    // @ts-ignore EdgeRuntime existe no runtime das funções
    EdgeRuntime.waitUntil(faseIndividual().catch((e) => console.log(JSON.stringify({ erro: String(e), rodada }))));
    return json({ ok: true, aceito: true, rodada }, 202);
  }
  const { individuais, processadas, restantes, encadeado, individuaisGravadas, naoEncontradas } = await faseIndividual();
  gravadas += individuaisGravadas;
  return json({ ok: true, total_portal: total, gravadas, puladas, paginas, rodada, individuais: individuais.length, processadas, restantes, encadeado, individuais_gravadas: individuaisGravadas, nao_encontradas: naoEncontradas, duracao_ms: Date.now() - t0 });
}
