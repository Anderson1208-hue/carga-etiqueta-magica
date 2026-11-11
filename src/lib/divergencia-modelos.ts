import ExcelJS from "exceljs";
import JSZip from "jszip";
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

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const COLS = "ABCDEFGHIJKL";
function celula(ref: string, st: string, v: string | number | null) {
  if (v === null || v === "") return `<c r="${ref}" s="${st}"/>`;
  if (typeof v === "number") return `<c r="${ref}" s="${st}"><v>${v}</v></c>`;
  return `<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}
const numOuTexto = (v: string | number) => (typeof v === "string" && /^\d{1,15}$/.test(v) ? Number(v) : v);
function serialData(br: string): number | string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br);
  return m ? Math.round((Date.UTC(+m[3], +m[2] - 1, +m[1]) - Date.UTC(1899, 11, 30)) / 86400000) : br;
}

/** Pandurata/Arcor/Masterfoods — aba EXEMPLO original (Tabela16, estilos, coluna Valor Débito oculta): só troca valores no XML. */
export async function gerarProtocolo(itens: DivergenciaCliente[], ctx: { dt: string; lacre: string; motorista: string; hoje: string }) {
  const r = await fetch("/modelos-divergencia/protocolo.xlsx");
  if (!r.ok) throw new Error("Modelo protocolo.xlsx não encontrado");
  const zip = await JSZip.loadAsync(await r.arrayBuffer());
  let xml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  const estilos = (n: number) => [...(xml.match(new RegExp(`<row r="${n}"[^>]*>(.*?)</row>`, "s"))?.[1] ?? "").matchAll(/ s="(\d+)"/g)].map((m) => m[1]);
  const stDados = estilos(3), stTotal = estilos(24), stTitulo = estilos(1);
  const linhas = linhasProtocolo(itens, ctx).map((l) => [...l.slice(0, 8), "", ...l.slice(8)]);
  const n = Math.max(linhas.length, 21), total = 3 + n;
  const rows: string[] = [];
  rows.push(`<row r="1" spans="1:12" ht="21">${COLS.split("").map((c, j) => celula(`${c}1`, stTitulo[j], j === 0 ? `PROTOCOLO DE DIVERGÊNCIAS - ${ctx.hoje}` : null)).join("")}</row>`);
  rows.push(xml.match(/<row r="2".*?<\/row>/s)![0]);
  for (let i = 0; i < n; i++) {
    const l = linhas[i];
    rows.push(`<row r="${3 + i}" spans="1:12">${COLS.split("").map((c, j) => {
      const v = l ? (j === 9 ? serialData(String(l[j])) : numOuTexto(l[j])) : null;
      return celula(`${c}${3 + i}`, stDados[j], v);
    }).join("")}</row>`);
  }
  rows.push(`<row r="${total}" spans="1:12" ht="15.6">${COLS.split("").map((c, j) => celula(`${c}${total}`, stTotal[j], null)).join("")}</row>`);
  xml = xml.replace(/<sheetData>.*<\/sheetData>/s, `<sheetData>${rows.join("")}</sheetData>`)
    .replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:L${total}"/>`)
    .replace(/sqref="B25:B1048576"/, `sqref="B${total + 1}:B1048576"`);
  zip.file("xl/worksheets/sheet1.xml", xml);
  const tab = (await zip.file("xl/tables/table1.xml")!.async("string")).replace(/ref="A2:L\d+"/, `ref="A2:L${total}"`);
  zip.file("xl/tables/table1.xml", tab);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
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
