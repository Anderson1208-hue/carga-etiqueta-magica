import { supabase } from "@/integrations/supabase/client";

/**
 * URL assinada de uma versão reduzida da foto (para visualizar na tela).
 * A original nunca é alterada. Se a redução não estiver disponível, devolve a original.
 */
export async function urlFotoLeve(path: string, expiraSeg: number, bucket = "comprovantes"): Promise<string | null> {
  try {
    const { data } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiraSeg, { transform: { width: 1400, quality: 70 } });
    if (data?.signedUrl) {
      const r = await fetch(data.signedUrl, { method: "HEAD" }).catch(() => null);
      if (r?.ok) return data.signedUrl;
    }
  } catch {
    /* cai para a original */
  }
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expiraSeg);
  return data?.signedUrl ?? null;
}
