// Lógica compartilhada com o servidor (consolidado por e-mail).
export * from "../../supabase/functions/_shared/divergencia-planilha";
import { semZeros, turnoDe, type DivergenciaRow, type ItemNf } from "../../supabase/functions/_shared/divergencia-planilha";

const dataSo = (iso: string | null | undefined): Date | "" => {
  if (!iso) return "";
  const s = iso.length === 10 ? iso : new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const STATUS_PADRAO = "AG. ENVIO DAS MERCADORIAS";
const qtdCacau = (n: number, tipo: string) => `${String(n).padStart(2, "0")}-${tipo}`;

/** Linhas A–O do modelo Cacau "DIVERGÊNCIA T - CARGA" preenchido pela Cacau (NF na coluna E, "-" na sobra). */
export function linhasModeloCacau(
  itens: DivergenciaRow[],
  ctx: { numeroCarga: string; placa: string; emissaoPorNf: Record<string, string | null>; itensPorNf: Record<string, ItemNf[]> },
): (string | number | Date)[][] {
  const out: (string | number | Date)[][] = [];
  const num = (v: string) => (/^\d{1,15}$/.test(v) ? Number(v) : v);
  for (const d of itens) {
    const nf = d.tipo === "sobra" || !d.numero_nf ? "-" : num(d.numero_nf);
    const linha = (cod: string, desc: string, qtd: string) =>
      out.push([dataSo(ctx.emissaoPorNf[d.numero_nf]), dataSo(d.criado_em), "NÃO", "NÃO", nf, num(cod), desc, qtd, ctx.numeroCarga.split(/\s*[-–/,]\s*/).filter(Boolean).join(", "), STATUS_PADRAO, "", "", "", "", ""]);
    if (d.tipo === "falta_total") {
      for (const it of ctx.itensPorNf[d.numero_nf] ?? []) linha(semZeros(it.c_prod), it.x_prod, qtdCacau(Math.ceil(Number(it.q_com) || 0), "falta"));
    } else {
      linha(semZeros(d.c_prod), d.x_prod ?? "", qtdCacau(d.quantidade, d.tipo === "avaria" ? "avaria" : d.tipo === "sobra" ? "sobra" : "falta"));
    }
  }
  return out;
}
