// In-page script executed inside the logged-in OTM session (read-only GETs and finder searches).
// It never submits management forms; only the "Dados de Frota" finder search and shipment view pages.
export function montarScriptOtm(conhecidos: string[], maxDetalhes: number): string {
  const known = JSON.stringify(conhecidos);
  return `(() => {
  const KNOWN = new Set(${known});
  const MAX = ${Math.max(0, Math.min(50, Math.floor(maxDetalhes)))};
  const out = (obj) => { const pre = document.createElement('pre'); pre.id = 'lovout'; pre.textContent = JSON.stringify(obj); document.body.innerHTML = ''; document.body.appendChild(pre); };
  const norm = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
  const dtKey = (dt) => String(dt || '').replace(/\\D/g, '').replace(/^0+/, '');
  (async () => {
    try {
      const F = '/GC3/glog.webserver.finder.FinderServlet?bcKey=new&query_name=glog.server.query.shipment.BuyShipmentQuery&finder_set_gid=BAU.BAU_SERVPROV_FLEET';
      const fh = await (await fetch(F, { credentials: 'include' })).text();
      const fdoc = new DOMParser().parseFromString(fh, 'text/html');
      const form = fdoc.querySelector('form[name=search]');
      if (!form) { out({ ok: false, erro: 'login_ou_tela_indisponivel' }); return; }
      const fd = new URLSearchParams();
      for (const el of form.elements) { if (!el.name) continue; if ((el.type === 'radio' || el.type === 'checkbox') && !el.checked) continue; fd.append(el.name, el.value); }
      fd.set('finder_action', 'search'); fd.set('searching', 'true');
      const act = form.getAttribute('action').replace('FinderServlet', 'ResultServlet');
      const rh = await (await fetch(act, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: fd.toString() })).text();
      let rdoc = new DOMParser().parseFromString(rh, 'text/html');
      // Portal returns only the first 100 rows: re-request the result sorted by trip start, newest first.
      let ordenado = 'nao';
      try {
        const rf = rdoc.querySelector('form[name=result]');
        if (rf && false) {
          const q = new URLSearchParams();
          for (const el of rf.elements) { if (el.name && !((el.type === 'radio' || el.type === 'checkbox') && !el.checked)) q.append(el.name, el.value); }
          q.set('sort_col1', 'shipment.start_time'); q.set('sort_col1_ascend', 'false');
          const sh = await (await fetch(rf.getAttribute('action').replace(/&amp;/g, '&'), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: q.toString() })).text();
          const sd = new DOMParser().parseFromString(sh, 'text/html');
          if (sd.querySelector('div.sgBodyRow[pk]')) { rdoc = sd; ordenado = 'sim'; }
        }
      } catch (e) { ordenado = 'erro'; }
      const total = Number((rdoc.body.textContent.match(/Total Encontrado:\\s*(\\d+)/) || [])[1] || 0);
      const m = {};
      rdoc.querySelectorAll('div.sgBodyRow[pk]').forEach((r) => { const k = r.getAttribute('pk'); m[k] = (m[k] || []).concat([...r.querySelectorAll(':scope > .sgBodyCol')].map((c) => norm(c.getAttribute('title') ?? c.textContent))); });
      const lista = Object.keys(m).map((pk) => { const c = m[pk]; return { shipment_id: c[3] || pk, status_tender: c[5], status_agendamento: c[6], numero_dt: c[7], inicio_viagem: c[8], fim_viagem: c[9], motorista: c[10], cpf_motorista: c[11], placa_cavalo: c[12], placa_carreta: c[13], tipo_equipamento: c[17], tipo_carga: c[18], qtd_pallets: c[19], qtd_caixas: c[20], cliente: c[21], cidade_destino: c[22], uf_destino: c[23], obs_recusa: c[24], valor_mercadoria: c[25], num_paradas: c[26] }; });
      const semVeiculo = lista.filter((l) => !l.placa_cavalo && !l.placa_carreta && !l.motorista);
      const diag = {}; lista.forEach((l) => { const k = (l.status_tender || '-') + (l.placa_cavalo ? ' | com placa' : ' | sem placa'); diag[k] = (diag[k] || 0) + 1; });
      const novas = semVeiculo.filter((l) => !KNOWN.has(l.shipment_id) && !KNOWN.has('DT:' + dtKey(l.numero_dt)));
      const detalhes = [];
      for (const l of novas.slice(0, MAX)) {
        try {
          const u = '/GC3/ShipmentCustManagement?manager_layout_gid=SHIPMENT_VIEW&query_name=glog.server.query.shipment.BuyShipmentQuery&finder_set_gid=BAU.BAU_SERVPROV_FLEET&pk=' + encodeURIComponent(l.shipment_id);
          const h = await (await fetch(u, { credentials: 'include' })).text();
          const d = new DOMParser().parseFromString(h, 'text/html');
          const t = norm(d.body.textContent);
          const g = (lb) => { const mm = t.match(new RegExp(lb + '\\\\s*([\\\\d.,]+)')); return mm ? mm[1] : null; };
          const remessas = [...new Set([...h.matchAll(/BAU\\.(\\d{9})\\b/g)].map((x) => x[1]))];
          const paradas = []; const vistos = new Set();
          d.querySelectorAll('tr').forEach((tr) => { const c = [...tr.children].map((x) => norm(x.textContent)); const i = c.findIndex((x) => x === 'P' || x === 'D'); if (i > 0 && /^\\d+$/.test(c[i - 1]) && c.some((x) => /\\d{2}\\/\\d{2}\\/\\d{4} \\d{2}:\\d{2}/.test(x)) && !vistos.has(c[i - 1])) { vistos.add(c[i - 1]); const datas = c.filter((x) => /\\d{2}\\/\\d{2}\\/\\d{4} \\d{2}:\\d{2}/.test(x)); paradas.push({ seq: Number(c[i - 1]), tipo: c[i] === 'P' ? 'COLETA' : 'ENTREGA', local: c[i + 1] || '', nome: c[i + 2] || '', chegada: datas[0] || null, partida: datas[1] || null, distancia: c.find((x) => /KM$/.test(x)) || null }); } });
          detalhes.push({ shipment_id: l.shipment_id, remessa_id: (t.match(/ID da Remessa\\s*(\\d+)/) || [])[1] || null, peso_liquido: g('Peso Líquido Total'), volume_liquido: g('Volume Líquido Total'), peso_bruto: g('Peso Bruto Total'), volume_bruto: g('Volume Bruto Total'), custo_total: g('Custo de Transporte Total'), numero_ordens: (t.match(/Número de Ordens\\s*(\\d+)/) || [])[1] || null, remessas, paradas });
        } catch (e) { detalhes.push({ shipment_id: l.shipment_id, erro: String(e) }); }
      }
      out({ ok: true, ordenado, inicios: lista.slice(0, 3).map((l) => l.inicio_viagem), total: semVeiculo.length, total_portal: total, diag, lidas: lista.length, novas: novas.length, lista: novas.slice(0, MAX), detalhes, restantes: Math.max(0, novas.length - MAX) });
    } catch (e) { out({ ok: false, erro: String(e) }); }
  })();
})();`;
}
