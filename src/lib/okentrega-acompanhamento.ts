export function compararNfsCrescente(a: { numero_nf?: string | null }, b: { numero_nf?: string | null }) {
  return String(a.numero_nf ?? "").replace(/\D/g, "").localeCompare(
    String(b.numero_nf ?? "").replace(/\D/g, ""), "pt-BR", { numeric: true },
  );
}