export const INICIO_CONSULTA_OKENTREGA = "2026-10-22";
export const STATUS_CONSULTA_OKENTREGA = ["aguardando_aprovacao", "enviado"];

export interface NotaConsultaOkEntrega { id: string; nf_id: string; numero_nf: string }
export interface ResumoConsultaOkEntrega {
  consultadas: number;
  atualizadas: number;
  aprovadas: number;
  recusadas: number;
  emAnalise: number;
  semResultado: number;
  foraPeriodo: number;
  falhas: number;
  incompleta: boolean;
}
interface DependenciasConsulta {
  pagina: (cursor?: string) => Promise<NotaConsultaOkEntrega[]>;
  datas: (notas: NotaConsultaOkEntrega[]) => Promise<Map<string, string>>;
  consultar: (nota: NotaConsultaOkEntrega, data: string) => Promise<{ atualizado?: boolean; status?: string }>;
  progresso?: (resumo: ResumoConsultaOkEntrega) => void;
  pausa: () => Promise<void>;
}

// Each note uses only the existing authenticated consultation endpoint, never transmission.
export async function atualizarResultadosOkEntrega(deps: DependenciasConsulta): Promise<ResumoConsultaOkEntrega> {
  const resumo: ResumoConsultaOkEntrega = {
    consultadas: 0, atualizadas: 0, aprovadas: 0, recusadas: 0, emAnalise: 0,
    semResultado: 0, foraPeriodo: 0, falhas: 0, incompleta: false,
  };
  let cursor: string | undefined;
  try {
    for (;;) {
      const notas = await deps.pagina(cursor);
      if (!notas.length) break;
      const datas = await deps.datas(notas);
      for (let i = 0; i < notas.length; i += 3) {
        await Promise.all(notas.slice(i, i + 3).map(async nota => {
          const data = datas.get(nota.nf_id);
          if (!data) { resumo.foraPeriodo++; return; }
          resumo.consultadas++;
          try {
            const resultado = await deps.consultar(nota, data);
            if (!resultado.atualizado) resumo.semResultado++;
            else {
              resumo.atualizadas++;
              if (resultado.status === "aprovado") resumo.aprovadas++;
              else if (resultado.status === "recusado") resumo.recusadas++;
              else resumo.emAnalise++;
            }
          } catch { resumo.falhas++; }
        }));
        deps.progresso?.({ ...resumo });
        await deps.pausa();
      }
      const ultimo = notas.at(-1);
      if (!ultimo || ultimo.id === cursor) throw new Error("Cursor não avançou");
      cursor = ultimo.id;
    }
  } catch { resumo.incompleta = true; }
  return resumo;
}