// Envia o resumo de divergências de recebimento de uma carga (carreta) somente para arquivostlm.
// Nada é enviado à Cacau: o operador baixa planilha + fotos na tela e envia manualmente.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { operatorAccessStatus } from '../_shared/approved-operator.ts'

const TIPOS: Record<string, string> = { falta_parcial: 'Falta parcial', avaria: 'Avaria', falta_total: 'Falta total (NF cancelada)', sobra: 'Sobra' }
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const auth = req.headers.get('Authorization')
  const negado = await operatorAccessStatus(auth, sb as any)
  if (negado) return json({ error: 'não autorizado' }, negado)
  const { data: u } = await sb.auth.getUser(auth!.replace(/^Bearer\s+/i, ''))
  const corpo: any = await req.json().catch(() => ({}))
  const cargaId = String(corpo?.carga_id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(cargaId)) return json({ error: 'carga inválida' }, 400)

  const clientes = corpo?.origem === 'clientes'
  const { data: itens, error } = clientes
    ? await sb.from('divergencias_recebimento_clientes')
      .select('id, numero_nf, c_prod, x_prod, status, embarcador, retorno_cd, quantidade, observacao, fotos')
      .eq('carga_id', cargaId).is('cancelado_em', null).order('embarcador').order('numero_nf').order('c_prod').limit(1000)
      .then((r: any) => ({ ...r, data: (r.data ?? []).map((i: any) => ({ ...i, tipo: `${i.embarcador} — ${i.status}${i.retorno_cd ? ` (${i.retorno_cd})` : ''}` })) }))
    : await sb.from('divergencias_recebimento')
      .select('id, numero_nf, c_prod, x_prod, tipo, quantidade, observacao, fotos')
      .eq('carga_id', cargaId).is('cancelado_em', null).order('numero_nf').order('c_prod').limit(1000)
  if (error) return json({ error: error.message }, 500)
  if (!itens?.length) return json({ error: 'Nenhuma divergência lançada nesta carga' }, 400)
  const { data: carga } = await sb.from('cargas').select('numero_carga, placa').eq('id', cargaId).maybeSingle()
  const { data: perfil } = await sb.from('profiles').select('full_name, email').eq('id', u.user!.id).maybeSingle()

  const assinatura = itens.map((i) => i.id).sort().join(',')
  let h = 0; for (const c of assinatura) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const { error: e2 } = await sb.functions.invoke('send-transactional-email', {
    body: {
      templateName: 'divergencia-recebimento',
      idempotencyKey: `divergencia-recebimento-${clientes ? 'clientes-' : ''}${cargaId}-${itens.length}-${h}`,
      templateData: {
        carga: carga?.numero_carga ?? '', placa: carga?.placa ?? '',
        data: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        operador: perfil?.full_name || perfil?.email || '',
        itens: itens.map((i) => ({ nf: i.numero_nf, codigo: i.c_prod ? String(i.c_prod).replace(/^0+/, '') : '', descricao: i.x_prod ?? '',
          tipo: TIPOS[i.tipo] ?? i.tipo, quantidade: i.quantidade, observacao: i.observacao ?? '', fotos: (i.fotos ?? []).length })),
        canceladas: itens.filter((i) => i.tipo === 'falta_total').map((i) => i.numero_nf),
      },
    },
  })
  if (e2) { console.error('[divergencia-resumo-email]', e2); return json({ error: 'Falha no envio do e-mail' }, 502) }
  if (!clientes) await sb.from('divergencias_recebimento_envios').insert({ carga_id: cargaId, ocorrencias: itens.length, enviado_por: u.user!.id })
  return json({ ok: true, ocorrencias: itens.length })
})
