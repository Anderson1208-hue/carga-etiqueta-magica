import { describe, expect, it } from "vitest";
import { fetchAllPages } from "./supabase-pagination";

describe("paginação da conferência da NF 4517028", () => {
  it("conta todas as 1067 caixas, inclusive as últimas 67 da etapa dois", async () => {
    const etiquetas = Array.from({ length: 1067 }, (_, id) => ({
      id,
      numero_nf: "4517028",
      status: id < 1000 ? "conferido" : "conferido_interno",
    }));
    const ranges: number[][] = [];
    const rows = await fetchAllPages(async (from, to) => {
      ranges.push([from, to]);
      return { data: etiquetas.slice(from, to + 1), error: null };
    });
    expect(rows).toHaveLength(1067);
    expect(rows.filter((row) => row.status === "conferido_interno")).toHaveLength(67);
    expect(rows.filter((row) => row.status === "conferido").length === rows.length).toBe(false);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
  });

  it("não aceita contagem parcial quando a segunda página falha", async () => {
    await expect(fetchAllPages(async (from) => from === 0
      ? { data: Array.from({ length: 1000 }, (_, id) => ({ id })), error: null }
      : { data: null, error: new Error("falha de consulta") },
    )).rejects.toThrow("falha de consulta");
  });
});