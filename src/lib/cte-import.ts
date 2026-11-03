export interface CteLink {
  chave_cte: string;
  nf_id: string;
}

interface InsertError {
  code?: string;
  message: string;
}

const key = (row: CteLink) => `${row.chave_cte}:${row.nf_id}`;

/** Preserve existing links, including when another importer wins the insert race. */
export async function importCteLinks<T extends CteLink>(
  rows: T[],
  findExisting: (nfIds: string[]) => Promise<CteLink[]>,
  insert: (rows: T[]) => Promise<{ error: InsertError | null }>,
) {
  const unique = [...new Map(rows.map(row => [key(row), row])).values()];
  const nfIds = [...new Set(unique.map(row => row.nf_id))];
  const existing = new Set<string>();
  for (let offset = 0; offset < nfIds.length; offset += 100) {
    for (const row of await findExisting(nfIds.slice(offset, offset + 100))) {
      existing.add(key(row));
    }
  }
  const pending = unique.filter(row => !existing.has(key(row)));
  const imported: T[] = [];
  let skipped = rows.length - pending.length;

  async function save(batch: T[]): Promise<void> {
    if (batch.length === 0) return;
    const { error } = await insert(batch);
    if (!error) {
      imported.push(...batch);
      return;
    }
    const duplicate = error.code === '23505' && error.message.includes('ctes_chave_cte_nf_id_key');
    if (!duplicate) {
      throw new Error(`${error.message}${imported.length ? ` (${imported.length} vínculo(s) já salvo(s); selecione os XMLs novamente para concluir sem duplicar.)` : ''}`);
    }
    if (batch.length === 1) {
      skipped++;
      return;
    }
    const middle = Math.floor(batch.length / 2);
    await save(batch.slice(0, middle));
    await save(batch.slice(middle));
  }

  for (let offset = 0; offset < pending.length; offset += 100) {
    await save(pending.slice(offset, offset + 100));
  }
  return { imported, skipped };
}