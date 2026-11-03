import { describe, expect, it } from 'vitest';
import { importCteLinks, type CteLink } from './cte-import';

describe('CT-e import preserves existing links', () => {
  const rows = Array.from({ length: 286 }, (_, i) => ({ chave_cte: `cte-${i}`, nf_id: `nf-${i}` }));

  it('keeps 166 existing links and saves the 120 missing links', async () => {
    const saved: CteLink[] = [];
    const result = await importCteLinks(rows, async ids => rows.slice(0, 166).filter(r => ids.includes(r.nf_id)), async batch => {
      saved.push(...batch);
      return { error: null };
    });
    expect(result.skipped).toBe(166);
    expect(saved).toEqual(rows.slice(166));
    expect(result.imported).toHaveLength(120);
  });

  it('ignores a concurrent duplicate without blocking other new links', async () => {
    const saved: CteLink[] = [];
    const result = await importCteLinks(rows.slice(0, 3), async () => [], async batch => {
      if (batch.some(r => r.nf_id === 'nf-1')) return { error: { code: '23505', message: 'duplicate key violates ctes_chave_cte_nf_id_key' } };
      saved.push(...batch);
      return { error: null };
    });
    expect(saved).toEqual([rows[0], rows[2]]);
    expect(result.skipped).toBe(1);
  });

  it('never writes an already imported batch or overwrites its freight', async () => {
    let writes = 0;
    const result = await importCteLinks(rows.slice(0, 2), async () => rows.slice(0, 2), async () => {
      writes++;
      return { error: null };
    });
    expect(writes).toBe(0);
    expect(result.imported).toEqual([]);
    expect(result.skipped).toBe(2);
  });

  it('deduplicates the selection by CT-e and NF, not CT-e alone', async () => {
    const a = { chave_cte: 'same-cte', nf_id: 'nf-a' };
    const b = { chave_cte: 'same-cte', nf_id: 'nf-b' };
    const result = await importCteLinks([a, a, b], async () => [], async () => ({ error: null }));
    expect(result.imported).toEqual([a, b]);
    expect(result.skipped).toBe(1);
  });

  it('reports permission and unrelated unique errors instead of ignoring them', async () => {
    for (const error of [{ code: '42501', message: 'permission denied' }, { code: '23505', message: 'ctes_pkey' }]) {
      await expect(importCteLinks(rows.slice(0, 1), async () => [], async () => ({ error }))).rejects.toThrow(error.message);
    }
  });
});