/** Colonne pays / GRX dans un fichier TRXBO. */
export function findBoCountryColumn(
  columns: string[],
  sampleRow: Record<string, string>
): string | null {
  const exactNames = [
    'GRX',
    'grx',
    'Pays',
    'PAYS',
    'Country',
    'COUNTRY',
    'paysProvenance',
    'Pays provenance',
    'PAYS PROVENANCE'
  ];

  for (const name of exactNames) {
    if (columns.includes(name) && String(sampleRow[name] ?? '').trim()) {
      return name;
    }
  }

  for (const column of columns) {
    const lower = column.toLowerCase();
    if (
      ['pays', 'country', 'grx', 'provenance'].some(keyword => lower.includes(keyword)) &&
      String(sampleRow[column] ?? '').trim()
    ) {
      return column;
    }
  }

  return null;
}

export function findBoAgencyColumn(columns: string[]): string | null {
  const match = columns.find(col => {
    const lower = col.toLowerCase();
    return lower.includes('agence') || lower.includes('agency');
  });
  return match ?? null;
}

export function isTrxboLikeFile(columns: string[]): boolean {
  return columns.some(col => {
    const lower = col.toLowerCase();
    return lower.includes('service') || lower.includes('serv');
  });
}
