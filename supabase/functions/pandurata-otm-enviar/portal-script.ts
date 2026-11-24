import { compararFrota, type Frota } from './frota.ts';

// Runs only in the authenticated OTM origin. No SAP action, bulk update or document emission.
async function executar(dados: Frota, permitirGravar: boolean, comparar: typeof compararFrota) {
  const out = (obj: unknown) => {
    const pre = document.createElement('pre'); pre.id = 'lovenvio'; pre.textContent = JSON.stringify(obj);
    document.body.replaceChildren(pre);
  };
  const pause = () => new Promise((r) => setTimeout(r, 150));
  const until = async <T>(f: () => T | null | undefined | false): Promise<T> => {
    const end = Date.now() + 12000;
    while (Date.now() < end) { const v = f(); if (v) return v; await pause(); }
    throw new Error('tempo_portal');
  };
  const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
  const pesquisar = async () => {
    const iframe = document.createElement('iframe'); iframe.width = '1200'; iframe.height = '700';
    iframe.src = '/GC3/glog.webserver.finder.FinderServlet?bcKey=new&query_name=glog.server.query.shipment.BuyShipmentQuery&finder_set_gid=BAU.BAU_SERVPROV_FLEET';
    document.body.append(iframe);
    const doc = await until(() => iframe.contentDocument?.querySelector<HTMLFormElement>('form[name=search]')?.ownerDocument);
    const input = doc.querySelector<HTMLInputElement>('input[name=srShipmentRefnumValue88]');
    const op = doc.querySelector<HTMLSelectElement>('select[name=srShipmentRefnumValue88_operator]');
    const form = doc.querySelector<HTMLFormElement>('form[name=search]');
    if (!input || !op || !form) throw new Error('pesquisa_indisponivel');
    input.value = dados.numero_dt;
    const equal = [...op.options].find((v) => v.textContent?.trim() === 'Igual a');
    if (!equal) throw new Error('operador_pesquisa');
    op.value = equal.value;
    const action = form.elements.namedItem('finder_action') as HTMLInputElement | null;
    const searching = form.elements.namedItem('searching') as HTMLInputElement | null;
    if (!action || !searching) throw new Error('formulario_pesquisa');
    action.value = 'search'; searching.value = 'true';
    form.action = form.action.replace('FinderServlet', 'ResultServlet'); form.submit();
    const result = await until(() => iframe.contentDocument !== doc && iframe.contentDocument?.querySelector('div.sgBodyRow[pk]') ? iframe.contentDocument : null);
    const keys = [...new Set([...result.querySelectorAll('div.sgBodyRow[pk]')].map((r) => r.getAttribute('pk')))];
    if (keys.length !== 1 || keys[0] !== dados.shipment_id) throw new Error('identificacao_divergente');
    const cols = [...result.querySelectorAll('div.sgBodyRow[pk]')].flatMap((r) => [...r.querySelectorAll(':scope > .sgBodyCol')].map((c) => norm(c.getAttribute('title') ?? c.textContent)));
    if (cols[3] !== dados.shipment_id || cols[7].replace(/^0+/, '') !== dados.numero_dt.replace(/^0+/, '')) throw new Error('identificacao_divergente');
    return { iframe, result, cols };
  };
  let gravou = false;
  try {
    const { iframe, result, cols } = await pesquisar();
    const valores = [dados.motorista, dados.cpf_motorista, dados.placa, dados.placa_carreta];
    const decisao = comparar(cols.slice(10, 14), valores);
    if (decisao === 'igual') { out({ ok: true, ja_conferido: true, status_portal: cols[5], gravou: false }); return; }
    if (!permitirGravar) { out({ ok: false, codigo: 'nao_confirmado', gravou: false }); return; }
    if (decisao === 'conflito' || cols[5] !== 'SH_ACEITO') { out({ ok: false, codigo: 'frota_divergente', gravou: false }); return; }
    const suffixes = ['NOME_MOTORISTA', 'CPF_MOTORISTA', 'PLACA_VEICULO', 'PLACA_CARRETA'];
    for (let i = 0; i < 4; i++) {
      if (cols[10 + i]) continue;
      const suffix = suffixes[i];
      const editor = result.getElementById(`rgSGSec.2.2.1.${7 + i}.u`);
      if (!editor?.parentElement || !iframe.contentWindow) throw new Error('editor_indisponivel');
      editor.parentElement.dispatchEvent(new (iframe.contentWindow as unknown as { MouseEvent: typeof MouseEvent }).MouseEvent('dblclick', { bubbles: true }));
      const field = await until(() => {
        const e = result.querySelector<HTMLInputElement>(`input[name=rgsrShipmentRefnumValue_RFN_SHP_${suffix}TextEditControl]`);
        return e && e.getBoundingClientRect().width > 0 ? e : null;
      });
      field.value = valores[i]; field.dispatchEvent(new Event('change', { bubbles: true }));
      const ok = result.getElementById(`resultsPage:srShipmentRefnumValue_RFN_SHP_${suffix}PopupDialog::ok`);
      if (!ok) throw new Error('editor_indisponivel');
      ok.click(); await pause();
    }
    const save = result.getElementById('rgSaveImg');
    if (!save) throw new Error('salvar_indisponivel');
    gravou = true; save.click();
    await new Promise((r) => setTimeout(r, 4500));
    const leitura = await pesquisar();
    const confirmado = comparar(leitura.cols.slice(10, 14), valores) === 'igual';
    out({ ok: confirmado, codigo: confirmado ? undefined : 'nao_confirmado', status_portal: leitura.cols[5], gravou });
  } catch { out({ ok: false, codigo: 'consulta_incompleta', gravou }); }
}

export function montarScriptEnvio(dados: Frota, permitirGravar: boolean) {
  // Return immediately to the remote action runner; the following selector wait
  // observes completion. Awaiting this promise adds to the runner's action budget.
  return `void (${executar.toString()})(${JSON.stringify(dados)},${permitirGravar},${compararFrota.toString()});`;
}