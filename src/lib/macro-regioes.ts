/**
 * Mapeamento fixo de bairros do Rio de Janeiro para Macro Regiões (1–11).
 * Bairros não mapeados recebem macroRegiao = 99.
 */

const BAIRRO_MACRO_REGIAO: Record<string, number> = {
  // Macro Região 1
  "CIDADE NOVA": 1,
  "CENTRO": 1,
  "LAPA": 1,
  "GAMBOA": 1,
  "SAUDE": 1,
  "SAÚDE": 1,
  "SANTO CRISTO": 1,

  // Macro Região 2
  "COPACABANA": 2,
  "GAVEA": 2,
  "GÁVEA": 2,
  "LEBLON": 2,
  "IPANEMA": 2,
  "LEME": 2,
  "SAO CONRADO": 2,
  "SÃO CONRADO": 2,

  // Macro Região 3
  "CATETE": 3,
  "LARANJEIRAS": 3,
  "FLAMENGO": 3,
  "BOTAFOGO": 3,
  "GLORIA": 3,
  "GLÓRIA": 3,
  "HUMAITA": 3,
  "HUMAITÁ": 3,
  "URCA": 3,
  "JARDIM BOTANICO": 3,
  "JARDIM BOTÂNICO": 3,

  // Macro Região 4
  "PRACA DA BANDEIRA": 4,
  "PRAÇA DA BANDEIRA": 4,
  "SAO CRISTOVAO": 4,
  "SÃO CRISTÓVÃO": 4,
  "SÃO CRISTOVÃO": 4,
  "SAO CRISTÓVÃO": 4,
  "VILA ISABEL": 4,
  "GRAJAU": 4,
  "GRAJAÚ": 4,
  "TIJUCA": 4,
  "MARACANA": 4,
  "MARACANÃ": 4,
  "MEIER": 4,
  "MÉIER": 4,
  "JARDIM BANDEIRANTES": 4,
  "ANDARAI": 4,
  "ANDARAÍ": 4,
  "ENGENHO NOVO": 4,
  "ENGENHO DE DENTRO": 4,
  "RIO COMPRIDO": 4,

  // Macro Região 5
  "PORTUGUESA": 5,
  "ILHA": 5,
  "ILHA DO GOVERNADOR": 5,
  "JARDIM CARIOCA": 5,
  "BONSUCESSO": 5,
  "INHAUMA": 5,
  "INHAÚMA": 5,
  "IRAJA": 5,
  "IRAJÁ": 5,
  "PENHA": 5,
  "VILA DA PENHA": 5,
  "MANGUINHOS": 5,

  // Macro Região 6
  "MADUREIRA": 6,
  "CASCADURA": 6,
  "VILA VALQUEIRE": 6,
  "CAMPOS DOS AFONSOS": 6,
  "MARECHAL HERMES": 6,
  "HONORIO GURGEL": 6,
  "HONÓRIO GURGEL": 6,

  // Macro Região 7
  "PECHINCHA": 7,
  "FREGUESIA": 7,
  "ANIL": 7,

  // Macro Região 8
  "TAQUARA": 8,
  "TANQUE": 8,

  // Macro Região 9
  "JACAREPAGUA": 9,
  "JACAREPAGUÁ": 9,
  "CURICICA": 9,

  // Macro Região 10
  "BARRA DA TIJUCA": 10,
  "RECREIO DOS BANDEIRANTES": 10,
  "VARGEM GRANDE": 10,
  "PEDRA DE GUARATIBA": 10,

  // Macro Região 11
  "CAMPO GRANDE": 11,
  "REALENGO": 11,
  "BANGU": 11,
  "PADRE MIGUEL": 11,
  "SANTA CRUZ": 11,
  "KOSMOS": 11,
  "GUARATIBA": 11,
  "SENADOR CAMARA": 11,
  "SENADOR CAMARÁ": 11,
  "SANTISSIMO": 11,
  "SANTÍSSIMO": 11,
  "PACIENCIA": 11,
  "PACIÊNCIA": 11,
  "INHOAIBA": 11,
  "INHOAÍBA": 11,
};

/**
 * Normaliza o nome do bairro removendo acentos e convertendo para uppercase.
 */
function normalizeBairro(bairro: string): string {
  return bairro
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Retorna a macro região (1–11) para um bairro, ou 99 se não mapeado.
 */
export function getMacroRegiao(bairro: string | null | undefined): number {
  if (!bairro) return 99;

  const normalizado = normalizeBairro(bairro);

  // Tenta match direto no mapa (comparando normalizado)
  for (const [key, value] of Object.entries(BAIRRO_MACRO_REGIAO)) {
    if (normalizeBairro(key) === normalizado) {
      return value;
    }
  }

  return 99;
}

/**
 * Retorna o label descritivo da macro região.
 */
export function getMacroRegiaoLabel(macroRegiao: number): string {
  const labels: Record<number, string> = {
    1: "MR 1 – Centro / Cidade Nova / Lapa",
    2: "MR 2 – Copacabana / Leblon / Ipanema",
    3: "MR 3 – Catete / Flamengo / Botafogo",
    4: "MR 4 – Tijuca / Méier / Vila Isabel",
    5: "MR 5 – Penha / Ilha / Bonsucesso",
    6: "MR 6 – Madureira / Cascadura",
    7: "MR 7 – Pechincha / Freguesia / Anil",
    8: "MR 8 – Taquara / Tanque",
    9: "MR 9 – Jacarepaguá / Curicica",
    10: "MR 10 – Barra / Recreio",
    11: "MR 11 – Campo Grande / Bangu / Santa Cruz",
    99: "MR 99 – Não mapeado",
  };
  return labels[macroRegiao] || `MR ${macroRegiao}`;
}

/**
 * Retorna todas as macro regiões disponíveis (para filtros).
 */
export function getAllMacroRegioes(): { value: number; label: string }[] {
  return [
    { value: 1, label: getMacroRegiaoLabel(1) },
    { value: 2, label: getMacroRegiaoLabel(2) },
    { value: 3, label: getMacroRegiaoLabel(3) },
    { value: 4, label: getMacroRegiaoLabel(4) },
    { value: 5, label: getMacroRegiaoLabel(5) },
    { value: 6, label: getMacroRegiaoLabel(6) },
    { value: 7, label: getMacroRegiaoLabel(7) },
    { value: 8, label: getMacroRegiaoLabel(8) },
    { value: 9, label: getMacroRegiaoLabel(9) },
    { value: 10, label: getMacroRegiaoLabel(10) },
    { value: 11, label: getMacroRegiaoLabel(11) },
    { value: 99, label: getMacroRegiaoLabel(99) },
  ];
}
