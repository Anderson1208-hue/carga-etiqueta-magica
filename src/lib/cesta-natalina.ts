// Cesta natalina: a NF traz o item "Embalagem Cesta" seguido dos produtos que vão
// DENTRO da cesta. Para conferência, só a cesta conta; os componentes não são caixas.
// A quantidade de caixas é o total de volumes da NF (<transp><vol><qVol>), ex.: NF 766962 = 25 cx.
// Regra (Anderson 16/10/2026): toda NF de cesta traz "Emb./Embalagem Cesta"; um tipo de cesta por NF.
export const CESTA_REGEX = /\b(emb\.?|embalagem)\s*cesta\b/i;

export function isNfCesta(xProds: (string | null | undefined)[]): boolean {
  return xProds.some((x) => CESTA_REGEX.test(String(x ?? "")));
}

export function itensConferencia<T>(itens: T[], getXProd: (i: T) => string | null | undefined): T[] {
  const cestas = itens.filter((i) => CESTA_REGEX.test(String(getXProd(i) ?? "")));
  return cestas.length > 0 ? cestas.slice(0, 1) : itens;
}

/** Itens da Nota de Carga: em NF de cesta vira 1 linha com o total de caixas da NF. */
export function itensNotaDeCarga<T>(
  itens: T[],
  getXProd: (i: T) => string | null | undefined,
  getQtd: (i: T) => number,
  qtdVolumes: number | null | undefined,
): { item: T; qtdCaixas: number }[] {
  const lista = itensConferencia(itens, getXProd);
  const cesta = lista.length === 1 && CESTA_REGEX.test(String(getXProd(lista[0]) ?? ""));
  return lista.map((item) => ({
    item,
    qtdCaixas: cesta && qtdVolumes && qtdVolumes > 0 ? qtdVolumes : getQtd(item),
  }));
}

/** Soma de <qVol> do XML. */
export function extrairQtdVolumes(xmlDoc: Document): number {
  let total = 0;
  Array.from(xmlDoc.getElementsByTagNameNS("*", "qVol")).forEach((n) => {
    const v = parseInt((n.textContent || "").trim(), 10);
    if (Number.isFinite(v) && v > 0) total += v;
  });
  return total;
}
