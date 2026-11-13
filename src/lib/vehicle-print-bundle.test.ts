import { Blob as NodeBlob } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { appendPdf, savePrintBundle } from "./vehicle-print-bundle";

vi.stubGlobal("Blob", NodeBlob);

describe("vehicle print bundle", () => {
  it("keeps every page in resumo then nota order for each vehicle", async () => {
    const target = await PDFDocument.create();
    for (const widths of [[210, 211], [310], [220], [320, 321]]) {
      const source = await PDFDocument.create();
      for (const width of widths) source.addPage([width, 400]);
      await appendPdf(target, new Blob([new Uint8Array(await source.save())]));
    }
    const saved = await PDFDocument.load(new Uint8Array(await (await savePrintBundle(target)).arrayBuffer()));
    expect(saved.getPages().map(page => page.getWidth())).toEqual([210, 211, 310, 220, 320, 321]);
  });

  it("does not publish an empty or failed partial document", async () => {
    const target = await PDFDocument.create();
    await expect(savePrintBundle(target)).rejects.toThrow("Nenhum documento");
    await expect(appendPdf(target, new Blob(["invalid PDF"]))).rejects.toThrow();
    expect(target.getPageCount()).toBe(0);
  });
});