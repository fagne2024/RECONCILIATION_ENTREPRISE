/**
 * Stockage compact des lignes de traitement.
 *
 * Chaque ligne est conservée sous forme d'une seule chaîne (tableau JSON des valeurs dans
 * l'ordre des colonnes) au lieu d'un objet avec une chaîne par cellule. Sur de gros volumes,
 * le coût mémoire vient des objets chaîne par cellule : une chaîne par ligne réduit fortement
 * le tas JavaScript (mesure : ~5× sur un jeu synthétique de 400 000 lignes × 12 colonnes).
 *
 * Règles de sémantique :
 * - `null` et `undefined` sont traités comme « clé absente » : la clé n'apparaît pas dans
 *   l'objet reconstitué.
 * - Les colonnes peuvent s'ajouter après coup : une ligne plus ancienne renvoie `undefined`
 *   pour les colonnes qu'elle ne connaît pas.
 * - Les valeurs sont conservées avec leur type (chaîne, nombre, booléen) grâce à JSON.
 */

export type CellValue = string | number | boolean;
export type RowRecord = Record<string, any>;

export class CompactRowStore {
  private readonly packed: string[] = [];
  private readonly colIndex = new Map<string, number>();
  private readonly cols: string[] = [];

  // Cache d'une seule ligne décodée : évite de re-parser JSON pour les accès successifs
  // à la même ligne (ex. boucle sur les colonnes d'une même ligne).
  private cacheIndex = -1;
  private cacheValues: Array<CellValue | null> | null = null;

  /** Nombre de lignes stockées. */
  get length(): number {
    return this.packed.length;
  }

  /** Colonnes connues, dans l'ordre de première apparition. */
  get columns(): string[] {
    return this.cols.slice();
  }

  /** Définit explicitement l'ordre des colonnes (les colonnes inconnues sont ajoutées à la fin). */
  setColumns(columns: string[]): void {
    for (const col of columns) {
      this.registerColumn(col);
    }
  }

  /** Ajoute une ligne. Les nouvelles clés deviennent des colonnes. */
  push(row: RowRecord): void {
    for (const key of Object.keys(row)) {
      this.registerColumn(key);
    }
    this.packed.push(this.encode(row));
  }

  /** Ajoute plusieurs lignes sans spread (évite les limites d'arguments sur gros lots). */
  pushAll(rows: RowRecord[]): void {
    for (let i = 0; i < rows.length; i++) {
      this.push(rows[i]);
    }
  }

  /** Reconstitue la ligne `index` sous forme d'objet (clés absentes omises). */
  get(index: number): RowRecord {
    const values = this.decode(index);
    const out: RowRecord = {};
    for (let c = 0; c < values.length; c++) {
      const value = values[c];
      if (value !== null && value !== undefined) {
        out[this.cols[c]] = value;
      }
    }
    return out;
  }

  /** Valeur d'une cellule, ou `undefined` si la colonne est absente de la ligne. */
  cell(index: number, col: string): CellValue | undefined {
    const at = this.colIndex.get(col);
    if (at === undefined) {
      return undefined;
    }
    const value = this.decode(index)[at];
    return value === null ? undefined : value;
  }

  /** Modifie une cellule. `null`/`undefined` retire la valeur de la ligne. */
  setCell(index: number, col: string, value: CellValue | null | undefined): void {
    this.assertIndex(index);
    this.registerColumn(col);
    const row = this.get(index);
    if (value === null || value === undefined) {
      delete row[col];
    } else {
      row[col] = value;
    }
    this.packed[index] = this.encode(row);
    this.invalidateCache();
  }

  /** Applique une transformation à chaque ligne et remplace son contenu. */
  mapInPlace(transform: (row: RowRecord, index: number) => RowRecord): void {
    for (let i = 0; i < this.packed.length; i++) {
      const next = transform(this.get(i), i);
      for (const key of Object.keys(next)) {
        this.registerColumn(key);
      }
      this.packed[i] = this.encode(next);
    }
    this.invalidateCache();
  }

  /** Parcourt les lignes dans l'ordre (objets reconstitués un à un, sans tout matérialiser). */
  forEach(callback: (row: RowRecord, index: number) => void): void {
    for (let i = 0; i < this.packed.length; i++) {
      callback(this.get(i), i);
    }
  }

  /** Matérialise toutes les lignes en objets. À réserver aux étapes qui en ont vraiment besoin. */
  toArray(): RowRecord[] {
    const out: RowRecord[] = new Array(this.packed.length);
    for (let i = 0; i < this.packed.length; i++) {
      out[i] = this.get(i);
    }
    return out;
  }

  /** Remplace entièrement la ligne `index`. */
  replace(index: number, row: RowRecord): void {
    this.assertIndex(index);
    for (const key of Object.keys(row)) {
      this.registerColumn(key);
    }
    this.packed[index] = this.encode(row);
    this.invalidateCache();
  }

  /**
   * Copie du stockage. Les chaînes étant immuables, elles sont partagées : la copie ne
   * double pas la mémoire des lignes.
   */
  copy(): CompactRowStore {
    const next = new CompactRowStore();
    next.setColumns(this.cols);
    for (let i = 0; i < this.packed.length; i++) {
      next.packed.push(this.packed[i]);
    }
    return next;
  }

  /** Vide le stockage (les colonnes connues sont conservées). */
  clear(): void {
    this.packed.length = 0;
    this.invalidateCache();
  }

  private registerColumn(col: string): void {
    if (!this.colIndex.has(col)) {
      this.colIndex.set(col, this.cols.length);
      this.cols.push(col);
    }
  }

  private encode(row: RowRecord): string {
    const values: Array<CellValue | null> = new Array(this.cols.length).fill(null);
    for (const key of Object.keys(row)) {
      const value = row[key];
      if (value !== null && value !== undefined) {
        values[this.colIndex.get(key)!] = value;
      }
    }
    // Pas de colonnes de fin inutiles : une ligne plus courte est complétée à la lecture.
    let last = values.length - 1;
    while (last >= 0 && values[last] === null) {
      last--;
    }
    return JSON.stringify(values.slice(0, last + 1));
  }

  private decode(index: number): Array<CellValue | null> {
    this.assertIndex(index);
    if (this.cacheIndex === index && this.cacheValues) {
      return this.cacheValues;
    }
    const values = JSON.parse(this.packed[index]) as Array<CellValue | null>;
    this.cacheIndex = index;
    this.cacheValues = values;
    return values;
  }

  private assertIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.packed.length) {
      throw new RangeError(`Index de ligne hors limites : ${index} (taille ${this.packed.length})`);
    }
  }

  private invalidateCache(): void {
    this.cacheIndex = -1;
    this.cacheValues = null;
  }
}
