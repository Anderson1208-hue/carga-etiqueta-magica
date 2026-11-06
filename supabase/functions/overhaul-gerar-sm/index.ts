// Creates an Overhaul SM through the portal with the current login (same steps as the manual process).
// Route = origin -> stops in routing order -> last delivery; never adds stops of other trips.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { operatorAccessStatus } from '../_shared/approved-operator.ts';
import { SM_FORM_TEMPLATE } from '../_shared/overhaul-sm-template.ts';
import {
  conferirRota, dataBR, locaisDaRota, melhorMotorista, motoristaConfere, normalizarPlaca, placaRastreada, valorBR, type PontoRota,
} from '../_shared/overhaul-sm-regras.ts';

const B = 'https://trafegus.over-haul.com/trafegusweb/public/';
const ORIGEM = { id: 4943370, lat: -22.8613074176, lng: -43.2492269325, descricao: 'EBENEZER MATRIZ (BONSUCESSO/RJ)' };
const EMAIL_FALHA = 'arquivostlm@tlmlogistica.com.br';

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const Body = z.object({
  veiculo_id: z.string().uuid(),
  cnpjs_ordenados: z.array(z.string().min(11)).min(1).max(60),
});

class Portal {
  cookies = new Map<string, string>();
  private hdr(extra: Record<string, string> = {}) {
    return { 'User-Agent': 'Mozilla/5.0', Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '), ...extra };
  }
  private guardar(r: Response) {
    for (const c of r.headers.getSetCookie()) {
      const [kv] = c.split(';'); const i = kv.indexOf('=');
      if (i > 0) this.cookies.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
    }
  }
  async req(path: string, init: { method?: string; form?: [string, string][] | Record<string, string>; xhr?: boolean; query?: Record<string, string> } = {}) {
    let url = path.startsWith('http') ? path : B + path;
    if (init.query) url += (url.includes('?') ? '&' : '?') + new URLSearchParams(init.query);
    for (let i = 0; i < 6; i++) {
      const r = await fetch(url, {
        method: init.method ?? (init.form ? 'POST' : 'GET'),
        redirect: 'manual',
        headers: this.hdr({
          ...(init.form ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } : {}),
          ...(init.xhr ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
          Referer: url,
        }),
        body: init.form ? new URLSearchParams(init.form as any).toString() : undefined,
        signal: AbortSignal.timeout(45000),
      });
      this.guardar(r);
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
        await r.body?.cancel();
        url = new URL(r.headers.get('location')!, url).toString();
        init = { ...init, form: undefined, method: 'GET' };
        continue;
      }
      return { status: r.status, url, text: await r.text() };
    }
    throw new Error('Portal Overhaul: redirecionamentos demais');
  }
  async login() {
    await this.req('login');
    const r = await this.req('login', { form: {
      login: Deno.env.get('OVERHAUL_PORTAL_USUARIO') ?? '', senha: Deno.env.get('OVERHAUL_PORTAL_SENHA') ?? '',
      submit: 'ACESSAR', token_recapcha: '', propriedadesTela: '{"altura":900,"largura":1280}',
    } });
    if (/\/login/.test(r.url)) throw new Error('Login do portal Overhaul recusado');
  }
  async jsonData(path: string, termo: string, length = 50, coluna = 'descricao') {
    const r = await this.req(path, { xhr: true, form: { 'search[value]': termo, start: '0', length: String(length), 'order[0][column]': coluna, 'order[0][dir]': 'asc', resumido: 'true' } });
    try { return JSON.parse(r.text); } catch { throw new Error(`Portal Overhaul respondeu fora do padrão em ${path}`); }
  }
}

const decode = (s: string) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function inputValor(html: string, nome: string): string | null {
  const tag = html.match(new RegExp(`<input[^>]*name="${nome}"[^>]*>`, 'i'))?.[0];
  if (!tag) return null;
  const v = tag.match(/value='([^']*)'/) ?? tag.match(/value="([^"]*)"/);
  return v ? decode(v[1]) : '';
}

async function osrm(pts: [number, number][]) {
  const url = 'https://router.project-osrm.org/route/v1/driving/' + pts.map(([la, lo]) => `${lo},${la}`).join(';') + '?overview=full&geometries=geojson';
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const j = await r.json();
  if (j.code !== 'Ok') throw new Error('Não foi possível traçar a rota no mapa');
  return { km: j.routes[0].distance / 1000, coords: j.routes[0].geometry.coordinates as [number, number][] };
}
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const b64Grande = (s: string) => {
  const bytes = new TextEncoder().encode(s); let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(bin);
};


const semAcento = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

// Geocodes the customer address via Nominatim (OSM), Brazil-only. Used when there is no
// trustworthy operational coordinate; the register address is considered reliable.
async function geocodificarEndereco(partes: (string | null | undefined)[]): Promise<{ lat: number; lng: number } | null> {
  const q = partes.filter((p) => p && String(p).trim()).join(', ');
  if (!q) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q + ', Brasil')}`;
    const resp = await fetch(url, { headers: { 'User-Agent': 'TLM-Logistica/1.0 (overhaul-sm)' }, signal: AbortSignal.timeout(20000) });
    if (!resp.ok) return null;
    const arr = await resp.json() as { lat: string; lon: string }[];
    if (!Array.isArray(arr) || !arr.length) return null;
    return { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) };
  } catch {
    return null;
  }
}

// Registers a missing customer in the portal using our customer register and operational coordinate.
async function cadastrarReferencia(admin: any, portal: Portal, cnpj: string, nfs: any[]) {
  const nf = nfs.find((n) => String(n.cnpj_destinatario || '').replace(/\D/g, '') === cnpj);
  const { data: dests } = await admin.from('destinatarios').select('id, cnpj_cpf, razao_social').limit(20)
    .or(`cnpj_cpf.eq.${cnpj},cnpj_cpf.eq.${String(nf?.cnpj_destinatario || cnpj)}`);
  const dest = (dests ?? []).find((d: any) => String(d.cnpj_cpf || '').replace(/\D/g, '') === cnpj);
  if (!dest) throw new Error(`Cliente CNPJ ${cnpj} sem cadastro no nosso sistema para criar na Overhaul`);
  const { data: end } = await admin.rpc('resolver_endereco_operacional', { _destinatario_id: dest.id });
  const e = Array.isArray(end) ? end[0] : end;
  let lat = e?.latitude;
  let lng = e?.longitude;
  if (!lat || !lng || ['legado_desconhecido', 'amostra_insuficiente'].includes(e?.origem)) {
    // Sem coordenada operacional confiável: geocodifica o endereço do cadastro (considerado confiável).
    const geo = await geocodificarEndereco([nf?.dest_logradouro, nf?.dest_numero, nf?.dest_bairro, nf?.dest_cidade, nf?.dest_uf]);
    if (!geo) throw new Error(`Cliente CNPJ ${cnpj}: não foi possível localizar o endereço no mapa; confira o cadastro de clientes`);
    lat = geo.lat;
    lng = geo.lng;
  }
  const cidadeNome = semAcento(nf?.dest_cidade || 'RIO DE JANEIRO');
  const uf = semAcento(nf?.dest_uf || 'RJ');
  const cidades = (await portal.jsonData('cidade/getjsondata', cidadeNome, 20, 'cidade')).data ?? [];
  const cidade = cidades.find((c: any) => semAcento(c.cidade) === `${cidadeNome} - ${uf}`);
  if (!cidade) throw new Error(`Cidade "${cidadeNome}/${uf}" não encontrada no portal Overhaul`);
  const razao = semAcento(dest.razao_social || nf?.dest_razao_social || '').replace(/["']/g, '');
  const bairro = semAcento(nf?.dest_bairro || '');
  const descricao = `${cnpj} ${razao}${bairro ? ` - ${bairro}` : ''}`.slice(0, 120);
  const endereco = [nf?.dest_logradouro, nf?.dest_numero, nf?.dest_bairro, nf?.dest_cidade, nf?.dest_uf].filter(Boolean).join(', ');
  await portal.req('referencia/cadastro', { xhr: true, form: [
    ['descricao', descricao], ['temporaria', 'N'], ['codigoExterno', ''], ['cidadeReferencia', String(cidade.id)],
    ['classeReferencia', '23'], ['area', ''], ['raio', '300'], ['km', ''], ['bandeira', ''], ['tlocRefe', 'N'],
    ['tipoLocal', ''], ['raioLocal', ''], ['velocidadeMaxima', ''], ['endereco', endereco],
    ['latitude', String(lat)], ['longitude', String(lng)], ['refe_pontos_area', ''],
    ['texto', ''], ['telefone1', ''], ['celular', ''], ['radio', ''], ['email', ''], ['logradouro', ''], ['numero', ''],
    ['complemento', ''], ['tipoLogradouro', ''], ['cep', ''], ['bairro', ''], ['abreviacaoBairro', ''], ['cidade', ''],
    ['dadosClassificacaoGeral', ''], ['possuiSeguranca24h', 'N'], ['possuiPatioFechado', 'N'],
    ['dadosServicosDisponiveis', 'null'], ['validarMaisInformacoes', 'false'], ['ferramentaMapaEndereco', 'gmaps'], ['dono', '4981162'],
  ] });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ mensagem: 'Método não permitido' }, 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const access = await operatorAccessStatus(req.headers.get('Authorization'), admin as any);
  if (access) return json({ mensagem: access === 401 ? 'Não autenticado' : 'Operador não aprovado' }, access);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ mensagem: 'Dados inválidos' }, 400);
  const { veiculo_id } = parsed.data;
  const cnpjs = parsed.data.cnpjs_ordenados.map((c) => c.replace(/\D/g, ''));
  const { data: u } = await admin.auth.getUser(req.headers.get('Authorization')!.replace(/^Bearer\s+/i, ''));

  const { data: veic } = await admin.from('veiculos').select('id, placa, motorista, data, status').eq('id', veiculo_id).maybeSingle();
  if (!veic) return json({ mensagem: 'Veículo não encontrado' }, 404);
  const placa = normalizarPlaca(veic.placa);
  if (!placaRastreada(placa)) return json({ mensagem: `Placa ${placa} não está na lista de rastreados` }, 400);
  if (veic.status === 'cancelado') return json({ mensagem: 'Roteirização cancelada' }, 400);

  const { data: reg, error: regErr } = await admin.from('overhaul_sm')
    .insert({ veiculo_id, placa, data_rota: veic.data, status: 'gerando', criado_por: u.user?.id ?? null })
    .select('id').single();
  if (regErr) return json({ mensagem: 'Já existe uma SM sendo gerada para esta placa' }, 409);

  const detalhes: Record<string, unknown> = {};
  const finalizar = async (valores: Record<string, unknown>) => {
    await admin.from('overhaul_sm').update({ ...valores, detalhes, updated_at: new Date().toISOString() }).eq('id', reg.id);
  };

  try {
    // NFs and order
    const { data: vnfs, error } = await admin.from('veiculo_nfs')
      .select('notas_fiscais!inner(numero_nf, cnpj_destinatario, valor_nf, dest_razao_social, dest_logradouro, dest_numero, dest_bairro, dest_cidade, dest_uf, dest_cep)').eq('veiculo_id', veiculo_id).limit(2000);
    if (error) throw new Error('Falha ao ler as notas do veículo');
    const nfs = (vnfs ?? []).map((v: any) => v.notas_fiscais);
    if (!nfs.length) throw new Error('Veículo sem notas roteirizadas');
    const doVeiculo = new Set(nfs.map((n: any) => String(n.cnpj_destinatario || '').replace(/\D/g, '')));
    if (new Set(cnpjs).size !== cnpjs.length || cnpjs.length !== doVeiculo.size || cnpjs.some((c) => !doVeiculo.has(c))) {
      throw new Error('Lista de entregas diferente das notas do veículo; atualize a tela e tente de novo');
    }
    const valor = nfs.reduce((s: number, n: any) => s + Number(n.valor_nf || 0), 0);
    detalhes.nfs = nfs.map((n: any) => n.numero_nf);
    detalhes.valor = valor;

    const portal = new Portal();
    await portal.login();
    const dBR = dataBR(veic.data);

    // Existing SMs of the vehicle
    const sms = ((await portal.jsonData('solicitacaomonitoramento/getjsondata', placa, 100)).data ?? [])
      .filter((s: any) => normalizarPlaca(s.veiculoPlaca) === placa);
    const maxAntes = Math.max(0, ...sms.map((s: any) => Number(s.id)));
    const doDia = sms.filter((s: any) => String(s.dataPrevisaoInicio || '').startsWith(dBR) && !/CANCEL|EXCLU/i.test(s.statusViagem || ''));
    if (doDia.length) {
      throw new Error(`Já existe SM ${doDia.map((s: any) => s.id).join(', ')} para ${placa} em ${dBR}; exclua no portal antes de gerar outra`);
    }
    // Vehicle/terminal data come from the vehicle's latest SM; the driver is resolved per trip.
    const modelo = [...sms].sort((a: any, b: any) => b.id - a.id)[0];
    if (!modelo) throw new Error(`Placa ${placa} sem SM anterior no portal para copiar veículo e rastreador; gerar manualmente a primeira`);
    const copia = await portal.req(`solicitacaomonitoramento/editar/${modelo.id}?copiar=1`);
    const veiculos = inputValor(copia.text, 'dadosSolMonitoraVeiculos');
    const terminais = inputValor(copia.text, 'dadosSolMonitoraTerminais');
    const motoCopia = JSON.parse(inputValor(copia.text, 'dadosSolMonitoraMotoristas') || '[]')[0];
    if (!veiculos || !terminais) throw new Error('Não foi possível ler a SM modelo no portal');
    const vei = JSON.parse(veiculos)[0];
    const planoGr = copia.text.match(/id="viag_pgpg_codigo"[^>]*>\s*<option value="(\d+)"/)?.[1] ?? '1538';

    const nomeMot = (veic.motorista || '').trim();
    if (!nomeMot) throw new Error('Veículo sem motorista na roteirização');
    const { data: cad } = await admin.from('motoristas').select('nome, cpf, telefone').ilike('nome', `${nomeMot}%`).eq('ativo', true).limit(5);
    const cadUnico = (cad ?? []).length === 1 ? cad![0] : null;
    const cpf = (cadUnico?.cpf || '').replace(/\D/g, '');
    let candidatos: any[] = [];
    if (cpf.length === 11) candidatos = ((await portal.jsonData('motorista/getjsondata', cpf, 10, 'nome')).data ?? []).filter((m: any) => String(m.cpf || '').replace(/\D/g, '') === cpf);
    if (!candidatos.length) candidatos = ((await portal.jsonData('motorista/getjsondata', nomeMot, 20, 'nome')).data ?? []).filter((m: any) => motoristaConfere(nomeMot, m.nome));
    candidatos = candidatos.filter((m: any) => String(m.status || '').toUpperCase() === 'ATIVO');
    if (candidatos.length !== 1) {
      // Grafia diferente: usa o cadastro ativo com o nome mais próximo (operador confere e edita se preciso).
      const ativos = ((await portal.jsonData('motorista/getjsondata', nomeMot, 20, 'nome')).data ?? [])
        .filter((m: any) => String(m.status || '').toUpperCase() === 'ATIVO');
      const prox = melhorMotorista(nomeMot, ativos);
      if (prox.escolhido) candidatos = [prox.escolhido];
      else throw new Error(ativos.length
        ? `Motorista "${nomeMot}" sem correspondência clara no portal; informe o nome completo na roteirização`
        : `Motorista "${nomeMot}" não encontrado ativo no portal Overhaul`);
    }
    const m = candidatos[0];
    const motoristas = JSON.stringify([{ motoId: m.id, motoNome: m.nome, motoPrecedencia: '1', motoRg: m.rg, motoCpf: String(m.cpf || '').replace(/\./g, ''), hpmoId: null, hpmoStatus: null }]);
    const mesmoMot = motoCopia?.motoId === m.id;
    const tel = (cadUnico?.telefone || '').replace(/\D/g, '');
    const celular = mesmoMot ? (inputValor(copia.text, 'celular') ?? '') : tel.length >= 10 ? `(${tel.slice(0, 2)}) ${tel.slice(2, -4)}-${tel.slice(-4)}` : '';
    const contatoId = mesmoMot ? (inputValor(copia.text, 'contatoId') ?? '') : '';
    detalhes.motorista = m.nome;

    // Customer references by CNPJ; missing ones are registered from our customer data.
    const refes: { id: number; descricao: string; lat: number; lng: number; raio: number }[] = [];
    const cadastrados: string[] = [];
    const buscarRef = async (c: string) => {
      const r = (await portal.jsonData('referencia/getjsondata', c)).data ?? [];
      return r.filter((x: any) => String(x.descricao || '').replace(/\D/g, '').startsWith(c))[0] ?? null;
    };
    for (const c of cnpjs) {
      let ref = await buscarRef(c);
      if (!ref) {
        await cadastrarReferencia(admin, portal, c, nfs);
        ref = await buscarRef(c);
        if (!ref) throw new Error(`Portal não confirmou o cadastro do cliente CNPJ ${c}`);
        cadastrados.push(c);
      }
      refes.push({ id: ref.id, descricao: ref.descricao, lat: ref.latitude, lng: ref.longitude, raio: ref.raio });
    }
    detalhes.clientes_cadastrados = cadastrados;
    const destino = refes[refes.length - 1];
    const paradas = refes.slice(0, -1);

    // Route: reuse an identical one with the same name, else create
    const descricao = `TLM SM ${placa} ${dBR}`;
    const refeIds = refes.map((r) => r.id);
    const lerPontos = async (rotaId: number) => {
      const r = await portal.req('solicitacaomonitoramento/getdadosrota', { xhr: true, query: { rotaId: String(rotaId), transportador: '4981162', embarcador: '' } });
      return JSON.parse(r.text) as { rotaDistancia: string; pontos: PontoRota[] };
    };
    let rotaId: number | null = null;
    let dadosRota: { rotaDistancia: string; pontos: PontoRota[] } | null = null;
    for (const rr of ((await portal.jsonData('rota/getjsondata', descricao, 20)).data ?? []).filter((x: any) => String(x.descricao).startsWith(descricao) && x.ativo === 'A')) {
      const d = await lerPontos(rr.id);
      if (!conferirRota(d.pontos, ORIGEM.id, refeIds)) { rotaId = rr.id; dadosRota = d; break; }
    }
    if (!rotaId) {
      const pts: [number, number][] = [[ORIGEM.lat, ORIGEM.lng], ...refes.map((r) => [r.lat, r.lng] as [number, number])];
      const { km, coords } = await osrm(pts);
      const nome = `${descricao} ${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`;
      const linhas = paradas.map((p, i) => [i + 2, p.descricao, String(p.lat), String(p.lng), 'ENTREGA', '', '', '', String(p.id), '', '3', '', '']);
      const form: Record<string, string> = {
        pontosArrastados: JSON.stringify(pts.map(([lat, lng]) => ({ lat, lng }))), descricao: nome,
        pontoOrigem: String(ORIGEM.id), areaOrigem: '', latitudeOrigem: String(ORIGEM.lat), longitudeOrigem: String(ORIGEM.lng),
        previsaoChegadaOrigem: '', previsaoSaidaOrigem: '',
        pontoDestino: String(destino.id), areaDestino: '', latitudeDestino: String(destino.lat), longitudeDestino: String(destino.lng),
        previsaoChegadaDestino: '', previsaoSaidaDestino: '', distancia: km.toFixed(2), ativo: 'A', identificador: '',
        velocidadeMediaViagem: '', tempoTotalParadoViagem: '', tempoToleranciaAtraso: '', codigoExterno: '', percentualExcedente: '1',
        observacao: 'Gerada pelo sistema TLM', rotaInstrucoes: b64('[]'), dadosInstrucoes: '',
        coordenadasLatitude: b64Grande(coords.map((c) => c[1]).join('|')), coordenadasLongitude: b64Grande(coords.map((c) => c[0]).join('|')),
        dadosPontoRota: b64Grande(JSON.stringify(linhas)), tipoVeiculo: '', tipoCarroceria: '', valorFreteFechado: '', valorFrete: '',
        valorPedagio: '', valorAjudante: '', valorMotoraAdicional: '', valorPostosFiscais: '', valorHorasAdicionais: '', valorKmAdicionais: '',
        dadosValoresFrete: 'null', ferramentaMapaRota: 'gmaps', obrigaAreaPontosRota: 'N',
      };
      await portal.req('rota/cadastro', { xhr: true, form });
      const nova = ((await portal.jsonData('rota/getjsondata', nome, 5)).data ?? []).find((x: any) => x.descricao === nome);
      if (!nova) throw new Error('Portal não confirmou o cadastro da rota');
      rotaId = nova.id;
      dadosRota = await lerPontos(nova.id);
      const erroRota = conferirRota(dadosRota.pontos, ORIGEM.id, refeIds);
      if (erroRota) throw new Error(`Rota ${nova.id} salva com problema: ${erroRota}`);
    }
    detalhes.rota_id = rotaId;

    // SM form
    const ov: Record<string, string> = {
      codigoSM: String(modelo.id), codigoSmOriginal: String(modelo.id), codigoOriginal: String(modelo.id),
      planoGr, veiculoTransportador: String(vei.veicId), motoristaPrincipal: String(m.id), celular, contatoId,
      previsaoInicio: `${dBR} 06:00`, previsaoFim: `${dBR} 23:55`, viag_previsao_fim_alterada_manual: '0',
      roteirizarAutomatico: 'N', semRota: 'N', rota: String(rotaId),
      latOrigem: '', lngOrigem: '', latDestino: '', lngDestino: '', codigoOrigem: '', codigoDestino: '',
      descricaoOrigem: '', descricaoDestino: '', origem: String(ORIGEM.id), destino: String(destino.id), raioDestino: String(destino.raio ?? 300),
      distancia: valorBR(Number(dadosRota!.rotaDistancia) || 0), valorMercEspecifica: valorBR(valor), valorCarga: valorBR(valor),
      dadosSolMonitoraMotoristas: motoristas, dadosSolMonitoraVeiculos: veiculos, dadosSolMonitoraTerminais: terminais,
      dadosSolMonitoraLocais: JSON.stringify(locaisDaRota(dadosRota!.pontos)), dadosSolMonitoraEventos: '[]',
    };
    const vistos = new Set<string>();
    const form: [string, string][] = [];
    for (const [k, v] of SM_FORM_TEMPLATE) {
      if (k in ov) { if (vistos.has(k)) continue; vistos.add(k); form.push([k, ov[k]]); } else form.push([k, v]);
    }
    for (const k of Object.keys(ov)) if (!vistos.has(k)) form.push([k, ov[k]]);
    const resp = await portal.req(`solicitacaomonitoramento/editar/${modelo.id}?copiar=1`, { form });

    // Confirm the SM really exists
    const depois = ((await portal.jsonData('solicitacaomonitoramento/getjsondata', placa, 100)).data ?? [])
      .filter((s: any) => normalizarPlaca(s.veiculoPlaca) === placa && Number(s.id) > maxAntes && String(s.dataPrevisaoInicio || '').startsWith(dBR));
    if (!depois.length) {
      const alerta = resp.text.match(/class="alert[^"]*"[^>]*>([\s\S]{0,400}?)<\/div>/)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      throw new Error(`Portal não confirmou a SM${alerta ? `: ${alerta}` : ''}`);
    }
    const sm = String(Math.max(...depois.map((s: any) => Number(s.id))));
    await finalizar({ status: 'gerada', sm_numero: sm, rota_portal_id: String(rotaId), erro: null });
    return json({ status: 'gerada', sm_numero: sm, rota_id: rotaId });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 500);
    await finalizar({ status: 'falha', erro: msg, rota_portal_id: detalhes.rota_id ? String(detalhes.rota_id) : null });
    await admin.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'overhaul-sm-falha', recipientEmail: EMAIL_FALHA, idempotencyKey: `overhaul-sm-${reg.id}`,
        templateData: { placa, data: dataBR(veic.data), motivo: msg },
      },
    }).catch(() => null);
    return json({ status: 'falha', erro: msg });
  }
});
