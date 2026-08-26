// Backfill de coordenadas dos endereços principais dos destinatários
// via Google Places API (New) — Text Search.
// Estratégia: buscar o estabelecimento pelo NOME + cidade/UF (como o Waze faz),
// gerando coordenada ROOFTOP do prédio comercial em vez do centro do CEP.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_maps';
const MAX_ITEMS_PER_CALL = 20;
const PLACES_TIMEOUT_MS = 12_000;
const CONCURRENCY = 3;

interface BackfillInput {
  dry_run?: boolean;
  limit?: number; // máximo de destinatários a processar
  offset?: number; // usado pela tela para processar em lotes pequenos
  min_baixas_90d?: number; // só clientes com N baixas nos últimos 90 dias
  force?: boolean; // reprocessa mesmo quem já tem coord
  only_ids?: string[]; // limitar a destinatarios específicos
}

interface ItemResult {
  destinatario_id: string;
  razao_social: string;
  status: 'atualizado' | 'sem_match' | 'rejeitado_cidade' | 'rejeitado_distancia' | 'sem_endereco' | 'erro' | 'ok_atual';
  detalhe?: string;
  dist_deslocamento_m?: number;
  place_id?: string;
  formatted_address?: string;
}

function stripAcc(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
      return new Response(JSON.stringify({ error: 'Google Maps connector not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = (await req.json().catch(() => ({}))) as BackfillInput;
    const dry_run = body.dry_run !== false; // default true por segurança
    const limit = Math.min(Math.max(body.limit ?? 10, 1), MAX_ITEMS_PER_CALL);
    const offset = Math.max(body.offset ?? 0, 0);
    const min_baixas_90d = body.min_baixas_90d ?? 0;
    const force = body.force === true;
    const only_ids = Array.isArray(body.only_ids) ? body.only_ids : null;

    // Rank destinatários por # de baixas nos últimos 90 dias
    // (top clientes primeiro; quem tem 0 baixas fica no final se aceito)
    let query = supabase
      .from('destinatarios')
      .select('id, razao_social, nome_fantasia, ativo, cnpj_cpf')
      .eq('ativo', true);
    if (only_ids && only_ids.length > 0) query = query.in('id', only_ids);
    const { data: dests, error: destErr } = await query;
    if (destErr) throw destErr;

    // Contagem de baixas por CNPJ (para ranking)
    const cnpjRanks = new Map<string, number>();
    if ((dests?.length ?? 0) > 0 && min_baixas_90d > 0) {
      const desde = new Date(Date.now() - 90 * 86400000).toISOString();
      // Uma única leitura paginada com join evita milhares de lookups por NF.
      let from = 0; const page = 1000;
      while (true) {
        const { data: brows, error: berr } = await supabase
          .from('baixas_entrega')
          .select('nf_id, notas_fiscais!inner(cnpj_destinatario)')
          .eq('status', 'entregue')
          .gte('registrado_em', desde)
          .range(from, from + page - 1);
        if (berr) { console.error('baixas err', berr); break; }
        if (!brows || brows.length === 0) break;
        for (const b of brows) {
          const nf = (b as any).notas_fiscais;
          const c = String(nf?.cnpj_destinatario ?? '').replace(/\D/g, '');
          if (!c) continue;
          cnpjRanks.set(c, (cnpjRanks.get(c) ?? 0) + 1);
        }
        if (brows.length < page) break;
        from += page;
      }
      console.log('cnpj rank keys:', cnpjRanks.size);
    }

    const cnpjById = new Map<string, string>();
    for (const d of dests ?? []) cnpjById.set(d.id, String(d.cnpj_cpf ?? '').replace(/\D/g, ''));

    // Apelidos de busca por CNPJ raiz (ex.: rede ASSB -> "Cacau Show")
    const apelidoPorRaiz = new Map<string, string>();
    {
      const { data: aliases } = await supabase
        .from('destinatario_apelidos_busca')
        .select('cnpj_raiz, nome_busca');
      for (const a of aliases ?? []) {
        apelidoPorRaiz.set(String(a.cnpj_raiz), String(a.nome_busca));
      }
    }

    // Regra do embarcador IBAC (Cacau Show): as lojas são franquias com razões
    // sociais e CNPJs totalmente distintos (ASSB, Sabor Cacau, Mada Ia...), mas
    // a fachada — o que o Google indexa — é sempre "Cacau Show". Todo
    // destinatário que recebe NF do emitente IBAC é buscado por nome fantasia
    // Cacau Show + logradouro/número.
    const IBAC_EMITENTE_RAIZ = '61472205';
    const APELIDO_IBAC = 'Cacau Show';
    const cnpjsIbac = new Set<string>();
    {
      let from = 0; const page = 1000;
      while (true) {
        const { data: nfs, error: nfErr } = await supabase
          .from('notas_fiscais')
          .select('cnpj_destinatario, cnpj_emitente')
          .ilike('cnpj_emitente', `%${IBAC_EMITENTE_RAIZ.slice(0, 2)}.${IBAC_EMITENTE_RAIZ.slice(2, 5)}.${IBAC_EMITENTE_RAIZ.slice(5, 8)}%`)
          .range(from, from + page - 1);
        if (nfErr) { console.error('nfs ibac err', nfErr); break; }
        if (!nfs || nfs.length === 0) break;
        for (const nf of nfs) {
          const emit = String(nf.cnpj_emitente ?? '').replace(/\D/g, '');
          if (emit.slice(0, 8) !== IBAC_EMITENTE_RAIZ) continue;
          const dest = String(nf.cnpj_destinatario ?? '').replace(/\D/g, '');
          if (dest) cnpjsIbac.add(dest);
        }
        if (nfs.length < page) break;
        from += page;
      }
      console.log('destinatarios IBAC (Cacau Show):', cnpjsIbac.size);
    }


    // Anexar rank e filtrar por min_baixas_90d
    const ranked = (dests ?? [])
      .map((d) => ({ ...d, baixas: cnpjRanks.get(cnpjById.get(d.id) ?? '') ?? 0 }))
      .filter((d) => only_ids || d.baixas >= min_baixas_90d)
      .sort((a, b) => b.baixas - a.baixas)
      .slice(offset, offset + limit);

    const results: ItemResult[] = [];
    let atualizados = 0, sem_match = 0, rejeitados = 0, erros = 0, ok_atual = 0, sem_endereco = 0;

    let cursor = 0;
    async function worker() {
      while (true) {
        const idx = cursor++;
        if (idx >= ranked.length) return;
        const d = ranked[idx];
        try {
          const { data: ends } = await supabase
            .from('destinatario_enderecos')
            .select('id, logradouro, numero, bairro, cidade, uf, cep, latitude, longitude, principal')
            .eq('destinatario_id', d.id)
            .order('principal', { ascending: false });
          const endereco = (ends ?? []).find((e) => e.principal) ?? (ends ?? [])[0];
          if (!endereco || !endereco.cidade) {
            sem_endereco++;
            results.push({ destinatario_id: d.id, razao_social: d.razao_social, status: 'sem_endereco' });
            continue;
          }

          const cnpj = cnpjById.get(d.id) ?? '';
          const apelido = cnpjsIbac.has(cnpj)
            ? APELIDO_IBAC
            : (cnpj.length >= 8 ? apelidoPorRaiz.get(cnpj.slice(0, 8)) : undefined);
          const nome = (apelido || d.nome_fantasia || d.razao_social || '').trim();
          if (!nome) {
            results.push({ destinatario_id: d.id, razao_social: d.razao_social, status: 'sem_match', detalhe: 'sem nome' });
            sem_match++;
            continue;
          }

          // Logradouro + número entram na query: sem eles, franquias homônimas
          // da mesma rede (ex.: 3 lojas Cacau Show na Tijuca) retornam o MESMO
          // place_id e várias paradas ficam empilhadas na mesma coordenada.
          const ruaNumero = [endereco.logradouro, endereco.numero].filter(Boolean).join(', ');
          const textQuery = [nome, ruaNumero, endereco.bairro, endereco.cidade, endereco.uf, 'Brasil']
            .filter(Boolean).join(', ');


          let resp: Response | null = null;
          let lastErr = '';
          for (let attempt = 0; attempt < 3; attempt++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), PLACES_TIMEOUT_MS);
            try {
              resp = await fetch(`${GATEWAY_URL}/places/v1/places:searchText`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${LOVABLE_API_KEY}`,
                  'X-Connection-Api-Key': GOOGLE_MAPS_API_KEY,
                  'Content-Type': 'application/json',
                  'X-Goog-FieldMask':
                    'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.addressComponents',
                },
                body: JSON.stringify({ textQuery, languageCode: 'pt-BR', regionCode: 'BR', maxResultCount: 3 }),
                signal: controller.signal,
              });
            } catch (e: any) {
              lastErr = `fetch: ${e?.message || e}`;
              resp = null;
            } finally {
              clearTimeout(timeout);
            }
            // Retry on transient errors (network, 5xx, 429)
            if (resp && resp.ok) break;
            if (resp && resp.status < 500 && resp.status !== 429) break;
            if (resp) lastErr = `HTTP ${resp.status}`;
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          }

          if (!resp || !resp.ok) {
            const txt = resp ? await resp.text().catch(() => '') : lastErr;
            erros++;
            results.push({ destinatario_id: d.id, razao_social: d.razao_social, status: 'erro', detalhe: `${resp ? `HTTP ${resp.status}` : 'network'}: ${txt.slice(0, 200)}` });
            continue;
          }

          const json = await resp.json();
          const places = Array.isArray(json.places) ? json.places : [];
          if (places.length === 0) {
            sem_match++;
            results.push({ destinatario_id: d.id, razao_social: d.razao_social, status: 'sem_match' });
            continue;
          }

          const cidadeCad = stripAcc(endereco.cidade || '');
          const ufCad = stripAcc(endereco.uf || '');
          let escolhido: any = null;
          let motivoRej = '';
          for (const p of places) {
            const types: string[] = Array.isArray(p.types) ? p.types : [];
            if (!types.includes('establishment') && !types.includes('point_of_interest') && !types.includes('store')) continue;
            const comps: any[] = Array.isArray(p.addressComponents) ? p.addressComponents : [];
            const cityComp =
              comps.find((c) => (c.types || []).includes('locality')) ||
              comps.find((c) => (c.types || []).includes('administrative_area_level_2'));
            const ufComp = comps.find((c) => (c.types || []).includes('administrative_area_level_1'));
            const cityG = cityComp ? stripAcc(cityComp.longText || cityComp.shortText || '') : '';
            const ufG = ufComp ? stripAcc(ufComp.shortText || ufComp.longText || '') : '';
            if (ufCad && ufG && ufG !== ufCad) { motivoRej = `UF ${ufG} != ${ufCad}`; continue; }
            if (cidadeCad && cityG && !cityG.includes(cidadeCad) && !cidadeCad.includes(cityG)) {
              motivoRej = `Cidade ${cityG} != ${cidadeCad}`;
              continue;
            }
            escolhido = p;
            break;
          }

          if (!escolhido) {
            rejeitados++;
            results.push({ destinatario_id: d.id, razao_social: d.razao_social, status: 'rejeitado_cidade', detalhe: motivoRej || 'nenhum resultado do tipo establishment na cidade' });
            continue;
          }

          const lat = Number(escolhido.location?.latitude);
          const lng = Number(escolhido.location?.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            erros++;
            results.push({ destinatario_id: d.id, razao_social: d.razao_social, status: 'erro', detalhe: 'sem coords no place' });
            continue;
          }

          let dist: number | undefined;
          if (endereco.latitude != null && endereco.longitude != null) {
            dist = Math.round(haversineM(Number(endereco.latitude), Number(endereco.longitude), lat, lng));
            if (dist > 20000) {
              rejeitados++;
              results.push({
                destinatario_id: d.id, razao_social: d.razao_social,
                status: 'rejeitado_distancia', dist_deslocamento_m: dist,
                detalhe: `${(dist / 1000).toFixed(1)}km da coord atual`,
                place_id: escolhido.id, formatted_address: escolhido.formattedAddress,
              });
              continue;
            }
            if (!force && dist < 50) {
              ok_atual++;
              results.push({
                destinatario_id: d.id, razao_social: d.razao_social,
                status: 'ok_atual', dist_deslocamento_m: dist,
                place_id: escolhido.id, formatted_address: escolhido.formattedAddress,
              });
              continue;
            }
          }

          if (!dry_run) {
            await supabase.from('destinatario_enderecos')
              .update({ latitude: lat, longitude: lng })
              .eq('id', endereco.id);

            const cacheKey = `PLACES|${d.id}|${(escolhido.id || '').slice(0, 60)}`;
            await supabase.from('geocode_cache').upsert({
              cache_key: cacheKey,
              address_input: textQuery,
              latitude: lat, longitude: lng,
              formatted_address: escolhido.formattedAddress ?? null,
              location_type: 'ROOFTOP',
              place_id: escolhido.id ?? null,
              source: 'places',
              updated_at: new Date().toISOString(),
            }, { onConflict: 'cache_key' });
          }

          atualizados++;
          results.push({
            destinatario_id: d.id, razao_social: d.razao_social,
            status: 'atualizado',
            dist_deslocamento_m: dist,
            place_id: escolhido.id,
            formatted_address: escolhido.formattedAddress,
            detalhe: dry_run ? '[dry-run]' : undefined,
          });
        } catch (e) {
          erros++;
          results.push({ destinatario_id: d.id, razao_social: d.razao_social, status: 'erro', detalhe: (e as Error).message });
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ranked.length) }, () => worker()));

    return new Response(JSON.stringify({
      dry_run, processados: ranked.length,
      atualizados, sem_match, rejeitados, ok_atual, sem_endereco, erros,
      results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('backfill-places-nome error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
