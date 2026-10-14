/** Index valeur → nombre de lignes pour les popups de sélection (pays, agences, services…). */
export interface ColumnValueIndex {
  values: string[];
  counts: Map<string, number>;
}

export interface ColumnValueFilter {
  column: string;
  allowed: Set<string>;
}

export function rowMatchesColumnFilters(
  row: Record<string, string>,
  filters: ColumnValueFilter[]
): boolean {
  for (let i = 0; i < filters.length; i++) {
    const filter = filters[i];
    const raw = row[filter.column];
    if (raw === undefined || raw === null) {
      return false;
    }
    const value = String(raw);
    if (!filter.allowed.has(value)) {
      return false;
    }
  }
  return true;
}

export function columnValueCountsToRecord(counts: Map<string, number>): Record<string, number> {
  const record: Record<string, number> = {};
  counts.forEach((count, key) => {
    record[key] = count;
  });
  return record;
}

/** Parcourt les données une seule fois : valeurs uniques triées + effectifs par valeur. */
export function buildColumnValueIndex(
  data: Record<string, string>[],
  column: string,
  normalize: (raw: string) => string = (raw) => raw.trim()
): ColumnValueIndex {
  const counts = new Map<string, number>();
  for (let i = 0; i < data.length; i++) {
    const raw = data[i][column];
    if (raw === undefined || raw === null) {
      continue;
    }
    const key = normalize(String(raw));
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return { values: [...counts.keys()].sort(), counts };
}

/** Version non bloquante pour gros fichiers TRXBO. */
export async function buildColumnValueIndexAsync(
  data: Record<string, string>[],
  column: string,
  yieldFn: () => Promise<void>,
  batchSize = 8000,
  normalize: (raw: string) => string = (raw) => raw.trim()
): Promise<ColumnValueIndex> {
  if (data.length <= batchSize) {
    return buildColumnValueIndex(data, column, normalize);
  }

  const counts = new Map<string, number>();
  for (let start = 0; start < data.length; start += batchSize) {
    const end = Math.min(start + batchSize, data.length);
    for (let i = start; i < end; i++) {
      const raw = data[i][column];
      if (raw === undefined || raw === null) {
        continue;
      }
      const key = normalize(String(raw));
      if (!key) {
        continue;
      }
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    await yieldFn();
  }
  return { values: [...counts.keys()].sort(), counts };
}

/** Compte les valeurs d'une colonne cible en appliquant des filtres cumulés (sans copier les lignes). */
export function buildColumnValueIndexWithFilters(
  data: Record<string, string>[],
  column: string,
  filters: ColumnValueFilter[],
  normalize: (raw: string) => string = (raw) => raw.trim()
): ColumnValueIndex {
  const counts = new Map<string, number>();
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!rowMatchesColumnFilters(row, filters)) {
      continue;
    }
    const raw = row[column];
    if (raw === undefined || raw === null) {
      continue;
    }
    const key = normalize(String(raw));
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return { values: [...counts.keys()].sort(), counts };
}

export async function buildColumnValueIndexWithFiltersAsync(
  data: Record<string, string>[],
  column: string,
  filters: ColumnValueFilter[],
  yieldFn: () => Promise<void>,
  batchSize = 20000,
  normalize: (raw: string) => string = (raw) => raw.trim(),
  onProgress?: (done: number, total: number) => void
): Promise<ColumnValueIndex> {
  if (!filters.length && data.length <= batchSize) {
    return buildColumnValueIndex(data, column, normalize);
  }

  const counts = new Map<string, number>();
  for (let start = 0; start < data.length; start += batchSize) {
    const end = Math.min(start + batchSize, data.length);
    for (let i = start; i < end; i++) {
      const row = data[i];
      if (!rowMatchesColumnFilters(row, filters)) {
        continue;
      }
      const raw = row[column];
      if (raw === undefined || raw === null) {
        continue;
      }
      const key = normalize(String(raw));
      if (!key) {
        continue;
      }
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    onProgress?.(end, data.length);
    if (end < data.length) {
      await yieldFn();
    }
  }
  return { values: [...counts.keys()].sort(), counts };
}

/** Matérialise les lignes filtrées en un seul passage (appelé en fin de wizard). */
export function materializeRowsWithFilters(
  data: Record<string, string>[],
  filters: ColumnValueFilter[]
): Record<string, string>[] {
  if (!filters.length) {
    return data;
  }

  const result: Record<string, string>[] = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (rowMatchesColumnFilters(row, filters)) {
      result.push(row);
    }
  }
  return result;
}

export async function materializeRowsWithFiltersAsync(
  data: Record<string, string>[],
  filters: ColumnValueFilter[],
  yieldFn: () => Promise<void>,
  batchSize = 20000,
  onProgress?: (done: number, total: number) => void
): Promise<Record<string, string>[]> {
  if (!filters.length) {
    return data;
  }

  const result: Record<string, string>[] = [];
  for (let start = 0; start < data.length; start += batchSize) {
    const end = Math.min(start + batchSize, data.length);
    for (let i = start; i < end; i++) {
      const row = data[i];
      if (rowMatchesColumnFilters(row, filters)) {
        result.push(row);
      }
    }
    onProgress?.(end, data.length);
    if (end < data.length) {
      await yieldFn();
    }
  }
  return result;
}
