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

  if (corpo?.falta_direta_cliente_nf_id) {
    const nfId = String(corpo.falta_direta_cliente_nf_id)
    if (!/^[0-9a-f-]{36}$/i.test(nfId)) return json({ error: 'nf inválida' }, 400)
    const { data: tot } = await sb.rpc('nf_falta_total_cliente', { _nf: nfId })
    if (!tot) return json({ ok: true, falta_total: false })
    const { data: d } = await sb.from('divergencias_recebimento_clientes').select('numero_nf, carga_id').eq('nf_id', nfId).eq('status', 'FALTA').is('cancelado_em', null).order('criado_em').limit(1).maybeSingle()
    const { data: c } = d?.carga_id ? await sb.from('cargas').select('numero_carga, placa').eq('id', d.carga_id).maybeSingle() : { data: null }
    const { data: n } = await sb.from('notas_fiscais').select('numero_nf, dest_razao_social').eq('id', nfId).maybeSingle()
    const { data: p } = await sb.from('profiles').select('full_name, email').eq('id', u.user!.id).maybeSingle()
    const { error: ef } = await sb.functions.invoke('send-transactional-email', { body: {
      templateName: 'falta-direta-cd', idempotencyKey: `falta-direta-cd-cli-${nfId}`,
      templateData: { nf: (n as any)?.numero_nf ?? d?.numero_nf ?? '', carga: c?.numero_carga ?? '', placa: c?.placa ?? '', destinatario: (n as any)?.dest_razao_social ?? '',
        data: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), operador: p?.full_name || p?.email || '' } } })
    if (ef) { console.error('[falta-direta-cd-cli]', ef); return json({ error: 'Falha no envio do e-mail' }, 502) }
    return json({ ok: true, falta_total: true })
  }
  if (corpo?.falta_direta_divergencia_id) {
    const id = String(corpo.falta_direta_divergencia_id)
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'divergência inválida' }, 400)
    const { data: d } = await sb.from('divergencias_recebimento').select('id, numero_nf, nf_id, carga_id, tipo, cancelado_em').eq('id', id).maybeSingle()
    if (!d || d.tipo !== 'falta_total' || d.cancelado_em) return json({ error: 'não é falta total ativa' }, 400)
    const { data: c } = d.carga_id ? await sb.from('cargas').select('numero_carga, placa').eq('id', d.carga_id).maybeSingle() : { data: null }
    const { data: n } = await sb.from('notas_fiscais').select('dest_razao_social').eq('id', d.nf_id).maybeSingle()
    const { data: p } = await sb.from('profiles').select('full_name, email').eq('id', u.user!.id).maybeSingle()
    const { error: ef } = await sb.functions.invoke('send-transactional-email', { body: {
      templateName: 'falta-direta-cd', idempotencyKey: `falta-direta-cd-${id}`,
      templateData: { nf: d.numero_nf, carga: c?.numero_carga ?? '', placa: c?.placa ?? '', destinatario: (n as any)?.dest_razao_social ?? '',
        data: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), operador: p?.full_name || p?.email || '' } } })
    if (ef) { console.error('[falta-direta-cd]', ef); return json({ error: 'Falha no envio do e-mail' }, 502) }
    return json({ ok: true })
  }
  const cargaId = String(corpo?.carga_id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(cargaId)) return json({ error: 'carga inválida' }, 400)
  const clientes = corpo?.origem === 'clientes'
  const { data: itens, error } = clientes
    ? await sb.from('divergencias_recebimento_clientes')
      .select('id, numero_nf, c_prod, x_prod, status, embarcador, retorno_cd, quantidade, observacao, fotos')
      .eq('carga_id', cargaId).is('cancelado_em', null).order('embarcador').order('numero_nf').order('c_prod').limit(1000)
      .then((r: any) => ({ ...r, data: (r.data ?? []).map((i: any) => ({ ...i, tipo: `${i.embarcador} — ${i.status}` })) }))
    : await sb.from('divergencias_recebimento')
      .select('id, numero_nf, c_prod, x_prod, tipo, quantidade, observacao, fotos')
      .eq('carga_id', cargaId).is('cancelado_em', null).order('numero_nf').order('c_prod').limit(1000)
  if (error) return json({ error: error.message }, 500)
  if (!itens?.length) return json({ error: 'Nenhuma divergência lançada nesta carga' }, 400)
  const { data: carga } = await sb.from('cargas').select('numero_carga, placa').eq('id', cargaId).maybeSingle()
  const { data: perfil } = await sb.from('profiles').select('full_name, email').eq('id', u.user!.id).maybeSingle()

  // Fotos seguem no e-mail como imagem + link assinado (30 dias); originais intactas no armazenamento.
  const urls = new Map<string, string>()
  const caminhos = itens.flatMap((i: any) => i.fotos ?? [])
  for (let k = 0; k < caminhos.length; k += 100) {
    const { data: ass } = await sb.storage.from('divergencias-recebimento').createSignedUrls(caminhos.slice(k, k + 100), 60 * 60 * 24 * 30)
    for (const a of ass ?? []) if (a.signedUrl && a.path) urls.set(a.path, a.signedUrl)
  }
  const assinatura = itens.map((i) => i.id).sort().join(',')
  let h = 0; for (const c of assinatura) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const { error: e2 } = await sb.functions.invoke('send-transactional-email', {
    body: {
      templateName: 'divergencia-recebimento',
      idempotencyKey: `divergencia-recebimento-f-${clientes ? 'clientes-' : ''}${cargaId}-${itens.length}-${h}`,
      templateData: {
        carga: carga?.numero_carga ?? '', placa: carga?.placa ?? '',
        data: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        operador: perfil?.full_name || perfil?.email || '',
        itens: itens.map((i) => ({ nf: i.numero_nf, codigo: i.c_prod ? String(i.c_prod).replace(/^0+/, '') : '', descricao: i.x_prod ?? '',
          tipo: TIPOS[i.tipo] ?? i.tipo, quantidade: i.quantidade, observacao: i.observacao ?? '', fotos: (i.fotos ?? []).length,
          fotoUrls: (i.fotos ?? []).map((f: string) => urls.get(f)).filter(Boolean) })),
        canceladas: itens.filter((i) => i.tipo === 'falta_total').map((i) => i.numero_nf),
      },
    },
  })
  if (e2) { console.error('[divergencia-resumo-email]', e2); return json({ error: 'Falha no envio do e-mail' }, 502) }
  if (!clientes) await sb.from('divergencias_recebimento_envios').insert({ carga_id: cargaId, ocorrencias: itens.length, enviado_por: u.user!.id })
  return json({ ok: true, ocorrencias: itens.length })
})
