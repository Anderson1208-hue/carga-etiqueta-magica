import { supabase } from "@/integrations/supabase/client";

export interface NfEnderecamento {
  id: string;
  nf_id: string;
  posicao: string;
  principal: boolean;
  created_at: string;
}

/**
 * Busca todos os endereçamentos de um conjunto de NF ids.
 * Faz chunking (200 ids por vez) e paginação (1000 linhas por página)
 * para evitar o limite default do PostgREST.
 * Retorna um Map<nf_id, posicao[]> com a posição "principal" primeiro.
 */
export async function fetchEnderecamentosByNfIds(
  nfIds: string[]
): Promise<Map<string, string[]>> {
  const map = new Map<string, NfEnderecamento[]>();
  if (!nfIds || nfIds.length === 0) return new Map();

  const ids = Array.from(new Set(nfIds.filter(Boolean)));
  const CHUNK = 200;
  const PAGE = 1000;

  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("nf_enderecamento")
        .select("id, nf_id, posicao, principal, created_at")
        .in("nf_id", slice)
        .order("principal", { ascending: false })
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);

      if (error) {
        console.error("[fetchEnderecamentosByNfIds]", error);
        break;
      }
      if (!data || data.length === 0) break;

      for (const row of data as NfEnderecamento[]) {
        const arr = map.get(row.nf_id) || [];
        arr.push(row);
        map.set(row.nf_id, arr);
      }

      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  // Reduz para Map<nf_id, string[]>
  const out = new Map<string, string[]>();
  for (const [nfId, rows] of map.entries()) {
    out.set(
      nfId,
      rows.map((r) => r.posicao.trim()).filter((s) => s.length > 0)
    );
  }
  return out;
}
