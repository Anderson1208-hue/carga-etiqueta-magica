// Sincronizacao de status/datas no portal Sirius Log (Bauducco) para varias notas.
// Por padrao dry_run = true (NAO grava nada). Gravacao exige { dry_run: false, confirmar: "SIM" }.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SSO = 'https://sso.siriuslog.com'
const GATEWAY = 'https://portal.siriuslog.com'
const CLIENT_ID = 'TKwlKiwd1YHgKhqHxRbnECCRIZga'
const CLIENT_SECRET = 'vQMfgzLe2TIgnkPz39j9gr9h7gsa'
const REDIRECT = 'https://bauducco.siriuslog.com/#/login'
const TENANT = 'bauducco.siriuslog.com'
const TRACK = `${GATEWAY}/sirius-national-tracking-api/v1`

// Cadeia de status detalhado do portal.
const CHAIN = [
  { id: 21, nome: 'Em trânsito para filial da transportadora' },
  { id: 22, nome: 'Na filial da transportadora' },
  { id: 23, nome: 'Em trânsito para cliente' },
  { id: 2, nome: 'Aguardando descarga' },
  { id: 17, nome: 'Entrega realizada aguardando canhoto' },
]
// Status finais/paralelos do portal: nao devem ser regredidos nem alterados por nos.
const FINAIS = [
  'entrega realizada aguardando baixa edi',
  'entrega realizada e baixada no sap',
  'recusa aguardando instrução embarcador',
  'devolução total com autorização',
  'canhoto retido no cliente',
]
const idxPorNome = (n: string | null) => {
  if (!n) return 0
  const alvo = n.trim().toLowerCase()
  if (FINAIS.includes(alvo)) return 99
  const i = CHAIN.findIndex((c) => c.nome.toLowerCase() === alvo)
  return i < 0 ? 0 : i
}
const hojeBR = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
const maxData = (a: string | null, b: string) => (a && a > b ? a : b)

type Jar = Record<string, string>
function saveCookies(res: Response, jar: Jar) {
  for (const [k, v] of res.headers.entries()) {
    if (k.toLowerCase() !== 'set-cookie') continue
    for (const part of v.split(/,(?=[^;]+=)/)) {
      const m = part.trim().match(/^([^=]+)=([^;]*)/)
      if (m) jar[m[1]] = m[2]
    }
  }
}
const cookieHeader = (jar: Jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')

async function login(user: string, pass: string) {
  const jar: Jar = {}
  const authUrl = `${SSO}/oauth2/authorize?` + new URLSearchParams({
    response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT, scope: 'openid',
  })
  let res = await fetch(authUrl, { redirect: 'manual' })
  saveCookies(res, jar)
  let loc = res.headers.get('location')
  let sessionDataKey: string | null = null
  if (loc) {
    const abs = loc.startsWith('http') ? loc : `${SSO}${loc}`
    sessionDataKey = new URL(abs).searchParams.get('sessionDataKey')
    if (!sessionDataKey) {
      res = await fetch(abs, { redirect: 'manual', headers: { cookie: cookieHeader(jar) } })
      saveCookies(res, jar)
      sessionDataKey = (await res.text()).match(/sessionDataKey["'\s=:]+([\w-]+)/)?.[1] ?? null
    }
  }
  if (!sessionDataKey) throw new Error('sessionDataKey_nao_encontrada')

  res = await fetch(`${SSO}/commonauth`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: cookieHeader(jar) },
    body: new URLSearchParams({ username: user, password: pass, sessionDataKey, tocommonauth: 'true' }),
  })
  saveCookies(res, jar)
  loc = res.headers.get('location')
  let code: string | null = null
  let hops = 0
  while (loc && hops < 6) {
    hops++
    const abs = loc.startsWith('http') ? loc : `${SSO}${loc}`
    code = new URL(abs.replace('/#/', '/')).searchParams.get('code')
    if (code) break
    if (abs.startsWith('https://bauducco.siriuslog.com')) break
    const r = await fetch(abs, { redirect: 'manual', headers: { cookie: cookieHeader(jar) } })
    saveCookies(r, jar)
    loc = r.headers.get('location')
  }
  if (!code) throw new Error('authorization_code_nao_obtido')

  res = await fetch(`${SSO}/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT }),
  })
  if (!res.ok) throw new Error(`token_${res.status}`)
  return (await res.json()).access_token as string
}

const iso = (d: string | null | undefined, hora = '08:00:00') => {
  if (!d) return null
  const s = String(d)
  if (s.includes('T') || s.includes(' ')) {
    // timestamp -> converte para horario de Brasilia
    const dt = new Date(s.replace(' ', 'T'))
    const br = new Date(dt.getTime() - 3 * 3600 * 1000)
    return `${br.toISOString().slice(0, 19)}-03:00`
  }
  return `${s}T${hora}-03:00`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const dryRun = body.dry_run !== false
  const confirmado = String(body.confirmar ?? '') === 'SIM'
  const de = String(body.de ?? '2026-09-01')
  const ate = String(body.ate ?? '2026-12-31')
  const limite = Number(body.limite ?? 20)
  const offset = Number(body.offset ?? 0)
  const nfsFiltro = Array.isArray(body.nfs) ? (body.nfs as unknown[]).map(String) : null

  const out: Record<string, unknown> = {
    modo: dryRun ? 'SIMULACAO (nada e gravado)' : confirmado ? 'GRAVACAO' : 'BLOQUEADO (falta confirmar)',
    de, ate, limite, offset,
  }
  const json = (s = 200) =>
    new Response(JSON.stringify(out, null, 2), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

  if (!dryRun && !confirmado) { out.erro = 'gravacao_nao_confirmada'; return json() }

  const user = Deno.env.get('SIRIUSLOG_USER')
  const pass = Deno.env.get('SIRIUSLOG_PASSWORD')
  if (!user || !pass) { out.erro = 'credenciais_ausentes'; return json() }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Plano por nota, a partir dos nossos dados
  const { data: plano, error } = await sb.rpc('siriuslog_plano', { p_de: de, p_ate: ate })
  if (error) { out.erro = error.message; return json() }
  let linhas = (plano ?? []) as Record<string, string | null>[]
  if (nfsFiltro) linhas = linhas.filter((l) => nfsFiltro.includes(String(l.numero_nf)))
  out.total_notas = linhas.length
  linhas = linhas.slice(offset, offset + limite)

  let access: string
  try { access = await login(user, pass) } catch (e) { out.erro = String(e); return json() }
  const headers = { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json', tenant: TENANT }

  const get = async (url: string) => {
    const r = await fetch(url, { headers })
    const t = await r.text()
    try { return { status: r.status, body: JSON.parse(t) } } catch { return { status: r.status, body: null } }
  }

  const cacheDetalhe = new Map<number, Record<string, unknown>[]>()
  const resultados: unknown[] = []

  for (const l of linhas) {
    const nf = String(l.numero_nf)
    const r: Record<string, unknown> = { nf }
    try {
      const nfe = await get(`${GATEWAY}/sirius-load-composition-api/nfe?number=${nf}&size=5`)
      const ids = ((nfe.body as { content?: { id: number }[] })?.content ?? []).map((x) => x.id)
      if (!ids.length) { r.situacao = 'nao_encontrada_no_portal'; resultados.push(r); continue }
      const view = await get(`${TRACK}/trip/delivery/status/view?page=0&size=5&invoiceIds=${ids.join(',')}`)
      const reg = ((view.body as { content?: { id: number }[] })?.content ?? [])[0]
      const tripId = reg?.id
      if (!tripId) { r.situacao = 'viagem_nao_encontrada'; resultados.push(r); continue }
      r.viagem = tripId
      let invs = cacheDetalhe.get(tripId)
      if (!invs) {
        const det = await get(`${TRACK}/trip/delivery/status/detail/${tripId}`)
        invs = ((det.body as { invoices?: Record<string, unknown>[] })?.invoices ?? [])
        cacheDetalhe.set(tripId, invs)
      }
      const inv = invs.find((x) => String(x.invoiceNumber ?? '') === nf)
      if (!inv) { r.situacao = 'nota_nao_esta_na_viagem'; resultados.push(r); continue }
      const detailId = inv.invoiceDetailId as number
      r.invoiceDetailId = detailId
      const atualNome = (inv.statusDetail as string | null) ?? null
      r.status_portal = atualNome
      const atual = idxPorNome(atualNome)

      // alvo conforme nossos dados
      let alvo = 1 // Na filial
      if (l.data_rot) alvo = 2 // Em transito para cliente
      if (l.baixa_entregue) alvo = 4 // Entrega realizada aguardando canhoto
      r.status_alvo = CHAIN[alvo].nome
      if (alvo <= atual) {
        r.situacao = atual === 99 ? 'status_final_no_portal' : 'ja_atualizado'
        resultados.push(r); continue
      }

      const passos: unknown[] = []

      // O portal exige que a previsao de chegada na filial esteja gravada ANTES de sair do status 21.
      if (atual === 0 && !inv.branchEstimatedArrivalDate) {
        const chegada = l.carga_updated ?? l.data_rot ?? hojeBR()
        // Endpoint de "current-status": grava apenas datas, sem mudar de status.
        // No status 21 o portal so aceita a previsao de chegada na filial.
        const pre: Record<string, unknown> = { branchEstimatedArrivalDate: iso(chegada) }
        if (dryRun) {
          passos.push({ etapa: 'previsoes', enviaria: pre })
        } else {
          const rp = await fetch(`${TRACK}/delivery-invoice-detail/${detailId}/current-status`, {
            method: 'PATCH', headers, body: JSON.stringify(pre),
          })
          const tp = await rp.text()
          passos.push({ etapa: 'previsoes', enviado: pre, http: rp.status, resposta: tp.slice(0, 300) })
        }
      }

      for (let i = atual + 1; i <= alvo; i++) {
        const payload: Record<string, unknown> = {
          tripId,
          tripInvoiceDetailedStatusId: CHAIN[i].id,
        }
        if (i === 1) {
          const chegada = l.carga_updated ?? l.data_rot ?? hojeBR()
          payload.branchArrivalDate = iso(chegada)
          payload.branchEstimatedArrivalDate =
            (inv.branchEstimatedArrivalDate as string) ?? iso(chegada)
          payload.estimatedDeliveryDate =
            (inv.estimatedDeliveryDate as string) ?? iso(maxData(l.previsao, hojeBR()), '18:00:00')
        }
        if (i === 2) {
          payload.branchDepartureDate = iso(l.data_rot, '08:00:00')
          // O portal exige previsao de entrega >= hoje nesta transicao.
          const prev = inv.estimatedDeliveryDate ? String(inv.estimatedDeliveryDate).slice(0, 10) : null
          const alvoPrev = maxData(maxData(prev, l.previsao ?? ''), hojeBR())
          if (!prev || prev < hojeBR()) payload.estimatedDeliveryDate = iso(alvoPrev, '18:00:00')
        }
        if (i === 3) payload.customerArrivalDate = iso(l.baixa_entregue ?? l.data_rot, '10:00:00')
        if (i === 4) payload.deliveryDate = iso(l.baixa_entregue)
        if (dryRun) { passos.push({ status_destino: CHAIN[i].nome, enviaria: payload }); continue }
        const resp = await fetch(`${TRACK}/delivery-invoice-detail/${detailId}`, {
          method: 'PATCH', headers, body: JSON.stringify(payload),
        })
        const txt = await resp.text()
        passos.push({ status_destino: CHAIN[i].nome, enviado: payload, http: resp.status, resposta: txt.slice(0, 300) })
        if (resp.status >= 300) break
      }
      r.passos = passos
      r.situacao = dryRun ? 'simulado' : 'processado'
    } catch (e) {
      r.situacao = 'erro'
      r.erro = String(e)
    }
    resultados.push(r)
  }

  out.processadas = resultados.length
  out.resultados = resultados
  return json()
})
