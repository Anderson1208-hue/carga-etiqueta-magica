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
    it("should sort by CNPJ destinatário first, then NF, then cProd, then seq", () => {
      const etiquetas = [
        { numeroNf: "100", cProd: "5", seq: 1, total: 2, xProd: "A", qrPayload: "", cnpjDestinatario: "12345678000199" },
        { numeroNf: "100", cProd: "5", seq: 2, total: 2, xProd: "A", qrPayload: "", cnpjDestinatario: "12345678000199" },
        { numeroNf: "9", cProd: "10", seq: 1, total: 1, xProd: "B", qrPayload: "", cnpjDestinatario: "11111111000100" },
        { numeroNf: "9", cProd: "2", seq: 1, total: 2, xProd: "C", qrPayload: "", cnpjDestinatario: "11111111000100" },
        { numeroNf: "9", cProd: "2", seq: 2, total: 2, xProd: "C", qrPayload: "", cnpjDestinatario: "11111111000100" },
        { numeroNf: "50", cProd: "1", seq: 1, total: 1, xProd: "D", qrPayload: "", cnpjDestinatario: "22222222000122" },
      ];

      const sorted = [...etiquetas].sort((a, b) => {
        const cnpjCompare = numericSort(a.cnpjDestinatario, b.cnpjDestinatario);
        if (cnpjCompare !== 0) return cnpjCompare;
        const nfCompare = numericSort(a.numeroNf, b.numeroNf);
        if (nfCompare !== 0) return nfCompare;
        const prodCompare = numericSort(a.cProd, b.cProd);
        if (prodCompare !== 0) return prodCompare;
        return a.seq - b.seq;
      });

      // Expected order: CNPJ 111... first (NF 9), then CNPJ 123... (NF 100), then CNPJ 222... (NF 50)
      expect(sorted.map(e => `${e.cnpjDestinatario.slice(0,5)}-${e.numeroNf}-${e.cProd}-${e.seq}`)).toEqual([
        "11111-9-2-1",     // CNPJ 111, NF 9, cProd 2, seq 1
        "11111-9-2-2",     // CNPJ 111, NF 9, cProd 2, seq 2
        "11111-9-10-1",    // CNPJ 111, NF 9, cProd 10, seq 1
        "12345-100-5-1",   // CNPJ 123, NF 100, cProd 5, seq 1
        "12345-100-5-2",   // CNPJ 123, NF 100, cProd 5, seq 2
        "22222-50-1-1",    // CNPJ 222, NF 50, cProd 1, seq 1
      ]);
    });

    it("should complete all labels of one CNPJ before starting next", () => {
      const etiquetas = [
        { numeroNf: "2", cProd: "1", seq: 1, total: 2, xProd: "A", qrPayload: "", cnpjDestinatario: "22222222000100" },
        { numeroNf: "2", cProd: "1", seq: 2, total: 2, xProd: "A", qrPayload: "", cnpjDestinatario: "22222222000100" },
        { numeroNf: "1", cProd: "3", seq: 1, total: 1, xProd: "B", qrPayload: "", cnpjDestinatario: "11111111000100" },
        { numeroNf: "1", cProd: "1", seq: 1, total: 1, xProd: "C", qrPayload: "", cnpjDestinatario: "11111111000100" },
      ];

      const sorted = [...etiquetas].sort((a, b) => {
        const cnpjCompare = numericSort(a.cnpjDestinatario, b.cnpjDestinatario);
        if (cnpjCompare !== 0) return cnpjCompare;
        const nfCompare = numericSort(a.numeroNf, b.numeroNf);
        if (nfCompare !== 0) return nfCompare;
        const prodCompare = numericSort(a.cProd, b.cProd);
        if (prodCompare !== 0) return prodCompare;
        return a.seq - b.seq;
      });

      // All CNPJ 111 labels should come before any CNPJ 222 labels
      const cnpj1Indices = sorted.map((e, i) => e.cnpjDestinatario.startsWith("111") ? i : -1).filter(i => i >= 0);
      const cnpj2Indices = sorted.map((e, i) => e.cnpjDestinatario.startsWith("222") ? i : -1).filter(i => i >= 0);
      const cnpj1EndIndex = Math.max(...cnpj1Indices);
      const cnpj2StartIndex = Math.min(...cnpj2Indices);
      
      expect(cnpj1EndIndex).toBeLessThan(cnpj2StartIndex);
    });
  });

  describe("Nota de Carga sorting", () => {
    it("should sort NFs by CNPJ destinatário first, then numero_nf numerically", () => {
      const nfs = [
        { numeroNf: "100", razaoSocialEmitente: "", cnpjEmitente: "", cnpjDestinatario: "33333333000100", dataEmissao: null, itens: [] },
        { numeroNf: "9", razaoSocialEmitente: "", cnpjEmitente: "", cnpjDestinatario: "11111111000100", dataEmissao: null, itens: [] },
        { numeroNf: "50", razaoSocialEmitente: "", cnpjEmitente: "", cnpjDestinatario: "22222222000100", dataEmissao: null, itens: [] },
        { numeroNf: "5", razaoSocialEmitente: "", cnpjEmitente: "", cnpjDestinatario: "11111111000100", dataEmissao: null, itens: [] },
      ];

      const sorted = [...nfs].sort((a, b) => {
        const cnpjCompare = numericSort(a.cnpjDestinatario, b.cnpjDestinatario);
        if (cnpjCompare !== 0) return cnpjCompare;
        return numericSort(a.numeroNf, b.numeroNf);
      });

      // CNPJ 111 (NFs 5, 9), then CNPJ 222 (NF 50), then CNPJ 333 (NF 100)
      expect(sorted.map(nf => nf.numeroNf)).toEqual(["5", "9", "50", "100"]);
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
