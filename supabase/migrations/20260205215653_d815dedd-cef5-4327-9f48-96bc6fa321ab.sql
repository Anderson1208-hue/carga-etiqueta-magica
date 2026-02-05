-- Add CNPJ destinatário column to notas_fiscais table
ALTER TABLE public.notas_fiscais 
ADD COLUMN cnpj_destinatario text;

-- Add comment for documentation
COMMENT ON COLUMN public.notas_fiscais.cnpj_destinatario IS 'CNPJ do destinatário da NF-e (dest.CNPJ)';