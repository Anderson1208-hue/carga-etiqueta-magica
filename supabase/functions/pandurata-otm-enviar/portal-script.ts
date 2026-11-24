import { autorizarEnvioSap, compararFrota, type Frota } from './frota.ts';

// Runs only in the authenticated OTM origin and only for the explicitly confirmed shipment.
async function executar(dados: Frota, permitirGravar: boolean, comparar: typeof compararFrota, autorizarSap: typeof autorizarEnvioSap) {
  const out = (obj: unknown) => {
    const pre = document.createElement('pre'); pre.id = 'lovenvio'; pre.textContent = JSON.stringify(obj);
    document.body.replaceChildren(pre);
  };
  const pause = (ms = 150) => new Promise((r) => setTimeout(r, ms));
  const until = async <T>(f: () => T | null | undefined | false): Promise<T> => {
    const end = Date.now() + 12000;
    while (Date.now() < end) { const v = f(); if (v) return v; await pause(); }
    throw new Error('tempo_portal');
  };
  const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
  const pesquisar = async (consultaSalva?: string) => {
    const iframe = document.createElement('iframe'); iframe.width = '1200'; iframe.height = '700';
    iframe.src = '/GC3/glog.webserver.finder.FinderServlet?bcKey=new&query_name=glog.server.query.shipment.BuyShipmentQuery&finder_set_gid=BAU.BAU_SERVPROV_FLEET';
    document.body.append(iframe);
    const doc = await until(() => iframe.contentDocument?.querySelector<HTMLFormElement>('form[name=search]')?.ownerDocument);
    const input = doc.querySelector<HTMLInputElement>('input[name=srShipmentRefnumValue88]');
    const op = doc.querySelector<HTMLSelectElement>('select[name=srShipmentRefnumValue88_operator]');
    const form = doc.querySelector<HTMLFormElement>('form[name=search]');
    if (!input || !op || !form) throw new Error('pesquisa_indisponivel');
    if (consultaSalva) {
      const saved = doc.querySelector<HTMLSelectElement>('select[name=temp_saved_query_name]');
      const option = saved && [...saved.options].find((v) => v.textContent?.trim() === consultaSalva);
      if (!saved || !option) throw new Error('consulta_sap_indisponivel');
      saved.value = option.value;
      saved.dispatchEvent(new Event('change', { bubbles: true }));
    }
    input.value = dados.numero_dt;
    const equal = [...op.options].find((v) => v.textContent?.trim() === 'Igual a');
    if (!equal) throw new Error('operador_pesquisa');
    op.value = equal.value;
    op.dispatchEvent(new Event('change', { bubbles: true }));
    const action = form.elements.namedItem('finder_action') as HTMLInputElement | null;
    const searching = form.elements.namedItem('searching') as HTMLInputElement | null;
    if (!action || !searching) throw new Error('formulario_pesquisa');
    action.value = 'search'; searching.value = 'true';
    form.action = form.action.replace('FinderServlet', 'ResultServlet'); form.submit();
    const result = await until(() => {
      const current = iframe.contentDocument;
      return current !== doc && current?.querySelector('form[name=result]') ? current : null;
    });
    const keys = [...new Set([...result.querySelectorAll('div.sgBodyRow[pk]')].map((r) => r.getAttribute('pk')))];
    if (keys.length === 0) return { iframe, result, cols: [] as string[] };
    if (keys.length !== 1 || keys[0] !== dados.shipment_id) throw new Error('identificacao_divergente');
    const cols = [...result.querySelectorAll('div.sgBodyRow[pk]')].flatMap((r) => [...r.querySelectorAll(':scope > .sgBodyCol')].map((c) => norm(c.getAttribute('title') ?? c.textContent)));
    if (cols[3] !== dados.shipment_id || cols[7].replace(/^0+/, '') !== dados.numero_dt.replace(/^0+/, '')) throw new Error('identificacao_divergente');
    return { iframe, result, cols };
  };
  let gravou = false;
  let sapAcionado = false;
  try {
    let leitura = await pesquisar();
    const valores = [dados.motorista, dados.cpf_motorista, dados.placa, dados.placa_carreta];
    const decisao = comparar(leitura.cols.slice(10, 14), valores);
    if (decisao !== 'igual') {
      if (!permitirGravar) { out({ ok: false, codigo: 'nao_confirmado', gravou: false, sap_acionado: false }); return; }
      if (decisao === 'conflito' || leitura.cols[5] !== 'SH_ACEITO') { out({ ok: false, codigo: 'frota_divergente', gravou: false, sap_acionado: false }); return; }
      const suffixes = ['NOME_MOTORISTA', 'CPF_MOTORISTA', 'PLACA_VEICULO', 'PLACA_CARRETA'];
      for (let i = 0; i < 4; i++) {
        if (leitura.cols[10 + i]) continue;
        const suffix = suffixes[i];
        const editor = leitura.result.getElementById(`rgSGSec.2.2.1.${7 + i}.u`);
        if (!editor?.parentElement || !leitura.iframe.contentWindow) throw new Error('editor_indisponivel');
        editor.parentElement.dispatchEvent(new (leitura.iframe.contentWindow as unknown as { MouseEvent: typeof MouseEvent }).MouseEvent('dblclick', { bubbles: true }));
        const field = await until(() => {
          const e = leitura.result.querySelector<HTMLInputElement>(`input[name=rgsrShipmentRefnumValue_RFN_SHP_${suffix}TextEditControl]`);
          return e && e.getBoundingClientRect().width > 0 ? e : null;
        });
        field.value = valores[i]; field.dispatchEvent(new Event('change', { bubbles: true }));
        const ok = leitura.result.getElementById(`resultsPage:srShipmentRefnumValue_RFN_SHP_${suffix}PopupDialog::ok`);
        if (!ok) throw new Error('editor_indisponivel');
        ok.click(); await pause();
      }
      const save = leitura.result.getElementById('rgSaveImg');
      if (!save) throw new Error('salvar_indisponivel');
      gravou = true; save.click();
      await pause(4500);
      leitura = await pesquisar();
      if (comparar(leitura.cols.slice(10, 14), valores) !== 'igual') {
        out({ ok: false, codigo: 'nao_confirmado', status_portal: leitura.cols[5], gravou, sap_acionado: false }); return;
      }
    }

    if (!autorizarSap(permitirGravar, true)) {
      const sap = await pesquisar('SHIPMENTS ENVIADOS SAP');
      out({ ok: sap.cols.length > 0, codigo: sap.cols.length > 0 ? undefined : 'sap_nao_confirmado', status_portal: leitura.cols[5], gravou: false, sap_acionado: false });
      return;
    }

    const selected = [...leitura.result.querySelectorAll<HTMLInputElement>('input[name=Selected]')];
    if (selected.length !== 1 || selected[0].value !== dados.shipment_id) throw new Error('identificacao_divergente');
    if (!selected[0].checked) selected[0].click();
    const actions = [...leitura.result.querySelectorAll<HTMLButtonElement>('button')].find((b) => norm(b.textContent) === 'Ações');
    if (!actions) throw new Error('acoes_indisponiveis');
    actions.click();
    const sapAction = await until(() => [...leitura.result.querySelectorAll<HTMLAnchorElement>('a')].find((a) => norm(a.textContent).toLocaleUpperCase('pt-BR') === 'ENVIO FROTA SAP' && a.getBoundingClientRect().width > 0));
    sapAcionado = true; sapAction.click();
    await pause(8000);
    const sap = await pesquisar('SHIPMENTS ENVIADOS SAP');
    out({ ok: sap.cols.length > 0, codigo: sap.cols.length > 0 ? undefined : 'sap_nao_confirmado', status_portal: leitura.cols[5], gravou, sap_acionado: sapAcionado });
  } catch { out({ ok: false, codigo: 'consulta_incompleta', gravou, sap_acionado: sapAcionado }); }
}

export function montarScriptEnvio(dados: Frota, permitirGravar: boolean) {
  // Return immediately to the remote action runner; the following selector wait
  // observes completion. Awaiting this promise adds to the runner's action budget.
  return `void (${executar.toString()})(${JSON.stringify(dados)},${permitirGravar},${compararFrota.toString()},${autorizarEnvioSap.toString()});`;
}
