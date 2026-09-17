// Embarcadores do grupo Cacau Show atendidos com as MESMAS regras operacionais:
// conferência interna em duas etapas (dupla bipagem na etapa 1), escopo de
// conferência por placa, transmissão de status de entrega e de canhoto à IBAC,
// e m³ nunca lido do XML (entra por planilha/NOTFIS).
//
//  - IBAC INDUSTRIA BRASILEIRA DE ALIMENTOS E CHOCOLATES LTDA  (raiz 61472205)
//  - IBAE INDUSTRIA BRASILEIRA DE ALIMENTOS ESPECIAIS LTDA     (raiz 42431457, Linhares/ES)
export const CACAU_EMITENTE_RAIZES = ["61472205", "42431457"] as const;

/** Regex de nome/marca dos emitentes do grupo (IBAC / IBAE). */
export const CACAU_EMITENTE_REGEX = /\biba[ce]\b/i;

/** true quando o CNPJ (formatado ou não) pertence a um emitente do grupo. */
export function isEmitenteCacau(cnpj?: string | null): boolean {
  const raiz = String(cnpj ?? "").replace(/\D/g, "").slice(0, 8);
  return raiz.length === 8 && (CACAU_EMITENTE_RAIZES as readonly string[]).includes(raiz);
}
