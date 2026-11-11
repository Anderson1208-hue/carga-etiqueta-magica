import ExcelJS from "exceljs";
import { linhasDocile, linhasProtocolo, planilhaHersheys, type DivergenciaCliente } from "./divergencia-clientes";

/** Preenche os modelos originais enviados pelos clientes (formatação, logos e listas preservados). */
async function abrir(nome: string) {
  const r = await fetch(`/modelos-divergencia/${nome}`);
  if (!r.ok) throw new Error(`Modelo ${nome} não encontrado`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await r.arrayBuffer());
  return wb;
}

function escreverLinhas(ws: ExcelJS.Worksheet, inicio: number, colIni: number, linhas: (string | number)[][], linhaModelo: number) {
  linhas.forEach((l, i) => {
    const row = ws.getRow(inicio + i);
    l.forEach((v, j) => {
      const c = row.getCell(colIni + j);
      if (inicio + i > linhaModelo) c.style = { ...ws.getRow(inicio).getCell(colIni + j).style };
      c.value = v === "" ? null : v;
    });
    row.commit();
  });
}

const buf = async (wb: ExcelJS.Workbook) => new Uint8Array(await wb.xlsx.writeBuffer());

export async function gerarProtocolo(itens: DivergenciaCliente[], ctx: { dt: string; lacre: string; motorista: string; hoje: string }) {
  const wb = await abrir("protocolo.xlsx");
  const ws = wb.worksheets[0];
  ws.getCell("A1").value = `PROTOCOLO DE DIVERGÊNCIAS - ${ctx.hoje}`;
  // modelo: A DT, B NF, C Produto, D Descrição, E Qtd NF, F Qtd recebida, G Diver, H Status, I Valor Débito (em branco), J Data, K Lacre, L Motorista
  const linhas = linhasProtocolo(itens, ctx).map((l) => [...l.slice(0, 8), "", ...l.slice(8)]);
  escreverLinhas(ws, 3, 1, linhas, 24);
  return buf(wb);
}

export async function gerarHersheys(itens: DivergenciaCliente[], ctx: { placa: string; motorista: string; recebimento: string; romaneio: string; lacre: string }) {
  const wb = await abrir("hersheys.xlsx");
  const ws = wb.getWorksheet("OCORRENCIA") ?? wb.worksheets[0];
  ws.getCell("F7").value = "Ebenezer";
  ws.getCell("F9").value = ctx.motorista || null;
  ws.getCell("F10").value = ctx.placa || null;
  ws.getCell("F14").value = ctx.recebimento || null;
  ws.getCell("F15").value = ctx.romaneio || null;
  ws.getCell("F16").value = ctx.lacre || null;
  const tab = planilhaHersheys(itens, ctx);
  const linhas = tab.slice(tab.findIndex((l) => l[0] === "SKU") + 1);
  escreverLinhas(ws, 19, 4, linhas, 39);
  return buf(wb);
}

export async function gerarDocile(itens: DivergenciaCliente[], ctx: { dataColeta: string; embarque: string }) {
  const wb = await abrir("docile.xlsx");
  const ws = wb.worksheets[0];
  escreverLinhas(ws, 3, 2, linhasDocile(itens, ctx), 3);
  return buf(wb);
}
