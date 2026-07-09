import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_maps';

interface GeocodeInput {
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  endereco_id?: string | null; // se informado, atualiza destinatario_enderecos
}

function normalize(s?: string | null): string {
  return (s ?? '')
    .toString()
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function buildAddress(i: GeocodeInput): { full: string; key: string } {
  const parts = [
    [i.logradouro, i.numero].filter(Boolean).join(', '),
    i.bairro,
    [i.cidade, i.uf].filter(Boolean).join(' - '),
    (i.cep ?? '').replace(/\D/g, ''),
    'Brasil',
  ].filter((p) => p && String(p).trim().length > 0);
  const full = parts.join(', ');
  const key = [
    normalize(i.logradouro),
    normalize(i.numero),
    normalize(i.bairro),
    normalize(i.cidade),
    normalize(i.uf),
    (i.cep ?? '').replace(/\D/g, ''),
  ].join('|');
  return { full, key };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Google Maps connector not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = (await req.json()) as GeocodeInput;
    if (!body || (!body.cep && !body.logradouro && !body.cidade)) {
      return new Response(
        JSON.stringify({ error: 'Endereço insuficiente. Informe ao menos CEP, logradouro ou cidade.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { full, key } = buildAddress(body);

    // 1) cache
    const { data: cached } = await supabase
      .from('geocode_cache')
      .select('*')
      .eq('cache_key', key)
      .maybeSingle();

    if (cached) {
      await supabase
        .from('geocode_cache')
        .update({ hit_count: (cached.hit_count ?? 1) + 1, updated_at: new Date().toISOString() })
        .eq('id', cached.id);

      if (body.endereco_id) {
        await supabase
          .from('destinatario_enderecos')
          .update({ latitude: cached.latitude, longitude: cached.longitude })
          .eq('id', body.endereco_id);
      }

      return new Response(
        JSON.stringify({
          latitude: Number(cached.latitude),
          longitude: Number(cached.longitude),
          formatted_address: cached.formatted_address,
          location_type: cached.location_type,
          source: 'cache',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 2) Google Geocoding API (legacy REST via gateway)
    const url = `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(full)}&region=br&language=pt-BR`;
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': GOOGLE_MAPS_API_KEY,
      },
    });

    if (!resp.ok) {
      const details = await resp.text();
      console.error(`Geocoding gateway failed [${resp.status}]: ${details}`);
      return new Response(
        JSON.stringify({ error: 'Provider request failed', status: resp.status, details }),
        { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const json = await resp.json();
    if (json.status !== 'OK' || !Array.isArray(json.results) || json.results.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'Endereço não encontrado',
          google_status: json.status,
          google_error: json.error_message,
          address_sent: full,
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const best = json.results[0];
    const lat = best.geometry?.location?.lat;
    const lng = best.geometry?.location?.lng;
    const location_type = best.geometry?.location_type ?? null;
    const formatted_address = best.formatted_address ?? null;
    const place_id = best.place_id ?? null;

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return new Response(
        JSON.stringify({ error: 'Resposta Google sem coordenadas', google: best }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 3) grava cache (idempotente)
    await supabase.from('geocode_cache').upsert(
      {
        cache_key: key,
        address_input: full,
        latitude: lat,
        longitude: lng,
        formatted_address,
        location_type,
        place_id,
        source: 'google',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'cache_key' },
    );

    // 4) atualiza endereço se pedido
    if (body.endereco_id) {
      await supabase
        .from('destinatario_enderecos')
        .update({ latitude: lat, longitude: lng })
        .eq('id', body.endereco_id);
    }

    return new Response(
      JSON.stringify({
        latitude: lat,
        longitude: lng,
        formatted_address,
        location_type,
        source: 'google',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('geocodificar-endereco error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
