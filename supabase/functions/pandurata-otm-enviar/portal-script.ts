import { autorizarEnvioSap, compararFrota, confirmarResultadoSap, type Frota } from './frota.ts';
import { interpretarRespostaSap } from './sap-resposta.ts';

// Runs only in the authenticated OTM origin and only for the explicitly confirmed shipment.
async function executar(dados: Frota, permitirGravar: boolean, comparar: typeof compararFrota, autorizarSap: typeof autorizarEnvioSap, confirmarSap: typeof confirmarResultadoSap, interpretarSap: typeof interpretarRespostaSap) {
  const out = (obj: unknown) => {
    const pre = document.createElement('pre'); pre.id = 'lovenvio'; pre.textContent = JSON.stringify(obj);
    document.body.replaceChildren(pre);
  };
  const pause = (ms = 150) => new Promise((r) => setTimeout(r, ms));
  let etapa = 'abrir_consulta';
  const until = async <T>(f: () => T | null | undefined | false): Promise<T> => {
    const end = Date.now() + 30000;
    while (Date.now() < end) { const v = f(); if (v) return v; await pause(); }
    throw new Error(`tempo_${etapa}`);
  };
  const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
  const pesquisar = async (consultaSalva?: string) => {
    etapa = consultaSalva ? 'abrir_consulta_sap' : 'abrir_consulta_frota';
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
      const queryName = form.elements.namedItem('saved_query_name') as HTMLInputElement | null;
      const ignoreRequest = form.elements.namedItem('ignore_request') as HTMLInputElement | null;
      if (!queryName || !ignoreRequest) throw new Error('consulta_sap_indisponivel');
      queryName.value = option.value;
      ignoreRequest.value = 'N';
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
    etapa = consultaSalva ? 'resultado_sap' : 'resultado_frota';
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
  const restaurarJanelas: Array<() => void> = [];
  const verificarSap = async () => {
    const enviado = await pesquisar('SHIPMENTS ENVIADOS SAP');
    const semEnvio = await pesquisar('SHIPMENTS SEM ENVIO SAP');
    return confirmarSap(enviado.cols.length > 0, semEnvio.cols.length > 0);
  };
  try {
    let leitura = await pesquisar();
    const valores = [dados.motorista, dados.cpf_motorista, dados.placa, dados.placa_carreta];
    const decisao = comparar(leitura.cols.slice(10, 14), valores);
    if (decisao !== 'igual') {
      if (!permitirGravar) {
        // Read the trailer editor's limit without typing, confirming or saving anything.
        const editor = leitura.result.getElementById('rgSGSec.2.2.1.10.u');
        if (!editor?.parentElement || !leitura.iframe.contentWindow) throw new Error('editor_indisponivel');
        editor.parentElement.dispatchEvent(new (leitura.iframe.contentWindow as unknown as { MouseEvent: typeof MouseEvent }).MouseEvent('dblclick', { bubbles: true }));
        const field = await until(() => {
          const e = leitura.result.querySelector<HTMLInputElement>('input[name=rgsrShipmentRefnumValue_RFN_SHP_PLACA_CARRETATextEditControl]');
          return e && e.getBoundingClientRect().width > 0 ? e : null;
        });
        out({ ok: false, codigo: 'nao_confirmado', status_portal: leitura.cols[5], campos: leitura.cols.slice(10, 14).map((v, i) => !v ? 'vazio' : comparar([v], [valores[i]]) === 'igual' ? 'igual' : 'diferente'), limite_carreta: field.maxLength, gravou: false, sap_acionado: false });
        return;
      }
      if (decisao === 'conflito' || leitura.cols[5] !== 'SH_ACEITO') { out({ ok: false, codigo: 'frota_divergente', gravou: false, sap_acionado: false }); return; }
      const suffixes = ['NOME_MOTORISTA', 'CPF_MOTORISTA', 'PLACA_VEICULO', 'PLACA_CARRETA'];
      for (let i = 0; i < 4; i++) {
        etapa = `editar_frota_${i}`;
        if (leitura.cols[10 + i]) continue;
        const suffix = suffixes[i];
        const current = leitura.iframe.contentDocument;
        const editor = current?.getElementById(`rgSGSec.2.2.1.${7 + i}.u`);
        if (!editor?.parentElement || !leitura.iframe.contentWindow) throw new Error('editor_indisponivel');
        editor.parentElement.dispatchEvent(new (leitura.iframe.contentWindow as unknown as { MouseEvent: typeof MouseEvent }).MouseEvent('dblclick', { bubbles: true }));
        const field = await until(() => {
          const e = leitura.iframe.contentDocument?.querySelector<HTMLInputElement>(`input[name=rgsrShipmentRefnumValue_RFN_SHP_${suffix}TextEditControl]`);
          return e && e.getBoundingClientRect().width > 0 ? e : null;
        });
        if (field.maxLength >= 0 && field.maxLength < valores[i].length) throw new Error('campo_portal_curto');
        field.value = valores[i]; field.dispatchEvent(new Event('change', { bubbles: true }));
        const ok = leitura.iframe.contentDocument?.getElementById(`resultsPage:srShipmentRefnumValue_RFN_SHP_${suffix}PopupDialog::ok`);
        if (!ok) throw new Error('editor_indisponivel');
        ok.click();
        // The portal refreshes the result document after each field. Wait for the
        // popup to close and always read the next editor from the current document.
        await until(() => {
          const e = leitura.iframe.contentDocument?.querySelector<HTMLInputElement>(`input[name=rgsrShipmentRefnumValue_RFN_SHP_${suffix}TextEditControl]`);
          return !e || e.getBoundingClientRect().width === 0 ? true : null;
        });
        await pause(500);
      }
      const save = leitura.iframe.contentDocument?.getElementById('rgSaveImg');
      if (!save) throw new Error('salvar_indisponivel');
      gravou = true; save.click();
      await pause(4500);
      leitura = await pesquisar();
      if (comparar(leitura.cols.slice(10, 14), valores) !== 'igual') {
        out({ ok: false, codigo: 'nao_confirmado', status_portal: leitura.cols[5], gravou, sap_acionado: false }); return;
      }
    }

    if (!autorizarSap(permitirGravar, true)) {
      const sap = await verificarSap();
      out({ ok: sap === 'confirmado', codigo: sap === 'ambiguo' ? 'sap_ambiguo' : sap === 'confirmado' ? undefined : 'sap_nao_confirmado', status_portal: leitura.cols[5], gravou: false, sap_acionado: false });
      return;
    }

    const selected = [...leitura.result.querySelectorAll<HTMLInputElement>('input[name=Selected]')];
    if (selected.length !== 1 || selected[0].value !== dados.shipment_id) throw new Error('identificacao_divergente');
    if (!selected[0].checked) selected[0].click();
    const actions = [...leitura.result.querySelectorAll<HTMLButtonElement>('button')].find((b) => norm(b.textContent) === 'Ações');
    if (!actions) throw new Error('acoes_indisponiveis');
    actions.click();
    etapa = 'acao_sap';
    // The action tree opens in a nested frame of the result page, not in the result document itself.
    const documentos = (w: Window, depth = 0): Document[] => {
      if (depth > 6) return [];
      try {
        const lista = [w.document];
        for (let i = 0; i < w.frames.length; i++) lista.push(...documentos(w.frames[i], depth + 1));
        return lista;
      } catch { return []; }
    };
    const sapAction = await until(() => {
      const janela = leitura.iframe.contentWindow;
      if (!janela) return null;
      const links = documentos(janela).flatMap((d) => [...d.querySelectorAll<HTMLAnchorElement>('a')]).filter((a) => norm(a.textContent).toLocaleUpperCase('pt-BR') === 'ENVIO FROTA SAP' && a.getBoundingClientRect().width > 0);
      if (links.length > 1) throw new Error('acao_sap_duplicada');
      return links[0] ?? null;
    });
    // OTM acknowledges this action in a separate same-origin window/frameset.
    // Capture only windows opened by this selected shipment's single action.
    const janelasSap: Window[] = [];
    const origem = window.location.origin;
    const visited = new Set<Window>();
    const observar = (w: Window) => {
      if (visited.has(w)) return;
      visited.add(w);
      const original = w.open;
      // OTM submits the action form into a named popup; headless browsers block popups,
      // so open that named target as a same-origin frame and read its response there.
      w.open = function (...args: Parameters<Window['open']>) {
        const alvo = w.document.createElement('iframe');
        alvo.name = String(args[1] ?? ''); alvo.width = '1000'; alvo.height = '600';
        alvo.src = args[0] ? String(args[0]) : 'about:blank';
        w.document.body.append(alvo);
        const popup = alvo.contentWindow;
        if (popup) janelasSap.push(popup);
        return popup;
      };
      restaurarJanelas.push(() => { w.open = original; });
      try {
        for (let i = 0; i < w.frames.length; i++) observar(w.frames[i]);
      } catch { /* only same-origin frames are accessible */ }
    };
    observar(window);
    const respostaJanela = (w: Window, depth = 0): ReturnType<typeof interpretarSap> => {
      if (depth > 8 || w.closed) return 'pendente';
      try {
        if (w.location.origin !== origem) return 'pendente';
        const resposta = interpretarSap(w.document.body?.innerText ?? '');
        if (resposta !== 'pendente') return resposta;
        for (let i = 0; i < w.frames.length; i++) {
          const nested = respostaJanela(w.frames[i], depth + 1);
          if (nested !== 'pendente') return nested;
        }
      } catch { /* wait for the same-origin response to load */ }
      return 'pendente';
    };
    sapAcionado = true; sapAction.click();
    etapa = 'resposta_acao_sap';
    const resposta = await until(() => {
      for (const popup of janelasSap) {
        const value = respostaJanela(popup);
        if (value !== 'pendente') return value;
      }
      // Fallback: OTM may render the acknowledgement in another same-origin frame.
      const geral = respostaJanela(window);
      return geral !== 'pendente' ? geral : null;
    });
    out({ ok: resposta === 'requisitado', codigo: resposta === 'requisitado' ? 'sap_requisitado' : 'sap_erro_processo', status_portal: leitura.cols[5], gravou, sap_acionado: sapAcionado });
  } catch (e) { const m = e instanceof Error ? e.message : ''; out({ ok: false, codigo: 'consulta_incompleta', etapa: /^[a-z_]{3,40}$/.test(m) ? m : 'erro_script', gravou, sap_acionado: sapAcionado }); }
  finally { for (const restore of restaurarJanelas.reverse()) restore(); }
}

export function montarScriptEnvio(dados: Frota, permitirGravar: boolean) {
  // Return immediately to the remote action runner; the following selector wait
  // observes completion. Awaiting this promise adds to the runner's action budget.
  return `void (${executar.toString()})(${JSON.stringify(dados)},${permitirGravar},${compararFrota.toString()},${autorizarEnvioSap.toString()},${confirmarResultadoSap.toString()},${interpretarRespostaSap.toString()});`;
}
