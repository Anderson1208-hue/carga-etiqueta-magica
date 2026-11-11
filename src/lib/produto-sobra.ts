import { embarcadorCliente } from "./divergencia-clientes";

export type ProdutoSobra = { id: string; codigo: string; codigo_alternativo: string | null; descricao: string; cnpj_embarcador: string | null };
export const normalizarCodigoSobra = (codigo: string) => codigo.trim().replace(/^0+(?=\d)/, "").toUpperCase();
export function produtosDaSobra(produtos: ProdutoSobra[], codigo: string, embarcador: string) {
  const busca = normalizarCodigoSobra(codigo);
  return produtos.filter((p) => {
    const raiz = (p.cnpj_embarcador ?? "").replace(/\D/g, "").slice(0, 8);
    const pertence = embarcador === "IBAC" ? raiz === "61472205" : embarcador === "IBAE" ? raiz === "42431457" : embarcadorCliente(p.cnpj_embarcador) === embarcador;
    return pertence && [p.codigo, p.codigo_alternativo ?? ""].some((c) => normalizarCodigoSobra(c) === busca);
  });
}