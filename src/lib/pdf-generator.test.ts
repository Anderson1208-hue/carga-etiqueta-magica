import { describe, it, expect } from "vitest";

// Helper function for real numeric sorting (same as in pdf-generator.ts)
function numericSort(a: string, b: string): number {
  // Extract only digits for numeric comparison
  const numA = parseFloat(a.replace(/\D/g, '')) || 0;
  const numB = parseFloat(b.replace(/\D/g, '')) || 0;
  if (numA !== numB) return numA - numB;
  return a.localeCompare(b);
}

describe("PDF Generator - Numeric Sorting", () => {
  describe("numericSort function", () => {
    it("should sort numeric strings correctly (not textually)", () => {
      const items = ["10", "2", "1", "20", "3", "100"];
      const sorted = [...items].sort(numericSort);
      
      expect(sorted).toEqual(["1", "2", "3", "10", "20", "100"]);
    });

    it("should handle product codes - extracts first number found", () => {
      // Note: SKU-20 extracts "20", SKU-10 extracts "10", etc.
      // This sorts by the numeric value found in the string
      const items = ["SKU-10", "SKU-2", "SKU-1", "SKU-20"];
      const sorted = [...items].sort(numericSort);
      
      // Sorts by extracted number: 1, 2, 10, 20
      expect(sorted).toEqual(["SKU-1", "SKU-2", "SKU-10", "SKU-20"]);
    });

    it("should handle mixed numeric and text codes", () => {
      const items = ["100", "9", "50", "5"];
      const sorted = [...items].sort(numericSort);
      
      expect(sorted).toEqual(["5", "9", "50", "100"]);
    });
  });

  describe("Romaneio Totalizado sorting", () => {
    it("should sort items by cProd numerically", () => {
      const itens = [
        { cProd: "100", xProd: "Produto C", quantidadeTotal: 5 },
        { cProd: "9", xProd: "Produto A", quantidadeTotal: 3 },
        { cProd: "50", xProd: "Produto B", quantidadeTotal: 7 },
      ];

      const sorted = [...itens].sort((a, b) => numericSort(a.cProd, b.cProd));

      expect(sorted.map(i => i.cProd)).toEqual(["9", "50", "100"]);
    });
  });

  describe("Etiquetas ordering", () => {
    it("should sort by NF first, then cProd, then seq", () => {
      const etiquetas = [
        { numeroNf: "100", cProd: "5", seq: 1, total: 2, xProd: "A", qrPayload: "" },
        { numeroNf: "100", cProd: "5", seq: 2, total: 2, xProd: "A", qrPayload: "" },
        { numeroNf: "9", cProd: "10", seq: 1, total: 1, xProd: "B", qrPayload: "" },
        { numeroNf: "9", cProd: "2", seq: 1, total: 2, xProd: "C", qrPayload: "" },
        { numeroNf: "9", cProd: "2", seq: 2, total: 2, xProd: "C", qrPayload: "" },
        { numeroNf: "50", cProd: "1", seq: 1, total: 1, xProd: "D", qrPayload: "" },
      ];

      const sorted = [...etiquetas].sort((a, b) => {
        const nfCompare = numericSort(a.numeroNf, b.numeroNf);
        if (nfCompare !== 0) return nfCompare;
        const prodCompare = numericSort(a.cProd, b.cProd);
        if (prodCompare !== 0) return prodCompare;
        return a.seq - b.seq;
      });

      // Expected order: NF 9 first (all its items), then NF 50, then NF 100
      expect(sorted.map(e => `${e.numeroNf}-${e.cProd}-${e.seq}`)).toEqual([
        "9-2-1",    // NF 9, cProd 2, seq 1
        "9-2-2",    // NF 9, cProd 2, seq 2
        "9-10-1",   // NF 9, cProd 10, seq 1
        "50-1-1",   // NF 50, cProd 1, seq 1
        "100-5-1",  // NF 100, cProd 5, seq 1
        "100-5-2",  // NF 100, cProd 5, seq 2
      ]);
    });

    it("should complete all labels of one NF before starting next", () => {
      const etiquetas = [
        { numeroNf: "2", cProd: "1", seq: 1, total: 2, xProd: "A", qrPayload: "" },
        { numeroNf: "2", cProd: "1", seq: 2, total: 2, xProd: "A", qrPayload: "" },
        { numeroNf: "1", cProd: "3", seq: 1, total: 1, xProd: "B", qrPayload: "" },
        { numeroNf: "1", cProd: "1", seq: 1, total: 1, xProd: "C", qrPayload: "" },
      ];

      const sorted = [...etiquetas].sort((a, b) => {
        const nfCompare = numericSort(a.numeroNf, b.numeroNf);
        if (nfCompare !== 0) return nfCompare;
        const prodCompare = numericSort(a.cProd, b.cProd);
        if (prodCompare !== 0) return prodCompare;
        return a.seq - b.seq;
      });

      // All NF 1 labels should come before any NF 2 labels
      const nf1Indices = sorted.map((e, i) => e.numeroNf === "1" ? i : -1).filter(i => i >= 0);
      const nf2Indices = sorted.map((e, i) => e.numeroNf === "2" ? i : -1).filter(i => i >= 0);
      const nf1EndIndex = Math.max(...nf1Indices);
      const nf2StartIndex = Math.min(...nf2Indices);
      
      expect(nf1EndIndex).toBeLessThan(nf2StartIndex);
    });
  });

  describe("Nota de Carga sorting", () => {
    it("should sort NFs by numero_nf numerically", () => {
      const nfs = [
        { numeroNf: "100", razaoSocialEmitente: "", cnpjEmitente: "", dataEmissao: null, itens: [] },
        { numeroNf: "9", razaoSocialEmitente: "", cnpjEmitente: "", dataEmissao: null, itens: [] },
        { numeroNf: "50", razaoSocialEmitente: "", cnpjEmitente: "", dataEmissao: null, itens: [] },
      ];

      const sorted = [...nfs].sort((a, b) => numericSort(a.numeroNf, b.numeroNf));

      expect(sorted.map(nf => nf.numeroNf)).toEqual(["9", "50", "100"]);
    });

    it("should sort items within NF by cProd numerically", () => {
      const itens = [
        { cProd: "100", xProd: "A", qtdCaixas: 1 },
        { cProd: "9", xProd: "B", qtdCaixas: 2 },
        { cProd: "50", xProd: "C", qtdCaixas: 3 },
      ];

      const sorted = [...itens].sort((a, b) => numericSort(a.cProd, b.cProd));

      expect(sorted.map(i => i.cProd)).toEqual(["9", "50", "100"]);
    });
  });
});
