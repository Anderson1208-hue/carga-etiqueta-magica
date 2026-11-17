// Lógica compartilhada com o servidor (consolidado por e-mail).
export * from "../../supabase/functions/_shared/divergencia-planilha";
import { semZeros, turnoDe, type DivergenciaRow, type ItemNf } from "../../supabase/functions/_shared/divergencia-planilha";

const dataSo = (iso: string | null | undefined): Date | "" => {
  if (!iso) return "";
  const s = iso.length === 10 ? iso : new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const STATUS_FALTA = "NF'S SEGUIRAM PARA AS ENTREGAS COM FALTA";

/** Linhas A–M do modelo Cacau "DIVERGÊNCIA T - CARGA" (mesmas colunas e tipos do arquivo enviado pela Cacau). */
export function linhasModeloCacau(
  itens: DivergenciaRow[],
  ctx: { numeroCarga: string; placa: string; emissaoPorNf: Record<string, string | null> ; itensPorNf: Record<string, ItemNf[]> },
): (string | number | Date)[][] {
  const carga = /^\d{1,15}$/.test(ctx.numeroCarga) ? Number(ctx.numeroCarga) : ctx.numeroCarga;
  const out: (string | number | Date)[][] = [];
  for (const d of itens) {
    const linha = (cod: string, desc: string, qtd: string, status: string) => {
      const c = /^\d{1,15}$/.test(cod) ? Number(cod) : cod;
      out.push([dataSo(ctx.emissaoPorNf[d.numero_nf]), dataSo(d.criado_em), "SIM", d.criado_por_nome ?? "", ctx.placa,
        c, desc, qtd, carga, status, "", "", turnoDe(d.criado_em)]);
    };
    if (d.tipo === "falta_total") {
      for (const it of ctx.itensPorNf[d.numero_nf] ?? []) linha(semZeros(it.c_prod), it.x_prod, `${Math.ceil(Number(it.q_com) || 0)} - falta`, "");
    } else {
      linha(semZeros(d.c_prod), d.x_prod ?? "", `${d.quantidade} - ${d.tipo === "avaria" ? "avaria" : d.tipo === "sobra" ? "sobra" : "falta"}`,
        d.tipo === "falta_parcial" ? STATUS_FALTA : "");
    }
  }
  return out;
}
