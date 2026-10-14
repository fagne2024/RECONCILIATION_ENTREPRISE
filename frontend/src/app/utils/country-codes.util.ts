/** Noms pays alignés sur la table `pays` (init-pays.sql). */
const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  CM: 'Cameroun',
  CI: "Côte d'Ivoire",
  SN: 'Sénégal',
  BF: 'Burkina Faso',
  ML: 'Mali',
  BJ: 'Bénin',
  NE: 'Niger',
  TD: 'Tchad',
  TG: 'Togo',
  GA: 'Gabon',
  GN: 'Guinée',
  KE: 'Kenya',
  MZ: 'Mozambique',
  NG: 'Nigeria',
  CF: 'Centrafrique',
  CG: 'Congo',
  CD: 'RD Congo',
  GQ: 'Guinée équatoriale',
  ST: 'São Tomé-et-Príncipe',
  AO: 'Angola',
  GW: 'Guinée-Bissau',
  SL: 'Sierra Leone',
  LR: 'Liberia',
  GH: 'Ghana',
  MR: 'Mauritanie',
  GM: 'Gambie',
  CV: 'Cap-Vert'
};

/** Variantes métier → code ISO (ex. CITCH = CI). */
const COUNTRY_ALIAS_TO_ISO: Record<string, string> = {
  CITCH: 'CI'
};

function resolveIsoCode(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (COUNTRY_CODE_TO_NAME[upper]) {
    return upper;
  }
  if (COUNTRY_ALIAS_TO_ISO[upper]) {
    return COUNTRY_ALIAS_TO_ISO[upper];
  }
  if (upper.startsWith('CITCH')) {
    return 'CI';
  }
  return upper;
}

export function countryNameFromCode(code: string | null | undefined): string | null {
  if (!code) {
    return null;
  }
  const iso = resolveIsoCode(code);
  return COUNTRY_CODE_TO_NAME[iso] ?? null;
}

/** Libellé pays affiché : code ISO / alias → nom complet, sinon valeur telle quelle. */
export function countryDisplayLabel(country: string | null | undefined): string {
  if (!country) {
    return '';
  }
  const trimmed = country.trim();
  if (!trimmed) {
    return '';
  }
  return countryNameFromCode(trimmed) || trimmed;
}

export function countryNamesFromCodes(codes: string[] | null | undefined): string[] {
  if (!codes?.length) {
    return [];
  }
  const names: string[] = [];
  const seen = new Set<string>();
  for (const code of codes) {
    const name = countryNameFromCode(code);
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

/** Options de filtre pays : libellés complets uniques (GA → Gabon, CITCH → Côte d'Ivoire). */
export function normalizeCountryFilterOptions(countries: (string | null | undefined)[]): string[] {
  const byKey = new Map<string, string>();
  for (const raw of countries || []) {
    const label = countryDisplayLabel(raw);
    if (!label) {
      continue;
    }
    const key = countryMatchKey(label);
    if (!key) {
      continue;
    }
    if (!byKey.has(key)) {
      byKey.set(key, label);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, 'fr'));
}

/** Filtre pays : true si aucune sélection ou si la ligne correspond à un pays choisi. */
export function matchesCountryFilter(
  rowCountry: string | null | undefined,
  selectedCountries: string[] | null | undefined
): boolean {
  if (!selectedCountries?.length) {
    return true;
  }
  return selectedCountries.some(selected => countriesMatch(rowCountry, selected));
}

/** Compare deux libellés pays (code ISO, nom complet, alias ou variante). */
export function countriesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = countryMatchKey(a);
  const kb = countryMatchKey(b);
  if (!ka || !kb) {
    return !ka && !kb;
  }
  return ka === kb;
}

function countryMatchKey(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const upper = trimmed.toUpperCase();
  if (upper === 'CITCH' || upper.startsWith('CITCH')) {
    return COUNTRY_CODE_TO_NAME['CI'].toLowerCase();
  }
  const fromCode = countryNameFromCode(trimmed);
  if (fromCode) {
    return fromCode.toLowerCase();
  }
  for (const [code, name] of Object.entries(COUNTRY_CODE_TO_NAME)) {
    if (code === upper || name.toLowerCase() === trimmed.toLowerCase()) {
      return name.toLowerCase();
    }
  }
  return trimmed.toLowerCase();
}
