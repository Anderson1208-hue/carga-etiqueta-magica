// Sonda READ-ONLY do portal Sirius Log (Bauducco).
// Objetivo: validar login programático (authorization_code sem navegador)
// e leitura de UMA nota. Nada é gravado no portal.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const SSO = 'https://sso.siriuslog.com'
const GATEWAY = 'https://portal.siriuslog.com'
// Valores públicos, expostos no bundle do próprio portal:
const CLIENT_ID = 'TKwlKiwd1YHgKhqHxRbnECCRIZga'
const CLIENT_SECRET = 'vQMfgzLe2TIgnkPz39j9gr9h7gsa'
const REDIRECT = 'https://bauducco.siriuslog.com/#/login'

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
const cookieHeader = (jar: Jar) =>
  Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const out: Record<string, unknown> = { modo: 'somente-leitura' }
  const json = (status = 200) =>
    new Response(JSON.stringify(out, null, 2), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  const user = Deno.env.get('SIRIUSLOG_USER')
  const pass = Deno.env.get('SIRIUSLOG_PASSWORD')
  if (!user || !pass) {
    out.erro = 'credenciais_ausentes'
    return json()
  }

  let nf = '758306'
  let somente: string | null = null
  try {
    const body = await req.json()
    if (body?.nf) nf = String(body.nf)
    if (body?.somente) somente = String(body.somente)
  } catch { /* sem body */ }
  out.nf = nf

  const jar: Jar = {}
  const passos: unknown[] = []

  // 1) /oauth2/authorize -> página de login com sessionDataKey
  const authUrl = `${SSO}/oauth2/authorize?` + new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    scope: 'openid',
  })
  let res = await fetch(authUrl, { redirect: 'manual' })
  saveCookies(res, jar)
  let loc = res.headers.get('location')
  passos.push({ passo: 'authorize', status: res.status, location: loc?.slice(0, 200) })

  let sessionDataKey: string | null = null
  if (loc) {
    const abs = loc.startsWith('http') ? loc : `${SSO}${loc}`
    sessionDataKey = new URL(abs).searchParams.get('sessionDataKey')
    if (!sessionDataKey) {
      res = await fetch(abs, { redirect: 'manual', headers: { cookie: cookieHeader(jar) } })
      saveCookies(res, jar)
      const html = await res.text()
      sessionDataKey = html.match(/sessionDataKey["'\s=:]+([\w-]+)/)?.[1] ?? null
      passos.push({ passo: 'login-page', status: res.status, temChave: !!sessionDataKey })
    }
  }
  out.passos = passos
  if (!sessionDataKey) {
    out.erro = 'sessionDataKey_nao_encontrada'
    return json()
  }

  // 2) autenticação de usuário (testa variações de identificador)
  const variantes = [user, `${user}@carbon.super`, user.split('@')[0], user.toLowerCase()]
    .filter((v, i, a) => a.indexOf(v) === i)
  let code: string | null = null
  const tentativasLogin: unknown[] = []

  for (const uname of variantes) {
    res = await fetch(`${SSO}/commonauth`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        cookie: cookieHeader(jar),
      },
      body: new URLSearchParams({
        username: uname,
        password: pass,
        sessionDataKey,
        tocommonauth: 'true',
      }),
    })
    saveCookies(res, jar)
    loc = res.headers.get('location')
    const lp = loc ? Object.fromEntries(new URL(loc.startsWith('http') ? loc : `${SSO}${loc}`).searchParams) : {}
    tentativasLogin.push({
      usuario_mascarado: uname.replace(/[^@.]/g, '*'),
      falha: lp.authFailure ?? null,
      motivo: lp.authFailureMsg ?? null,
    })
    if (lp.authFailure === 'true') continue

    // seguir redirects até capturar o code
    let hops = 0
    while (loc && hops < 6) {
      hops++
      const abs = loc.startsWith('http') ? loc : `${SSO}${loc}`
      const u = new URL(abs.replace('/#/', '/'))
      code = u.searchParams.get('code')
      if (code) break
      if (abs.startsWith('https://bauducco.siriuslog.com')) break
      const r = await fetch(abs, { redirect: 'manual', headers: { cookie: cookieHeader(jar) } })
      saveCookies(r, jar)
      loc = r.headers.get('location')
    }
    if (code) break
  }
  out.tentativas_login = tentativasLogin

  out.code_obtido = !!code
  if (!code) {
    out.erro = 'authorization_code_nao_obtido'
    return json()
  }

  // 4) troca code por token
  const basic = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)
  res = await fetch(`${SSO}/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT,
    }),
  })
  const tokenTxt = await res.text()
  out.token_status = res.status
  if (!res.ok) {
    out.token_resposta = tokenTxt.slice(0, 500)
    return json()
  }
  const tok = JSON.parse(tokenTxt)
  const access = tok.access_token as string
  out.login_ok = true
  out.token_expira_em = tok.expires_in

  const headers = {
    Authorization: `Bearer ${access}`,
    'Content-Type': 'application/json',
    tenant: 'bauducco.siriuslog.com',
  }

  // 5) leituras (sem gravar nada) — timeout curto por chamada
  const get = async (nome: string, url: string, ms = 20000) => {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), ms)
    try {
      const r = await fetch(url, { method: 'GET', headers, signal: ctl.signal })
      const txt = await r.text()
      return { nome, status: r.status, tamanho: txt.length, amostra: txt.slice(0, 2500) }
    } catch (e) {
      return { nome, erro: String(e) }
    } finally {
      clearTimeout(t)
    }
  }

  const BASE = `${GATEWAY}/sirius-national-tracking-api/v1`
  const leituras: unknown[] = []

  if (somente === 'amostra-registro') {
    // 1 registro só, para descobrir os nomes dos campos (inclui o da NF)
    leituras.push(await get('amostra-registro', `${BASE}/trip/delivery/status/view?page=0&size=1`))
  } else if (somente === 'detalhe-viagem') {
    for (const p of ['trip/67667', 'trip/detail/67667', 'trip/delivery/67667']) {
      leituras.push(await get(p, `${BASE}/${p}`))
    }
  } else {
    // Busca correta: nfe?number=... -> invoiceIds -> trip/delivery/status/view
    const nfe = await get('nfe', `${GATEWAY}/sirius-load-composition-api/nfe?number=${nf}&size=5`)
    leituras.push(nfe)
    let ids: number[] = []
    try {
      const body = JSON.parse((nfe as { amostra?: string }).amostra ?? '{}')
      const arr = body.content ?? body
      if (Array.isArray(arr)) ids = arr.map((x: { id: number }) => x.id).filter(Boolean)
    } catch { /* amostra truncada */ }
    out.invoice_ids = ids
    if (ids.length) {
      leituras.push(
        await get(
          'view+invoiceIds',
          `${BASE}/trip/delivery/status/view?page=0&size=5&invoiceIds=${ids.join(',')}`,
        ),
      )
    }
  }
  out.leituras = leituras
  return json()
})
