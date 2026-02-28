-- Allow motorista to be nullable so vehicles can be created without a driver
ALTER TABLE public.veiculos ALTER COLUMN motorista DROP NOT NULL;
ALTER TABLE public.veiculos ALTER COLUMN motorista SET DEFAULT '';