// Consolidado de TODAS as divergências de recebimento (desde o início), uma aba por embarcador.
// acao 'enviar': gera, guarda no armazenamento privado e envia link para gessica.rodrigues (após cada lançamento).
// acao 'baixar': gera e devolve link temporário (opcionalmente só de um embarcador).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import * as XLSX from 'npm:xlsx@0.18.5'
import { operatorAccessStatus } from '../_shared/approved-operator.ts'
import { CABECALHO, embarcadorDe, linhasPlanilha, type DivergenciaRow, type ItemNf } from '../_shared/divergencia-planilha.ts'

const BUCKET = 'divergencias-recebimento'
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const negado = await operatorAccessStatus(req.headers.get('Authorization'), sb as any)
  if (negado) return json({ error: 'não autorizado' }, negado)
  const corpo: any = await req.json().catch(() => ({}))
  const acao = corpo?.acao === 'enviar' ? 'enviar' : 'baixar'
  const filtro = typeof corpo?.embarcador === 'string' && /^[A-Z0-9]{2,20}$/.test(corpo.embarcador) ? corpo.embarcador : null

  const itens: any[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from('divergencias_recebimento')
      .select('id, carga_id, nf_id, numero_nf, c_prod, x_prod, tipo, quantidade, observacao, fotos, criado_em, criado_por_nome')
      .is('cancelado_em', null).order('criado_em').order('id').range(de, de + 999)
    if (error) return json({ error: error.message }, 500)
    itens.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  const nfIds = [...new Set(itens.map((i) => i.nf_id))]
  const cargaIds = [...new Set(itens.map((i) => i.carga_id).filter(Boolean))]
  const nfs = new Map<string, any>(); const cargas = new Map<string, any>()
  for (let k = 0; k < nfIds.length; k += 200) {
    const { data, error } = await sb.from('notas_fiscais').select('id, cnpj_emitente, razao_social_emitente, data_emissao, itens_nf(c_prod, x_prod, q_com)').in('id', nfIds.slice(k, k + 200))
    if (error) return json({ error: error.message }, 500)
    for (const n of data ?? []) nfs.set(n.id, n)
  }
  for (let k = 0; k < cargaIds.length; k += 200) {
    const { data, error } = await sb.from('cargas').select('id, numero_carga, placa').in('id', cargaIds.slice(k, k + 200))
    if (error) return json({ error: error.message }, 500)
    for (const c of data ?? []) cargas.set(c.id, c)
  }

  const porEmb = new Map<string, (string | number)[][]>()
  for (const d of itens) {
    const n = nfs.get(d.nf_id); const c = cargas.get(d.carga_id) ?? {}
    const emb = embarcadorDe(n?.cnpj_emitente, n?.razao_social_emitente)
    if (filtro && emb !== filtro) continue
    const linhas = linhasPlanilha([d as DivergenciaRow], {
      numeroCarga: c.numero_carga ?? '', placa: c.placa ?? '',
      emissaoPorNf: { [d.numero_nf]: n?.data_emissao ?? null }, itensPorNf: { [d.numero_nf]: (n?.itens_nf ?? []) as ItemNf[] },
    }).map((l) => [emb, ...l])
    porEmb.set(emb, [...(porEmb.get(emb) ?? []), ...linhas])
  }
  const cab = ['Embarcador', ...CABECALHO]
  const wb = XLSX.utils.book_new()
  const todas: (string | number)[][] = [...porEmb.values()].flat()
  const aba = (rows: (string | number)[][], nome: string) => {
    const ws = XLSX.utils.aoa_to_sheet([cab, ...rows])
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: cab.length - 1 } }) }
    ws['!cols'] = cab.map((h) => ({ wch: Math.max(12, Math.min(40, h.length + 4)) }))
    XLSX.utils.book_append_sheet(wb, ws, nome)
  }
  aba(todas, 'TODAS')
  for (const emb of [...porEmb.keys()].sort()) aba(porEmb.get(emb)!, emb.slice(0, 31))
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const agora = new Date()
  const carimbo = agora.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(/[: ]/g, '-')
  const nome = `Consolidado_divergencias${filtro ? `_${filtro}` : ''}_${carimbo}.xlsx`
  const path = `consolidado/${nome}`
  const up = await sb.storage.from(BUCKET).upload(path, new Blob([bytes]), {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: false })
  if (up.error) return json({ error: up.error.message }, 500)
  const validade = acao === 'enviar' ? 60 * 60 * 24 * 7 : 300
  const { data: s, error: e3 } = await sb.storage.from(BUCKET).createSignedUrl(path, validade, { download: nome })
  if (e3 || !s) return json({ error: e3?.message ?? 'link indisponível' }, 500)

  if (acao === 'enviar') {
    const { error: e4 } = await sb.functions.invoke('send-transactional-email', { body: {
      templateName: 'divergencia-consolidado',
      idempotencyKey: `divergencia-consolidado-${itens.length}-${itens.at(-1)?.id ?? 'vazio'}`,
      templateData: { link: s.signedUrl, total: todas.length, ocorrencias: itens.length,
        quando: agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        embarcadores: [...porEmb.entries()].map(([e, r]) => `${e}: ${r.length} linha(s)`).join(' · ') },
    } })
    if (e4) { console.error('[divergencia-consolidado]', e4); return json({ error: 'Falha no envio do e-mail' }, 502) }
  }
  return json({ ok: true, url: s.signedUrl, nome, ocorrencias: itens.length })
})
