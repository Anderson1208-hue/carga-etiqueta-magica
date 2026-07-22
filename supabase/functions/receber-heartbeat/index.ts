import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.23.8';

const BodySchema = z.object({
  placa: z.string().min(4).max(10),
  motorista_user_id: z.string().uuid().optional().nullable(),
  app_version: z.string().max(30).optional().nullable(),
  permissao_localizacao: z.enum(['foreground', 'background', 'negada', 'desconhecida']).optional().nullable(),
  otimizacao_bateria: z.enum(['ativa', 'isenta', 'desconhecida']).optional().nullable(),
  bateria_pct: z.number().int().min(0).max(100).optional().nullable(),
  ultimo_gps_em: z.string().datetime().optional().nullable(),
  meta: z.record(z.any()).optional().nullable(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const d = parsed.data;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const placa = d.placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const { error } = await supabase.from('apk_heartbeats').insert({
      placa,
      motorista_user_id: d.motorista_user_id ?? null,
      app_version: d.app_version ?? null,
      permissao_localizacao: d.permissao_localizacao ?? 'desconhecida',
      otimizacao_bateria: d.otimizacao_bateria ?? 'desconhecida',
      bateria_pct: d.bateria_pct ?? null,
      ultimo_gps_em: d.ultimo_gps_em ?? null,
      meta: d.meta ?? null,
    });
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
