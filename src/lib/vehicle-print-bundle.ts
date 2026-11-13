import { PDFDocument } from "pdf-lib";

/** Append original PDF pages without re-rendering their layouts or totals. */
export async function appendPdf(target: PDFDocument, blob: Blob): Promise<void> {
  const source = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
  const pages = await target.copyPages(source, source.getPageIndices());
  for (const page of pages) target.addPage(page);
}

export async function savePrintBundle(target: PDFDocument): Promise<Blob> {
  if (target.getPageCount() === 0) throw new Error("Nenhum documento para imprimir");
  const bytes = await target.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}