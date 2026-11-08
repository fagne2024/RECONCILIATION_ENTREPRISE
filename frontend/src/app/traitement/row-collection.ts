import { CompactRowStore, RowRecord } from './compact-row-store';

/**
 * Collection de lignes de traitement avec une interface proche d'un tableau d'objets,
 * mais stockée de façon compacte (voir CompactRowStore).
 *
 * - Les lectures (`forEach`, `map`, `filter`, `slice`, itération `for...of`) reconstituent
 *   les lignes une à une : aucun tableau complet d'objets n'est gardé en mémoire.
 * - Les mutations doivent passer par `mutateEach` (ou `setAt`) : modifier l'objet reçu dans
 *   un `forEach`/`for...of` ne modifie PAS la collection.
 */
export class RowCollection implements Iterable<RowRecord> {
  private store: CompactRowStore;

  constructor(source?: Iterable<RowRecord> | RowCollection) {
    if (source instanceof RowCollection) {
      this.store = source.store.copy();
    } else {
      this.store = new CompactRowStore();
      if (source) {
        for (const row of source) {
          this.store.push(row);
        }
      }
    }
  }

  /** Crée une collection à partir d'un tableau ou d'une autre collection. */
  static from(source: Iterable<RowRecord> | RowCollection | null | undefined): RowCollection {
    return new RowCollection(source ?? undefined);
  }

  get length(): number {
    return this.store.length;
  }

  *[Symbol.iterator](): Iterator<RowRecord> {
    const n = this.store.length;
    for (let i = 0; i < n; i++) {
      yield this.store.get(i);
    }
  }

  /** Lecture seule : les modifications de l'objet reçu ne sont pas persistées. */
  forEach(callback: (row: RowRecord, index: number) => void): void {
    this.store.forEach(callback);
  }

  /** Mutation : le callback modifie l'objet reçu, la ligne est ensuite réencodée. */
  mutateEach(callback: (row: RowRecord, index: number) => void): void {
    this.store.mapInPlace((row, index) => {
      callback(row, index);
      return row;
    });
  }

  map<T>(callback: (row: RowRecord, index: number) => T): T[] {
    const out: T[] = [];
    this.store.forEach((row, index) => out.push(callback(row, index)));
    return out;
  }

  filter(predicate: (row: RowRecord, index: number) => boolean): RowRecord[] {
    const out: RowRecord[] = [];
    this.store.forEach((row, index) => {
      if (predicate(row, index)) {
        out.push(row);
      }
    });
    return out;
  }

  find(predicate: (row: RowRecord, index: number) => boolean): RowRecord | undefined {
    const n = this.store.length;
    for (let i = 0; i < n; i++) {
      const row = this.store.get(i);
      if (predicate(row, i)) {
        return row;
      }
    }
    return undefined;
  }

  some(predicate: (row: RowRecord, index: number) => boolean): boolean {
    return this.find(predicate) !== undefined;
  }

  every(predicate: (row: RowRecord, index: number) => boolean): boolean {
    const n = this.store.length;
    for (let i = 0; i < n; i++) {
      if (!predicate(this.store.get(i), i)) {
        return false;
      }
    }
    return true;
  }

  reduce<T>(callback: (acc: T, row: RowRecord, index: number) => T, initial: T): T {
    let acc = initial;
    this.store.forEach((row, index) => {
      acc = callback(acc, row, index);
    });
    return acc;
  }

  slice(start?: number, end?: number): RowRecord[] {
    const n = this.store.length;
    const from = start === undefined ? 0 : start < 0 ? Math.max(n + start, 0) : Math.min(start, n);
    const to = end === undefined ? n : end < 0 ? Math.max(n + end, 0) : Math.min(end, n);
    const out: RowRecord[] = [];
    for (let i = from; i < to; i++) {
      out.push(this.store.get(i));
    }
    return out;
  }

  /** Lecture d'une ligne par index (objet reconstitué). */
  at(index: number): RowRecord {
    return this.store.get(index);
  }

  /** Remplace la ligne à l'index donné. */
  setAt(index: number, row: RowRecord): void {
    this.store.replace(index, row);
  }

  /** Ajoute des lignes (sans spread : pas de limite d'arguments). */
  push(...rows: RowRecord[]): number {
    for (let i = 0; i < rows.length; i++) {
      this.store.push(rows[i]);
    }
    return this.store.length;
  }

  pushAll(rows: Iterable<RowRecord>): void {
    for (const row of rows) {
      this.store.push(row);
    }
  }

  /** Matérialise la collection en tableau d'objets. À réserver aux exports et analyses. */
  toArray(): RowRecord[] {
    return this.store.toArray();
  }

  /** Copie légère : les chaînes compactes sont partagées. */
  clone(): RowCollection {
    return new RowCollection(this);
  }

  clear(): void {
    this.store.clear();
  }

  /** Colonnes connues, dans l'ordre de première apparition. */
  get columns(): string[] {
    return this.store.columns;
  }
}
