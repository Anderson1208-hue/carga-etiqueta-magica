// Correção de canhoto reprovado no portal Cacau Show.
// "anexar": guarda a nova foto (objeto novo no storage) sem enviar.
// "reenviar": cria um novo envio_canhoto na fila do ibac-sync com a nova foto e dispara o envio.
// Fotos anteriores e envios originais são preservados; não aprova nada no portal.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { operatorAccessStatus } from "../_shared/approved-operator.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Body = z.object({
  acao: z.enum(["anexar", "reenviar"]),
  chave: z.string().regex(/^\d{44}$/),
  nova_foto_path: z.string().regex(/^ibac-correcoes\/\d{44}\/[0-9a-f-]{36}\.(jpg|png)$/i).optional(),
});

const reprovado = (r: any) =>
  String(r?.status_validacao ?? "").toUpperCase().includes("INVALID") ||
  String(r?.status_portal ?? "").toUpperCase().includes("REPROV");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, key);
  const st = await operatorAccessStatus(req.headers.get("Authorization"), admin as any);
  if (st) return json({ mensagem: st === 401 ? "Não autenticado" : "Operador não aprovado" }, st);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ mensagem: "Dados inválidos" }, 400);
  const { acao, chave, nova_foto_path } = parsed.data;

  const { data: linha } = await admin.from("ibac_portal_validacao").select("*").eq("chave", chave).maybeSingle();
  if (!linha) return json({ mensagem: "Nota não encontrada na validação do portal" }, 404);
  if (!reprovado(linha)) return json({ mensagem: "Somente notas reprovadas podem ser corrigidas" }, 409);

  if (acao === "anexar") {
    if (!nova_foto_path || !nova_foto_path.includes(`/${chave}/`)) return json({ mensagem: "Foto inválida" }, 400);
    const { error } = await admin.from("ibac_portal_validacao").update({
      nova_foto_path, nova_foto_anexada_em: new Date().toISOString(),
      nova_foto_enviada_em: null, nova_foto_queue_id: null, nova_foto_resultado: null,
    }).eq("chave", chave);
    if (error) return json({ mensagem: error.message }, 500);
    return json({ status: "foto_anexada" });
  }

  // reenviar
  if (!linha.nova_foto_path) return json({ mensagem: "Anexe uma nova foto antes de reenviar" }, 409);
  if (linha.nova_foto_enviada_em) return json({ mensagem: "Esta foto já foi reenviada; anexe outra se necessário" }, 409);

  const { data: original } = await admin.from("ibac_eventos_queue")
    .select("*").eq("chave_acesso", chave).eq("evento_interno", "envio_canhoto")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!original) return json({ mensagem: "Envio original do canhoto não encontrado na fila" }, 404);

  const payload = { ...(original.payload as any), foto_recibo_path: linha.nova_foto_path, foto_path: linha.nova_foto_path, correcao_portal: true };
  const { data: novo, error: insErr } = await admin.from("ibac_eventos_queue").insert({
    evento_interno: "envio_canhoto", nf_id: original.nf_id, carga_id: original.carga_id,
    baixa_id: original.baixa_id, chave_acesso: chave, payload, status: "pendente", tentativas: 0,
    created_at: original.created_at, // entra na frente da fila, na mesma posição do envio original
  }).select("id").single();
  if (insErr || !novo) return json({ mensagem: insErr?.message ?? "Falha ao criar envio" }, 500);

  await admin.from("ibac_portal_validacao").update({ nova_foto_queue_id: novo.id, nova_foto_enviada_em: new Date().toISOString() }).eq("chave", chave);

  await fetch(`${url}/functions/v1/ibac-sync`, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: "{}",
  }).catch(() => null);

  const { data: fila } = await admin.from("ibac_eventos_queue").select("status, erro_mensagem").eq("id", novo.id).maybeSingle();
  const resultado = fila?.status === "enviado" ? "enviado" : `${fila?.status ?? "pendente"}${fila?.erro_mensagem ? `: ${fila.erro_mensagem}` : ""}`;
  await admin.from("ibac_portal_validacao").update({ nova_foto_resultado: resultado }).eq("chave", chave);
  return json({ status: fila?.status ?? "pendente", mensagem: resultado });
});
