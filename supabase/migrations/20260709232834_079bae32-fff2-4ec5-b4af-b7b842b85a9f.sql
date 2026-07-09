
CREATE TABLE public.geocode_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  address_input TEXT NOT NULL,
  latitude NUMERIC(10,7) NOT NULL,
  longitude NUMERIC(10,7) NOT NULL,
  formatted_address TEXT,
  location_type TEXT,
  place_id TEXT,
  source TEXT NOT NULL DEFAULT 'google',
  hit_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_geocode_cache_key ON public.geocode_cache(cache_key);

GRANT SELECT ON public.geocode_cache TO authenticated;
GRANT ALL ON public.geocode_cache TO service_role;

ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem ler cache"
  ON public.geocode_cache FOR SELECT
  TO authenticated
  USING (true);
