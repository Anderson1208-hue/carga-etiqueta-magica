ALTER TABLE public.ordens_coleta
  ADD COLUMN cubagem_m3 numeric(14,3) CHECK (cubagem_m3 IS NULL OR cubagem_m3 >= 0),
  ADD COLUMN placa_carreta text CHECK (placa_carreta IS NULL OR placa_carreta ~ '^[A-Z0-9]{7}$'),
  ADD COLUMN cpf_motorista text CHECK (cpf_motorista IS NULL OR cpf_motorista ~ '^[0-9]{11}$'),
  ADD COLUMN codigo_otm text,
  ADD COLUMN numero_roteiro text;

COMMENT ON COLUMN public.ordens_coleta.placa IS 'Placa do cavalo da ordem de coleta.';
COMMENT ON COLUMN public.ordens_coleta.placa_carreta IS 'Placa da carreta da ordem de coleta.';
COMMENT ON COLUMN public.ordens_coleta.cpf_motorista IS 'CPF do motorista, armazenado somente com os 11 dígitos.';
COMMENT ON COLUMN public.ordens_coleta.codigo_otm IS 'Código do OTM informado pelo cliente.';
COMMENT ON COLUMN public.ordens_coleta.numero_roteiro IS 'Número do roteiro informado pelo cliente.';