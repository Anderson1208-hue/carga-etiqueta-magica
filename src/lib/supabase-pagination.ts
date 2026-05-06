/**
 * Helpers de paginação para contornar o limite default do PostgREST (1000 linhas).
 *
 * Padrão consolidado no projeto:
 * - `.range(from, from + PAGE - 1)` em loop até esgotar
 * - Chunking de 200 ids quando a query usa `.in()`
 *
 * Uso:
 *   const all = await fetchAllPages((from, to) =>
 *     supabase.from("baixas_entrega").select("*")
 *       .order("registrado_em", { ascending: false })
 *       .range(from, to)
 *   );
 */

export const DEFAULT_PAGE_SIZE = 1000;
export const DEFAULT_IN_CHUNK = 200;

type QueryFn<T> = (
  from: number,
  to: number
) => PromiseLike<{ data: T[] | null; error: unknown }>;

/**
 * Pagina uma query Supabase até esgotar todos os resultados.
 * IMPORTANTE: a query deve ter `.order(...)` para paginação determinística.
 */
export async function fetchAllPages<T>(
  buildQuery: QueryFn<T>,
  pageSize: number = DEFAULT_PAGE_SIZE
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // Trava de segurança contra loops infinitos
  const HARD_LIMIT_PAGES = 200; // 200 * 1000 = 200k linhas
  for (let p = 0; p < HARD_LIMIT_PAGES; p++) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) {
      console.error("[fetchAllPages]", error);
      throw error;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

/**
 * Faz chunk de uma lista de IDs e executa um callback para cada chunk,
 * concatenando os resultados.
 *
 * Uso típico:
 *   const rows = await fetchInChunks(nfIds, async (chunk) => {
 *     const { data } = await supabase.from("ctes").select("...").in("nf_id", chunk);
 *     return data || [];
 *   });
 */
export async function fetchInChunks<TId, TRow>(
  ids: TId[],
  fetcher: (chunk: TId[]) => Promise<TRow[]>,
  chunkSize: number = DEFAULT_IN_CHUNK
): Promise<TRow[]> {
  if (!ids || ids.length === 0) return [];
  const unique = Array.from(new Set(ids));
  const out: TRow[] = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    const slice = unique.slice(i, i + chunkSize);
    const rows = await fetcher(slice);
    if (rows && rows.length > 0) out.push(...rows);
  }
  return out;
}
