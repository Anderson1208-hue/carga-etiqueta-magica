import { useRef, useState } from 'react';
import ExcelJS from 'exceljs';
import { FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { classificar, dia, nfNumero, resumo, type OtdRow, type Sistema } from '@/lib/otd-bauducco';

const cellValue = (v: ExcelJS.CellValue): unknown => (v && typeof v === 'object' && !(v instanceof Date) ? ('result' in v ? v.result : 'text' in v ? v.text : String(v)) : v);

export function ConferenciaOtdBauducco() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function processar(file: File) {
    setBusy(true);
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      const header = (ws.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(v => String(v ?? '').trim());
      if (!header.includes('Nota Fiscal') || !header.includes('OTD')) throw new Error('Planilha fora do modelo OTD Bauducco (faltam as colunas Nota Fiscal/OTD).');
      const rows: OtdRow[] = [];
      ws.eachRow((r, i) => { if (i === 1) return; const o: OtdRow = {}; header.forEach((h, c) => (o[h] = cellValue(r.getCell(c + 1).value))); if (o['Nota Fiscal']) rows.push(o); });
      const nfs = [...new Set(rows.map(r => nfNumero(r['Nota Fiscal'])).filter(Boolean))];
      const sis = new Map<string, Sistema>();
      for (let i = 0; i < nfs.length; i += 2000) {
        const { data, error } = await supabase.rpc('agente_otd_conferir', { p_nfs: nfs.slice(i, i + 2000) });
        if (error) throw new Error('Não foi possível consultar o sistema.');
        for (const s of (data as Sistema[]) ?? []) sis.set(s.nf, s);
      }
      const fora = rows.filter(r => String(r['OTD']).toUpperCase() === 'FORA DO PRAZO');
      const res = fora.map(r => classificar(r, sis.get(nfNumero(r['Nota Fiscal']))));
      const out = new ExcelJS.Workbook();
      const base = ['Nota Fiscal', 'Nome Cliente', 'Tipo de entrega', 'Data Criacao NFe', 'Data Prevista de Entrega', 'Data de Saída ou Entrega', 'Houve perda de agenda?', 'Ocorrência atrasou o recebimento?', 'Análise CS'];
      const extra = ['Remessa', 'Doc. Transporte', 'Data de Abertura Ocorrência'];
      const s1 = out.addWorksheet('Resumo');
      s1.addRow(['Cenário', 'No prazo', 'Medidas', 'OTD %']);
      resumo(rows, res.map(r => r.classe)).forEach(c => s1.addRow([c.cenario, c.noPrazo, c.medidas, c.otd]));
      s1.getColumn(4).numFmt = '0.0%'; s1.getColumn(1).width = 50;
      const s2 = out.addWorksheet('Fora do prazo');
      s2.addRow([...base, 'Agenda (sistema)', 'Entrega (sistema)', 'Justificativa Ebenezer', 'Classificação', 'Justificativa da nota', ...extra, 'Observações']);
      fora.forEach((r, i) => {
        const s = sis.get(nfNumero(r['Nota Fiscal']));
        const row = s2.addRow([...base.map(h => r[h] ?? null), dia(s?.agenda_data), dia(s?.entrega_data), res[i].justificativa, res[i].classe, res[i].nota, ...extra.map(h => r[h] ?? null), '']);
        if (res[i].classe === 'ATRASO RECONHECIDO') row.font = { color: { argb: 'FFC00000' }, bold: true };
      });
      const s3 = out.addWorksheet('Entregues em aberto');
      s3.addRow([...base, 'Entrega (sistema)', 'Justificativa Ebenezer', ...extra, 'Observações']);
      rows.filter(r => !r['Data de Saída ou Entrega']).forEach(r => {
        const s = sis.get(nfNumero(r['Nota Fiscal']));
        if (s?.entrega_data) s3.addRow([...base.map(h => r[h] ?? null), dia(s.entrega_data), 'ENTREGUE no sistema - consta em aberto no relatório', ...extra.map(h => r[h] ?? null), '']);
      });
      for (const s of [s2, s3]) { s.getRow(1).font = { bold: true }; s.columns.forEach(c => (c.width = 18)); s.eachRow(r => r.eachCell(c => { if (c.value instanceof Date) c.numFmt = 'dd/mm/yyyy'; })); }
      const blob = new Blob([await out.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `Conferencia_OTD_Bauducco_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`; a.click(); URL.revokeObjectURL(a.href);
      toast.success(`Conferência pronta: ${fora.length} fora do prazo, ${s3.rowCount - 1} entregues em aberto.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível conferir a planilha'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  return <>
    <input ref={input} type="file" accept=".xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void processar(f); }} />
    <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}><FileSpreadsheet />{busy ? 'Conferindo…' : 'Conferir OTD Bauducco'}</Button>
  </>;
}
