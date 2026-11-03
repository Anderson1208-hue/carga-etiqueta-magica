import type { UIMessage } from 'ai';
import type { Report } from '../../supabase/functions/agente-gerencial/report';
export type { Report };
export type AgentMessage = UIMessage<unknown, { report: Report }>;
export interface AgentThread { id: string; titulo: string; updated_at: string }
export function textOf(message: AgentMessage) {
  return message.parts.filter(p => p.type === 'text').map(p => p.text).join('\n');
}
export async function exportReport(report: Report, format: 'pdf' | 'excel') {
  const columns = Array.from(new Set(report.rows.flatMap(Object.keys)));
  const name = `Agente_Gerencial_${report.dataset}_${report.period.inicio}_${report.period.fim}`;
  if (format === 'excel') {
    const XLSX = await import('xlsx');
    const { safeCell } = await import('../../supabase/functions/agente-gerencial/report');
    const workbook = XLSX.utils.book_new();
    const summary = [
      ['Relatório', report.title], ['Período inicial', report.period.inicio], ['Período final', report.period.fim],
      ['Consulta em', report.generatedAt], ['Completo', report.complete ? 'Sim' : 'Não — refine os filtros'],
      ['Filtros', JSON.stringify(report.filters)], ...Object.entries(report.totals),
      ...Object.entries(report.missing).map(([k,v]) => [`Sem ${k}`,v]),
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), 'Resumo');
    const sheet = XLSX.utils.aoa_to_sheet([columns, ...report.rows.map(row => columns.map(c => safeCell(row[c] ?? null)))]);
    sheet['!cols'] = columns.map(() => ({wch: 23}));
    XLSX.utils.book_append_sheet(workbook, sheet, 'Dados');
    XLSX.writeFile(workbook, `${name}.xlsx`);
  } else {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF({ orientation: 'landscape', format: 'a3' });
    doc.setFontSize(15);
    doc.text(report.title.slice(0,120), 12, 14);
    doc.setFontSize(9);
    doc.text(`${report.period.inicio} a ${report.period.fim} | ${report.rows.length} registros | ${report.complete ? 'Completo' : 'PARCIAL — refine os filtros'}`, 12, 21);
    doc.text(`Consulta: ${report.generatedAt} | Filtros: ${JSON.stringify(report.filters).slice(0,180)}`,12,27);
    autoTable(doc, {startY: 32, head: [['Total','Valor']], body: Object.entries(report.totals).map(([k,v]) => [k,v.toLocaleString('pt-BR',{maximumFractionDigits:6})]), styles:{fontSize:8}, margin:{left:12,right:12}});
    autoTable(doc, {head: [columns], body: report.rows.map(row => columns.map(c => String(row[c] ?? '—'))), styles:{fontSize:6,overflow:'linebreak'}, margin:{left:12,right:12}, horizontalPageBreak:true});
    doc.save(`${name}.pdf`);
  }
}