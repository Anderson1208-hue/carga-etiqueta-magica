import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_maps';

function normalize(s?: string | null): string {
  return (s ?? '').toString().trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}
function buildAddress(i: any) {
  const parts = [
    [i.logradouro, i.numero].filter(Boolean).join(', '),
    i.bairro,
    [i.cidade, i.uf].filter(Boolean).join(' - '),
    (i.cep ?? '').replace(/\D/g, ''),
    'Brasil',
  ].filter((p) => p && String(p).trim().length > 0);
  const full = parts.join(', ');
  const key = [
    normalize(i.logradouro), normalize(i.numero), normalize(i.bairro),
    normalize(i.cidade), normalize(i.uf), (i.cep ?? '').replace(/\D/g, ''),
  ].join('|');
  return { full, key };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
    const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY')!;
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const url = new URL(req.url);
    const limit = Number(url.searchParams.get('limit') ?? '500');

    const { data: rows, error } = await supabase
      .from('destinatario_enderecos')
      .select('id, logradouro, numero, bairro, cidade, uf, cep')
      .or('latitude.is.null,longitude.is.null')
      .limit(limit);
    if (error) throw error;

    let ok = 0, fail = 0, cache_hits = 0;
    const failures: any[] = [];

    for (const row of rows ?? []) {
      const { full, key } = buildAddress(row);
      try {
        // cache
        const { data: cached } = await supabase.from('geocode_cache').select('*').eq('cache_key', key).maybeSingle();
        let lat: number | null = null, lng: number | null = null;
        if (cached) {
          lat = Number(cached.latitude); lng = Number(cached.longitude); cache_hits++;
        } else {
          const resp = await fetch(`${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(full)}&region=br&language=pt-BR`, {
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'X-Connection-Api-Key': GOOGLE_MAPS_API_KEY },
          });
          const j = await resp.json();
          if (j.status !== 'OK' || !j.results?.[0]) {
            fail++; if (failures.length < 20) failures.push({ id: row.id, addr: full, status: j.status }); continue;
          }
          const b = j.results[0];
          lat = b.geometry?.location?.lat; lng = b.geometry?.location?.lng;
          await supabase.from('geocode_cache').upsert({
            cache_key: key, address_input: full, latitude: lat, longitude: lng,
            formatted_address: b.formatted_address, location_type: b.geometry?.location_type,
            place_id: b.place_id, source: 'google', updated_at: new Date().toISOString(),
          }, { onConflict: 'cache_key' });
          await new Promise(r => setTimeout(r, 60)); // rate limit
        }
        if (lat != null && lng != null) {
          await supabase.from('destinatario_enderecos').update({ latitude: lat, longitude: lng }).eq('id', row.id);
          ok++;
        } else { fail++; }
      } catch (e) {
        fail++; if (failures.length < 20) failures.push({ id: row.id, err: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({ processed: rows?.length ?? 0, ok, fail, cache_hits, failures }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('backfill-geocode error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
