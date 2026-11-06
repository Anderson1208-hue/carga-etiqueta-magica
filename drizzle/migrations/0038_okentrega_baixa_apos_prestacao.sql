CREATE OR REPLACE FUNCTION public.fn_okentrega_baixa_pos_prestacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  if NEW.foto_path is null or NEW.okentrega_enviada_em is not null
     or coalesce(NEW.conferencia_status,'') = 'canhoto_pendente' then
    return null;
  end if;
  if not exists (select 1 from veiculos v where v.id = NEW.veiculo_id and v.prestacao_contas_em is not null) then
    return null;
  end if;
  perform net.http_post(
    url := 'https://ddcglijsqqiaulmfadxh.supabase.co/functions/v1/okentrega-enfileirar',
    headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkY2dsaWpzcXFpYXVsbWZhZHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MDg3NDYsImV4cCI6MjA4NTM4NDc0Nn0.nuEFYPTWTaUjjt8Q3sVyfYb7o6n_2HBCxMDWtJ_fQ8M'),
    body := jsonb_build_object('veiculo_id', NEW.veiculo_id::text)
  );
  return null;
end;
$$;

DROP TRIGGER IF EXISTS tg_okentrega_baixa_pos_prestacao ON public.baixas_entrega;
CREATE TRIGGER tg_okentrega_baixa_pos_prestacao
AFTER INSERT OR UPDATE OF foto_path, conferencia_status ON public.baixas_entrega
FOR EACH ROW EXECUTE FUNCTION public.fn_okentrega_baixa_pos_prestacao();