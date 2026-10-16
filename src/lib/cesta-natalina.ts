// Cesta natalina: a NF traz o item "Embalagem Cesta" seguido dos produtos que vão
// DENTRO da cesta. Para conferência, só a cesta conta; os componentes não são caixas.
// Regra (Anderson 16/10/2026): toda NF de cesta traz "Emb./Embalagem Cesta"; um tipo de cesta por NF.
export const CESTA_REGEX = /\b(emb\.?|embalagem)\s*cesta\b/i;

export function itensConferencia<T>(itens: T[], getXProd: (i: T) => string | null | undefined): T[] {
  const cestas = itens.filter((i) => CESTA_REGEX.test(String(getXProd(i) ?? "")));
  return cestas.length > 0 ? cestas : itens;
}
