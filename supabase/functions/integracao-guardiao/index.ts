// Guardião das rodadas agendadas OK Entrega / Cacau Show (IBAC).
// Dispara a consulta; se falhar, reagenda nova tentativa em 10 min (até 5 no total).
// Na 5ª falha, cancela a repetição e avisa por e-mail. Só consulta, nunca envia imagem.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const MAX_TENTATIVAS = 5
const ALVOS: Record<string, { fn: string; body: unknown; nome: string }> = {
  okentrega: { fn: 'okentrega-consultar', body: { acao: 'lote' }, nome: 'OK Entrega (Pandurata)' },
  ibac: { fn: 'ibac-portal-consultar', body: {}, nome: 'Cacau Show (IBAC/IBAE)' },
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token = req.headers.get('x-okentrega-cron')
  if (!token) return json({ error: 'não autorizado' }, 401)
  const { data: ok } = await sb.rpc('okentrega_validar_cron', { p_token: token })
  if (ok !== true) return json({ error: 'não autorizado' }, 401)

  const corpo: any = await req.json().catch(() => ({}))
  const alvo = ALVOS[corpo?.integracao]
  const tentativa = Number.isInteger(corpo?.tentativa) ? Math.min(Math.max(corpo.tentativa, 1), MAX_TENTATIVAS) : 1
  if (!alvo) return json({ error: 'integração inválida' }, 400)
  const integracao = corpo.integracao as string

  let status: number | null = null
  let erro: string | null = null
  try {
    const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${alvo.fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-okentrega-cron': token },
      body: JSON.stringify(alvo.body),
      signal: AbortSignal.timeout(110_000),
    })
    status = r.status
    if (!r.ok) {
      const t = await r.json().catch(() => null)
      erro = String(t?.error ?? `HTTP ${r.status}`).slice(0, 300)
    } else await r.body?.cancel()
  } catch (e) {
    erro = `Falha de comunicação: ${String((e as Error)?.message ?? e).slice(0, 250)}`
  }
  const sucesso = erro === null
  await sb.from('integracao_tentativas').insert({ integracao, tentativa, sucesso, http_status: status, erro })

  if (sucesso) {
    await sb.rpc('integracao_retry_cancelar', { p_integracao: integracao })
    return json({ ok: true, tentativa })
  }
  if (tentativa < MAX_TENTATIVAS) {
    await sb.rpc('integracao_retry_agendar', { p_integracao: integracao, p_tentativa: tentativa + 1 })
    return json({ ok: false, tentativa, proxima: tentativa + 1, erro })
  }
  await sb.rpc('integracao_retry_cancelar', { p_integracao: integracao })
  const dia = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const hora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const { error: e2 } = await sb.functions.invoke('send-transactional-email', {
    body: {
      templateName: 'integracao-falha',
      idempotencyKey: `integracao-falha-${integracao}-${Date.now()}`,
      templateData: { integracao: alvo.nome, tentativas: MAX_TENTATIVAS, erro, quando: hora, dia },
    },
  })
  if (e2) console.error('[integracao-guardiao] envio de e-mail falhou', e2)
  return json({ ok: false, tentativa, esgotado: true, email: !e2, erro })
})
