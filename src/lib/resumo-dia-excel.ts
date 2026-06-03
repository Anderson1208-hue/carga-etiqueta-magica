import * as XLSX from "xlsx";
import { format } from "date-fns";
import { calculateBoxes } from "@/lib/xml-parser";
import type { ResumoDiaData, VeiculoDiaData } from "./resumo-dia-pdf";

function agruparEntregas(v: VeiculoDiaData) {
  const entregas = new Map<string, {
    razaoSocial: string;
    endereco: string;
    cnpj: string;
    ordem: number | undefined;
    nfs: VeiculoDiaData["nfs"];
  }>();
  v.nfs.forEach((nf) => {
    const cnpj = nf.cnpj_destinatario || "SEM_CNPJ";
    if (!entregas.has(cnpj)) {
      const end = [nf.dest_logradouro, nf.dest_numero, nf.dest_bairro, nf.dest_cidade, nf.dest_uf]
        .filter(Boolean).join(", ");
      entregas.set(cnpj, {
        razaoSocial: nf.dest_razao_social || "—",
        endereco: end || "—",
        cnpj,
        ordem: nf.ordem_entrega,
        nfs: [],
      });
    }
    const grp = entregas.get(cnpj)!;
    grp.nfs.push(nf);
    if (grp.ordem === undefined && nf.ordem_entrega !== undefined) grp.ordem = nf.ordem_entrega;
  });
  return new Map(
    Array.from(entregas.entries()).sort((a, b) => {
      const oa = a[1].ordem ?? Number.POSITIVE_INFINITY;
      const ob = b[1].ordem ?? Number.POSITIVE_INFINITY;
      return oa - ob;
    })
  );
}

export function generateResumoDiaExcel(data: ResumoDiaData): Blob {
  const dataFormatada = format(new Date(data.data + "T12:00:00"), "dd/MM/yyyy");
  const wb = XLSX.utils.book_new();

  // ===== Sheet 1: Detalhado (uma linha por NF) =====
  const rows: (string | number)[][] = [];
  rows.push([
    "Placa",
    "Motorista",
    "Código Acesso",
    "Ordem Entrega",
    "Razão Social",
    "Endereço",
    "Bairro",
    "Cidade",
    "Embarcador",
    "NF",
    "CT-e",
    "Reentrega",
    "Caixas",
    "Peso (kg)",
    "M³",
  ]);

  let gNfs = 0, gCx = 0, gPeso = 0, gVol = 0;

  data.veiculos.forEach((v) => {
    const entregas = agruparEntregas(v);
    let vNfs = 0, vCx = 0, vPeso = 0, vVol = 0;
    let fallbackIdx = 0;

    for (const [, group] of entregas) {
      fallbackIdx++;
      const ordemNum = group.ordem ?? fallbackIdx;
      for (const nf of group.nfs) {
        const cx = nf.itens_nf.reduce((s, it) => s + calculateBoxes(Number(it.q_com)), 0);
        const cteStr = nf.ctes.map((c) => c.numero_cte).join(", ");
        rows.push([
          v.placa,
          v.motorista || "",
          v.accessCode || "",
          ordemNum,
          group.razaoSocial,
          [nf.dest_logradouro, nf.dest_numero].filter(Boolean).join(", "),
          nf.dest_bairro || "",
          nf.dest_cidade || "",
          nf.razao_social_emitente || "",
          nf.numero_nf,
          cteStr,
          (nf as any).reentrega ? "SIM" : "",
          cx,
          Number(Number(nf.peso_bruto || 0).toFixed(2)),
          Number(Number(nf.volume_m3 || 0).toFixed(3)),
        ]);
        vNfs++; vCx += cx; vPeso += Number(nf.peso_bruto || 0); vVol += Number(nf.volume_m3 || 0);
      }
    }

    // Subtotal veículo
    rows.push([
      "", v.placa, `Subtotal ${v.placa}`, "", "",
      "", "", "", "", "",
      `${vNfs} NFs`, "", "", "",
      vCx,
      Number(vPeso.toFixed(2)),
      Number(vVol.toFixed(3)),
    ]);
    rows.push([]);
    gNfs += vNfs; gCx += vCx; gPeso += vPeso; gVol += vVol;
  });

  rows.push([
    "", "", "TOTAL GERAL", "", "",
    "", "", "", "", "",
    `${gNfs} NFs`, "", "", "",
    gCx,
    Number(gPeso.toFixed(2)),
    Number(gVol.toFixed(3)),
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 12 }, { wch: 10 }, { wch: 24 }, { wch: 12 }, { wch: 8 },
    { wch: 36 }, { wch: 36 }, { wch: 20 }, { wch: 20 }, { wch: 32 },
    { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 36 }, { wch: 8 }, { wch: 12 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Detalhado");

  // ===== Sheet 2: Totais por veículo =====
  const totRows: (string | number)[][] = [];
  totRows.push(["Data", "Placa", "Motorista", "Código", "NFs", "Caixas", "Peso (kg)", "M³"]);
  let tNfs = 0, tCx = 0, tPeso = 0, tVol = 0;
  data.veiculos.forEach((v) => {
    const nNfs = v.nfs.length;
    const nCx = v.nfs.reduce((s, nf) => s + nf.itens_nf.reduce((si, it) => si + calculateBoxes(Number(it.q_com)), 0), 0);
    const nPeso = v.nfs.reduce((s, nf) => s + Number(nf.peso_bruto || 0), 0);
    const nVol = v.nfs.reduce((s, nf) => s + Number(nf.volume_m3 || 0), 0);
    totRows.push([
      dataFormatada,
      v.placa,
      v.motorista || "",
      v.accessCode || "",
      nNfs,
      nCx,
      Number(nPeso.toFixed(2)),
      Number(nVol.toFixed(3)),
    ]);
    tNfs += nNfs; tCx += nCx; tPeso += nPeso; tVol += nVol;
  });
  totRows.push([
    "", "", "TOTAL", "",
    tNfs, tCx, Number(tPeso.toFixed(2)), Number(tVol.toFixed(3)),
  ]);
  const wsTot = XLSX.utils.aoa_to_sheet(totRows);
  wsTot["!cols"] = [
    { wch: 12 }, { wch: 10 }, { wch: 28 }, { wch: 12 },
    { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, wsTot, "Totais por Veículo");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
