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
  "CACHAMBI": 4,
  "BENFICA": 4,
  "VASCO DA GAMA": 4,

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
  "DEL CASTILHO": 5,
  "OLARIA": 5,
  "COELHO NETO": 5,
  "PENHA CIRCULAR": 5,

  // Macro Região 6
  "MADUREIRA": 6,
  "CASCADURA": 6,
  "VILA VALQUEIRE": 6,
  "CAMPOS DOS AFONSOS": 6,
  "CAMPO DOS AFONSOS": 6,
  "MARECHAL HERMES": 6,
  "HONORIO GURGEL": 6,
  "HONÓRIO GURGEL": 6,

  // Macro Região 7
  "PECHINCHA": 7,
  "FREGUESIA": 7,
  "FREGUESIA (JACAREPAGUA)": 7,
  "FREGUESIA (JACAREPAGUÁ)": 7,
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

  // Macro Região 12
  "BARRA DO PIRAI": 12,
  "BARRA DO PIRAÍ": 12,
  "BARRA MANSA": 12,
  "PIRAI": 12,
  "PIRAÍ": 12,
  "VOLTA REDONDA": 12,
  "RESENDE": 12,
  "ITATIAIA": 12,
  "PORTO REAL": 12,
  "QUATIS": 12,
  "PINHEIRAL": 12,

  // Macro Região 13
  "PIABETA": 13,
  "PIABETÁ": 13,
  "DUQUE DE CAXIAS": 13,

  // Macro Região 14
  "BELFORD ROXO": 14,
  "MESQUITA": 14,
  "NILOPOLIS": 14,
  "NILÓPOLIS": 14,
  "NOVA IGUACU": 14,
  "NOVA IGUAÇU": 14,
  "QUEIMADOS": 14,
  "SAO JOAO DE MERITI": 14,
  "SÃO JOÃO DE MERITI": 14,
  "SEROPEDICA": 14,
  "SEROPÉDICA": 14,

  // Macro Região 15
  "JAPERI": 15,
  "PARACAMBI": 15,
  "MENDES": 15,
  "MIGUEL PEREIRA": 15,
  "PATY DO ALFERES": 15,
  "VALENCA": 15,
  "VALENÇA": 15,
  "VASSOURAS": 15,

  // Macro Região 16
  "CACHOEIRAS DE MACACU": 16,
  "BOM JARDIM": 16,
  "CANTAGALO": 16,
  "CARMO": 16,
  "CORDEIRO": 16,
  "NOVA FRIBURGO": 16,
  "DUAS BARRAS": 16,
  "CONCEICAO DE MACABU": 16,
  "CONCEIÇÃO DE MACABU": 16,
  "TERESOPOLIS": 16,
  "TERESÓPOLIS": 16,
  "MAGE": 16,
  "MAGÉ": 16,
  "GUAPIMIRIM": 16,

  // Macro Região 17
  "AREAL": 17,
  "PARAIBA DO SUL": 17,
  "PARAÍBA DO SUL": 17,
  "SJV DO RIO PRETO": 17,
  "TRES RIOS": 17,
  "TRÊS RIOS": 17,
  "SAPUCAIA": 17,
  "PETROPOLIS": 17,
  "PETRÓPOLIS": 17,

  // Macro Região 18
  "ARARUAMA": 18,
  "ARMACAO DOS BUZIOS": 18,
  "ARMAÇÃO DOS BÚZIOS": 18,
  "ARRAIAL DO CABO": 18,
  "IGUABA GRANDE": 18,
  "INOA": 18,
  "INOÃ": 18,
  "SAQUAREMA": 18,
  "BARRA DE SAO JOAO": 18,
  "BARRA DE SÃO JOÃO": 18,
  "CABO FRIO": 18,
  "MARICA": 18,
  "MARICÁ": 18,
  "RIO DAS OSTRAS": 18,
  "SAO PEDRO DA ALDEIA": 18,
  "SÃO PEDRO D'ALDEIA": 18,
  "SÃO PEDRO DA ALDEIA": 18,

  // Macro Região 19
  "RIO BONITO": 19,
  "SILVA JARDIM": 19,
  "TANGUA": 19,
  "TANGUÁ": 19,
  "ITABORAI": 19,
  "ITABORAÍ": 19,
  "CASIMIRO DE ABREU": 19,
  "MACAE": 19,
  "MACAÉ": 19,

  // Macro Região 20
  "ANGRA DOS REIS": 20,
  "ITAGUAI": 20,
  "ITAGUAÍ": 20,
  "MANGARATIBA": 20,
  "PARATI": 20,
  "PARATY": 20,
  "RIO CLARO": 20,

  // Macro Região 21
  "SAO GONCALO": 21,
  "SÃO GONÇALO": 21,
  "NITEROI": 21,
  "NITERÓI": 21,

  // Macro Região 22
  "SAO FRANCISCO DO ITABAPOANA": 22,
  "SÃO FRANCISCO DO ITABAPOANA": 22,
  "CAMPOS DOS GOYTACAZES": 22,
  "SAO JOAO DA BARRA": 22,
  "SÃO JOÃO DA BARRA": 22,

  // Macro Região 23
  "APERIBE": 23,
  "COMENDADOR LEVY GASPARIAN": 23,
  "SANTO ANTONIO DE PADUA": 23,
  "SANTO ANTÔNIO DE PÁDUA": 23,
  "MIRACEMA": 23,
  "BOM JESUS DO ITABAPOANA": 23,
  "ITAOCARA": 23,
  "ITAPERUNA": 23,
  "NATIVIDADE": 23,
  "ITALVA": 23,
  "PORCIUNCULA": 23,
  "PORCIÚNCULA": 23,
  "SAO FIDELIS": 23,
  "SÃO FIDÉLIS": 23,
  "CAMBUCI": 23,
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
    12: "MR 12 – Barra do Piraí / Volta Redonda / Resende",
    13: "MR 13 – Duque de Caxias / Piabetá",
    14: "MR 14 – Belford Roxo / Nova Iguaçu / Meriti",
    15: "MR 15 – Japeri / Valença / Vassouras",
    16: "MR 16 – Nova Friburgo / Teresópolis / Magé",
    17: "MR 17 – Petrópolis / Três Rios / Areal",
    18: "MR 18 – Cabo Frio / Araruama / Búzios",
    19: "MR 19 – Rio Bonito / Itaboraí / Macaé",
    20: "MR 20 – Angra dos Reis / Itaguaí / Paraty",
    21: "MR 21 – São Gonçalo / Niterói",
    22: "MR 22 – Campos / S. F. Itabapoana",
    23: "MR 23 – Itaperuna / Miracema / Aperibé",
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
    { value: 12, label: getMacroRegiaoLabel(12) },
    { value: 13, label: getMacroRegiaoLabel(13) },
    { value: 14, label: getMacroRegiaoLabel(14) },
    { value: 15, label: getMacroRegiaoLabel(15) },
    { value: 16, label: getMacroRegiaoLabel(16) },
    { value: 17, label: getMacroRegiaoLabel(17) },
    { value: 18, label: getMacroRegiaoLabel(18) },
    { value: 19, label: getMacroRegiaoLabel(19) },
    { value: 20, label: getMacroRegiaoLabel(20) },
    { value: 21, label: getMacroRegiaoLabel(21) },
    { value: 22, label: getMacroRegiaoLabel(22) },
    { value: 23, label: getMacroRegiaoLabel(23) },
    { value: 99, label: getMacroRegiaoLabel(99) },
  ];
}
