import { Injectable } from '@angular/core';

export interface ColumnProfile {
  name: string;
  type: 'amount' | 'date' | 'identifier' | 'identifier_numeric' | 'text' | 'number' | 'status' | 'phone' | 'label' | 'currency' | 'empty';
  fillRate: number;
  uniqueness: number;
  min: string | null;
  max: string | null;
  avgLength: number;
  dominantPattern: string | null;
  samples: string[];
  dateFormat?: string;
}

export interface ColumnMapping {
  a: string;
  b: string;
  nature: 'id' | 'amount' | 'date' | 'account' | 'status' | 'label' | 'currency' | 'phone';
  confidence: number;
  justification: string;
}

export interface Normalization {
  file: 'A' | 'B';
  column: string;
  operations: NormalizationOp[];
}

export type NormalizationOp =
  | 'trim'
  | 'upper'
  | 'lower'
  | 'strip_leading_zeros'
  | 'remove_non_alnum'
  | `remove_prefix:${string}`
  | `remove_suffix:${string}`
  | `parse_date:${string}`
  | 'to_amount'
  | 'abs'
  | 'decimal_sep_comma'
  | 'decimal_sep_dot'
  | 'remove_spaces';

export interface PassDef {
  order: number;
  name: string;
  type: 'exact' | 'partial' | 'composite' | 'approximate';
  keys: Array<{ a: string; b: string }>;
  tolerances: {
    amount: number | null;
    dateMinutes: number | null;
  };
  mode: '1-1' | '1-N' | 'N-1' | 'N-N';
  confidence: number;
  estimatedMatchRate: number;
}

export interface ReconciliationPlan {
  analysis: {
    fileA: FileAnalysis;
    fileB: FileAnalysis;
  };
  columnMappings: ColumnMapping[];
  normalizations: Normalization[];
  passes: PassDef[];
  gapRules: {
    amountTolerance: number;
    treatFeesAsGap: boolean;
    duplicates: string;
  };
  risks: string[];
  openQuestions: Array<{ question: string; defaultHypothesis: string }>;
  estimatedGlobalMatchRate: number;
}

export interface FileAnalysis {
  role: string;
  keyColumns: string[];
  amountColumn: string | null;
  dateColumn: string | null;
  statusColumn: string | null;
  linesToIgnore: string;
}

export interface ProfileResult {
  profiles: ColumnProfile[];
  plan: ReconciliationPlan;
}

const DATE_PATTERNS = [
  'dd/MM/yyyy HH:mm:ss',
  'dd/MM/yyyy HH:mm',
  'dd/MM/yyyy',
  'yyyy-MM-dd HH:mm:ss',
  "yyyy-MM-dd'T'HH:mm:ss",
  'yyyy-MM-dd HH:mm',
  'yyyy-MM-dd',
  'dd-MM-yyyy HH:mm:ss',
  'dd-MM-yyyy',
  'yyyyMMddHHmmss',
];

const DATE_REGEXES: Record<string, RegExp> = {
  'dd/MM/yyyy HH:mm:ss': /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/,
  'dd/MM/yyyy HH:mm': /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/,
  'dd/MM/yyyy': /^\d{2}\/\d{2}\/\d{4}$/,
  'yyyy-MM-dd HH:mm:ss': /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
  "yyyy-MM-dd'T'HH:mm:ss": /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
  'yyyy-MM-dd HH:mm': /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
  'yyyy-MM-dd': /^\d{4}-\d{2}-\d{2}$/,
  'dd-MM-yyyy HH:mm:ss': /^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}$/,
  'dd-MM-yyyy': /^\d{2}-\d{2}-\d{4}$/,
  'yyyyMMddHHmmss': /^\d{14}$/,
};

const FORMATTERS = new Map<string, (v: string) => Date | null>();

function getFormatter(pattern: string): (v: string) => Date | null {
  if (!FORMATTERS.has(pattern)) {
    FORMATTERS.set(pattern, createParser(pattern));
  }
  return FORMATTERS.get(pattern)!;
}

function createParser(pattern: string): (v: string) => Date | null {
  const regex = DATE_REGEXES[pattern];
  if (!regex) return () => null;

  return (v: string): Date | null => {
    if (!regex.test(v)) return null;
    try {
      let date: Date;
      if (pattern === 'dd/MM/yyyy HH:mm:ss' || pattern === 'dd/MM/yyyy HH:mm') {
        const [d, m, y] = v.split(/[\s\/]/);
        const [hh, mm, ss = '0'] = v.split(' ')[1]?.split(':') || [];
        date = new Date(+y, +m - 1, +d, +hh, +mm, +ss);
      } else if (pattern === 'dd/MM/yyyy') {
        const [d, m, y] = v.split('/');
        date = new Date(+y, +m - 1, +d);
      } else if (pattern.startsWith('yyyy-MM-dd')) {
        date = new Date(v.replace(' ', 'T'));
      } else if (pattern === 'dd-MM-yyyy HH:mm:ss' || pattern === 'dd-MM-yyyy HH:mm') {
        const [d, m, y] = v.split(/[\s-]/);
        const [hh, mm, ss = '0'] = v.split(' ')[1]?.split(':') || [];
        date = new Date(+y, +m - 1, +d, +hh, +mm, +ss);
      } else if (pattern === 'dd-MM-yyyy') {
        const [d, m, y] = v.split('-');
        date = new Date(+y, +m - 1, +d);
      } else if (pattern === 'yyyyMMddHHmmss') {
        date = new Date(
          +v.slice(0, 4),
          +v.slice(4, 6) - 1,
          +v.slice(6, 8),
          +v.slice(8, 10),
          +v.slice(10, 12),
          +v.slice(12, 14)
        );
      } else {
        date = new Date(v);
      }
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  };
}

function shape(v: string): string {
  const s = v.length > 40 ? v.slice(0, 40) : v;
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const cls = /\d/.test(c) ? '9' : /[A-Za-z]/.test(c) ? 'A' : c;
    let j = i;
    while (j < s.length && getClass(s[j]) === cls) j++;
    const n = j - i;
    out += cls;
    if ((cls === '9' || cls === 'A') && n > 1) out += `{${n}}`;
    else if (n > 1) out += cls.repeat(n - 1);
    i = j;
  }
  return out;
}

function getClass(c: string): '9' | 'A' | string {
  return /\d/.test(c) ? '9' : /[A-Za-z]/.test(c) ? 'A' : c;
}

function toNumber(v: string): number | null {
  const s = v.replace(/\u00A0/g, '').replace(/\s/g, '');
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  }
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    return parseFloat(s.replace(/,/g, ''));
  }
  const clean = s.replace(/,/g, '.');
  return /^-?\d+(\.\d+)?$/.test(clean) ? parseFloat(clean) : null;
}

function round3(d: number): number {
  return Math.round(d * 1000) / 1000;
}

@Injectable({ providedIn: 'root' })
export class AutoDiscoveryReconciliationService {
  private readonly SAMPLE_SIZE = 2000;
  private readonly TYPE_SAMPLE = 500;

  profile(rows: Record<string, string>[]): ColumnProfile[] {
    if (!rows?.length) return [];
    const cols = Object.keys(rows[0]);
    return cols.map((col) => this.profileColumn(col, rows));
  }

  private profileColumn(col: string, rows: Record<string, string>[]): ColumnProfile {
    const values = rows
      .map((r) => r[col])
      .filter((v): v is string => v != null && v.trim() !== '');

    if (!values.length) {
      return {
        name: col,
        type: 'empty',
        fillRate: 0,
        uniqueness: 0,
        min: null,
        max: null,
        avgLength: 0,
        dominantPattern: null,
        samples: [],
      };
    }

    const fillRate = values.length / rows.length;
    const uniqueValues = new Set(values);
    const uniqueness = uniqueValues.size / values.length;
    const avgLength = values.reduce((a, v) => a + v.length, 0) / values.length;

    const step = Math.max(1, Math.floor(values.length / this.TYPE_SAMPLE));
    const sample: string[] = [];
    for (let i = 0; i < values.length; i += step) sample.push(values[i]);

    const type = this.detectType(sample, col);
    let min: string | null = null;
    let max: string | null = null;
    let dateFormat: string | undefined;

    if (type === 'amount' || type === 'number') {
      let mn: number | null = null;
      let mx: number | null = null;
      for (const v of values) {
        const n = toNumber(v);
        if (n == null) continue;
        if (mn == null || n < mn) mn = n;
        if (mx == null || n > mx) mx = n;
      }
      if (mn != null) {
        min = mn.toString();
        max = mx.toString();
      }
    } else if (type.startsWith('date:')) {
      dateFormat = type.slice(5);
      const parse = getFormatter(dateFormat);
      let mn: Date | null = null;
      let mx: Date | null = null;
      for (const v of values) {
        const d = parse(v);
        if (!d) continue;
        if (!mn || d < mn) mn = d;
        if (!mx || d > mx) mx = d;
      }
      if (mn) {
        min = mn.toISOString();
        max = mx!.toISOString();
      }
    }

    const patternCounts = new Map<string, number>();
    for (const v of sample) {
      const sh = shape(v);
      patternCounts.set(sh, (patternCounts.get(sh) || 0) + 1);
    }
    let dominantPattern: string | null = null;
    let maxCount = 0;
    for (const [p, c] of patternCounts) {
      if (c > maxCount) {
        maxCount = c;
        dominantPattern = p;
      }
    }

    const samples = [...uniqueValues].slice(0, 10);

    return {
      name: col,
      type,
      fillRate: round3(fillRate),
      uniqueness: round3(uniqueness),
      min,
      max,
      avgLength: round3(avgLength),
      dominantPattern,
      samples,
      dateFormat,
    };
  }

  private detectType(sample: string[], colName: string): ColumnProfile['type'] {
    const lowerName = colName.toLowerCase();

    if (
      lowerName.includes('montant') ||
      lowerName.includes('amount') ||
      lowerName.includes('volume')
    ) {
      if (sample.every((v) => toNumber(v) != null)) return 'amount';
    }

    if (
      lowerName.includes('date') ||
      lowerName.includes('heure') ||
      lowerName.includes('time')
    ) {
      for (const p of DATE_PATTERNS) {
        if (sample.every((v) => getFormatter(p)(v) != null)) {
          return 'date';
        }
      }
    }

    if (
      lowerName.includes('statut') ||
      lowerName.includes('status') ||
      lowerName.includes('etat')
    ) {
      return 'status';
    }

    if (
      lowerName.includes('telephone') ||
      lowerName.includes('phone') ||
      lowerName.includes('mobile') ||
      lowerName.includes('msisdn')
    ) {
      return 'phone';
    }

    if (
      lowerName.includes('libelle') ||
      lowerName.includes('label') ||
      lowerName.includes('description') ||
      lowerName.includes('motif')
    ) {
      return 'label';
    }

    if (
      lowerName.includes('devise') ||
      lowerName.includes('currency') ||
      lowerName.includes('monnaie')
    ) {
      return 'currency';
    }

    for (const p of DATE_PATTERNS) {
      if (sample.every((v) => getFormatter(p)(v) != null)) {
        return 'date';
      }
    }

    if (sample.every((v) => /^\d{12,}$/.test(v) || /^0\d+$/.test(v))) {
      return 'identifier_numeric';
    }

    if (sample.every((v) => toNumber(v) != null)) {
      const hasDecimals = sample.some((v) => v.includes('.') || v.includes(','));
      return hasDecimals ? 'amount' : 'number';
    }

    if (
      lowerName.includes('id') ||
      lowerName.includes('ref') ||
      lowerName.includes('cle') ||
      lowerName.includes('key') ||
      lowerName.includes('transaction') ||
      lowerName.includes('operation')
    ) {
      return 'identifier';
    }

    return 'text';
  }

  buildPlan(
    fileAName: string,
    fileBName: string,
    profilesA: ColumnProfile[],
    profilesB: ColumnProfile[],
    sampleA: Record<string, string>[],
    sampleB: Record<string, string>[],
    context?: { country?: string; currency?: string; partner?: string; period?: string }
  ): ReconciliationPlan {
    const analysisA = this.analyzeFile(profilesA, sampleA, 'A');
    const analysisB = this.analyzeFile(profilesB, sampleB, 'B');
    const mappings = this.mapColumns(profilesA, profilesB, sampleA, sampleB);
    const normalizations = this.buildNormalizations(profilesA, profilesB, mappings, sampleA, sampleB);
    const passes = this.buildPasses(mappings, normalizations, profilesA, profilesB, analysisA, analysisB);

    return {
      analysis: { fileA: analysisA, fileB: analysisB },
      columnMappings: mappings,
      normalizations,
      passes,
      gapRules: { amountTolerance: 0, treatFeesAsGap: true, duplicates: 'mark' },
      risks: this.identifyRisks(profilesA, profilesB, mappings),
      openQuestions: this.generateQuestions(profilesA, profilesB, mappings),
      estimatedGlobalMatchRate: this.estimateGlobalMatchRate(passes),
    };
  }

  private analyzeFile(profiles: ColumnProfile[], sample: Record<string, string>[], file: 'A' | 'B'): FileAnalysis {
    const amountCol = profiles.find((p) => p.type === 'amount')?.name || null;
    const dateCol = profiles.find((p) => p.type.startsWith('date:'))?.name || null;
    const statusCol = profiles.find((p) => p.type === 'status')?.name || null;
    const idCols = profiles
      .filter((p) => p.type === 'identifier' || p.type === 'identifier_numeric')
      .map((p) => p.name);

    return {
      role: file === 'A' ? 'Back-Office' : 'Partenaire',
      keyColumns: idCols,
      amountColumn: amountCol,
      dateColumn: dateCol,
      statusColumn: statusCol,
      linesToIgnore: '',
    };
  }

  private mapColumns(
    profilesA: ColumnProfile[],
    profilesB: ColumnProfile[],
    sampleA: Record<string, string>[],
    sampleB: Record<string, string>[]
  ): ColumnMapping[] {
    const mappings: ColumnMapping[] = [];

    for (const pa of profilesA) {
      if (pa.type === 'empty') continue;

      for (const pb of profilesB) {
        if (pb.type === 'empty') continue;

        const typeMatch = this.typesCompatible(pa.type, pb.type);
        if (!typeMatch) continue;

        const nameSim = this.nameSimilarity(pa.name, pb.name);
        const valueOverlap = this.valueOverlap(sampleA, sampleB, pa.name, pb.name);
        const formatCompat = this.formatCompatibility(pa, pb);
        const uniqueness = Math.min(pa.uniqueness, pb.uniqueness);

        let confidence = nameSim * 0.3 + valueOverlap * 0.4 + formatCompat * 0.2 + uniqueness * 0.1;

        if (this.isImportantColumn(pa.name) || this.isImportantColumn(pb.name)) {
          confidence += 0.1;
        }

        if (confidence > 0.25) {
          let nature: ColumnMapping['nature'] = 'label';
          if (pa.type === 'amount' || pb.type === 'amount') nature = 'amount';
          else if (pa.type.startsWith('date:') || pb.type.startsWith('date:')) nature = 'date';
          else if (pa.type === 'identifier' || pa.type === 'identifier_numeric' || pb.type === 'identifier' || pb.type === 'identifier_numeric') nature = 'id';
          else if (pa.type === 'phone' || pb.type === 'phone') nature = 'phone';
          else if (pa.type === 'status' || pb.type === 'status') nature = 'status';
          else if (pa.type === 'currency' || pb.type === 'currency') nature = 'currency';
          else if (pa.type === 'label' || pb.type === 'label') nature = 'label';

          mappings.push({
            a: pa.name,
            b: pb.name,
            nature,
            confidence: Math.min(1, confidence),
            justification: `Nom: ${(nameSim * 100).toFixed(0)}%, Valeurs: ${(valueOverlap * 100).toFixed(0)}%, Format: ${(formatCompat * 100).toFixed(0)}%, Unicité: ${(uniqueness * 100).toFixed(0)}%`,
          });
        }
      }
    }

    return mappings.sort((a, b) => b.confidence - a.confidence);
  }

  private typesCompatible(ta: string, tb: string): boolean {
    if (ta === tb) return true;
    if ((ta === 'amount' && tb === 'number') || (ta === 'number' && tb === 'amount')) return true;
    if (ta.startsWith('date:') && tb.startsWith('date:')) return true;
    if ((ta === 'identifier' || ta === 'identifier_numeric') && (tb === 'identifier' || tb === 'identifier_numeric')) return true;
    if ((ta === 'phone' && tb === 'phone') || (ta === 'phone' && tb === 'text') || (ta === 'text' && tb === 'phone')) return true;
    if ((ta === 'status' && tb === 'status') || (ta === 'label' && tb === 'label')) return true;
    if ((ta === 'currency' && tb === 'currency')) return true;
    return false;
  }

  private nameSimilarity(a: string, b: string): number {
    const al = a.toLowerCase();
    const bl = b.toLowerCase();
    if (al === bl) return 1;
    if (al.includes('id') && bl.includes('id')) return 0.9;
    if (al.includes('transaction') && bl.includes('transaction')) return 0.9;
    if (al.includes('montant') && bl.includes('montant')) return 0.9;
    if (al.includes('amount') && bl.includes('amount')) return 0.9;
    if (al.includes('date') && bl.includes('date')) return 0.8;
    if (al.includes('phone') && bl.includes('phone')) return 0.8;
    if (al.includes('telephone') && bl.includes('telephone')) return 0.8;
    if (al.includes('ref') && bl.includes('ref')) return 0.7;
    if (al.includes('cle') && bl.includes('cle')) return 0.7;

    const aWords = this.extractWords(al);
    const bWords = this.extractWords(bl);
    const common = aWords.filter((w) => bWords.includes(w)).length;
    if (common > 0) return 0.5 + common * 0.1;

    return this.levenshteinSimilarity(al, bl);
  }

  private extractWords(s: string): string[] {
    return s
      .split(/[\s_\-]+/)
      .join(' ')
      .replace(/([A-Z])/g, ' $1')
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 1 && !['de', 'du', 'la', 'le', 'et', 'ou', 'avec', 'sans'].includes(w));
  }

  private levenshteinSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (!a.length || !b.length) return 0;
    const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array(b.length + 1).fill(0).map((_, j) => i === 0 ? j : 0));
    for (let i = 1; i <= a.length; i++) dp[i][0] = i;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return 1 - dp[a.length][b.length] / Math.max(a.length, b.length);
  }

  private isImportantColumn(name: string): boolean {
    const l = name.toLowerCase();
    return l.includes('id') || l.includes('transaction') || l.includes('cle') || l.includes('ref') || l.includes('montant') || l.includes('amount');
  }

  private valueOverlap(
    sampleA: Record<string, string>[],
    sampleB: Record<string, string>[],
    colA: string,
    colB: string
  ): number {
    const valsA = new Set(sampleA.map((r) => r[colA]?.trim()).filter(Boolean));
    const valsB = new Set(sampleB.map((r) => r[colB]?.trim()).filter(Boolean));
    if (!valsA.size || !valsB.size) return 0;
    let overlap = 0;
    for (const v of valsA) if (valsB.has(v)) overlap++;
    return overlap / Math.max(valsA.size, valsB.size);
  }

  private formatCompatibility(pa: ColumnProfile, pb: ColumnProfile): number {
    if (pa.dominantPattern && pb.dominantPattern && pa.dominantPattern === pb.dominantPattern) return 1;
    if (pa.type === 'amount' && pb.type === 'amount') return 0.9;
    if (pa.type.startsWith('date:') && pb.type.startsWith('date:')) return 0.8;
    if (pa.type === 'identifier' && pb.type === 'identifier') return 0.7;
    return 0.3;
  }

  private buildNormalizations(
    profilesA: ColumnProfile[],
    profilesB: ColumnProfile[],
    mappings: ColumnMapping[],
    sampleA: Record<string, string>[],
    sampleB: Record<string, string>[]
  ): Normalization[] {
    const norms: Normalization[] = [];

    for (const m of mappings) {
      const pa = profilesA.find((p) => p.name === m.a);
      const pb = profilesB.find((p) => p.name === m.b);
      if (!pa || !pb) continue;

      const opsA: NormalizationOp[] = ['trim'];
      const opsB: NormalizationOp[] = ['trim'];

      if (pa.type === 'amount' || pb.type === 'amount') {
        opsA.push('to_amount', 'decimal_sep_dot');
        opsB.push('to_amount', 'decimal_sep_dot');
      }

      if (pa.type.startsWith('date:') && pb.type.startsWith('date:')) {
        const fmtA = pa.dateFormat!;
        const fmtB = pb.dateFormat!;
        if (fmtA !== fmtB) {
          opsA.push(`parse_date:${fmtA}`);
          opsB.push(`parse_date:${fmtB}`);
        }
      }

      if (pa.type === 'identifier' || pa.type === 'identifier_numeric') {
        const trans = this.detectTransformation(sampleA, sampleB, m.a, m.b);
        if (trans) {
          if (trans.startsWith('remove_prefix:')) opsA.push(trans as NormalizationOp);
          else if (trans.startsWith('remove_suffix:')) opsA.push(trans as NormalizationOp);
          else if (trans === 'strip_leading_zeros') opsA.push('strip_leading_zeros');
          else if (trans === 'remove_non_alnum') opsA.push('remove_non_alnum');
        }
      }

      if (pa.type === 'phone' || pb.type === 'phone') {
        const prefix = this.detectPhonePrefix(sampleA, sampleB, m.a, m.b);
        if (prefix) opsA.push(`remove_prefix:${prefix}`);
      }

      if (opsA.length > 1) norms.push({ file: 'A', column: m.a, operations: opsA });
      if (opsB.length > 1) norms.push({ file: 'B', column: m.b, operations: opsB });
    }

    return norms;
  }

  private detectTransformation(
    sampleA: Record<string, string>[],
    sampleB: Record<string, string>[],
    colA: string,
    colB: string
  ): string | null {
    const valsA = sampleA.map((r) => r[colA]?.trim()).filter(Boolean);
    const valsB = new Set(sampleB.map((r) => r[colB]?.trim()).filter(Boolean));

    for (const v of valsA) {
      for (const prefix of ['237', '241', '224', '225', '223', '227', '226', '228', '229']) {
        if (v.startsWith(prefix) && valsB.has(v.slice(prefix.length))) {
          return `remove_prefix:${prefix}`;
        }
      }
      if (/^0\d+$/.test(v) && valsB.has(v.replace(/^0+/, ''))) {
        return 'strip_leading_zeros';
      }
      const cleaned = v.replace(/[^A-Za-z0-9]/g, '');
      if (cleaned !== v && valsB.has(cleaned)) {
        return 'remove_non_alnum';
      }
    }
    return null;
  }

  private detectPhonePrefix(
    sampleA: Record<string, string>[],
    sampleB: Record<string, string>[],
    colA: string,
    colB: string
  ): string | null {
    const valsA = sampleA.map((r) => r[colA]?.trim()).filter(Boolean);
    const valsB = new Set(sampleB.map((r) => r[colB]?.trim()).filter(Boolean));

    const prefixes = ['237', '241', '224', '225', '223', '227', '226', '228', '229', '33', '1'];
    for (const p of prefixes) {
      let count = 0;
      for (const v of valsA) {
        if (v.startsWith(p) && valsB.has(v.slice(p.length))) count++;
      }
      if (count / valsA.length > 0.3) return p;
    }
    return null;
  }

  private buildPasses(
    mappings: ColumnMapping[],
    normalizations: Normalization[],
    profilesA: ColumnProfile[],
    profilesB: ColumnProfile[],
    analysisA: FileAnalysis,
    analysisB: FileAnalysis
  ): PassDef[] {
    const passes: PassDef[] = [];
    let order = 1;

    const idMappings = mappings.filter((m) => m.nature === 'id' && m.confidence >= 0.7);
    if (idMappings.length) {
      passes.push({
        order: order++,
        name: 'Identifiant unique exact',
        type: 'exact',
        keys: idMappings.map((m) => ({ a: m.a, b: m.b })),
        tolerances: { amount: null, dateMinutes: null },
        mode: '1-1',
        confidence: 0.95,
        estimatedMatchRate: 0.7,
      });
    }

    const partialIdMappings = mappings.filter(
      (m) => m.nature === 'id' && m.confidence >= 0.4 && m.confidence < 0.7
    );
    if (partialIdMappings.length) {
      passes.push({
        order: order++,
        name: 'Identifiant partiel (préfixe/suffixe/segment)',
        type: 'partial',
        keys: partialIdMappings.map((m) => ({ a: m.a, b: m.b })),
        tolerances: { amount: null, dateMinutes: null },
        mode: '1-1',
        confidence: 0.8,
        estimatedMatchRate: 0.15,
      });
    }

    if (analysisA.amountColumn && analysisB.amountColumn && analysisA.dateColumn && analysisB.dateColumn) {
      const accountCols = mappings.filter((m) => m.nature === 'phone' || m.nature === 'account');
      if (accountCols.length) {
        passes.push({
          order: order++,
          name: 'Clé composite: Montant + Date + Compte/Téléphone',
          type: 'composite',
          keys: [
            { a: analysisA.amountColumn!, b: analysisB.amountColumn! },
            { a: analysisA.dateColumn!, b: analysisB.dateColumn! },
            { a: accountCols[0].a, b: accountCols[0].b },
          ],
          tolerances: { amount: 0, dateMinutes: 1440 },
          mode: '1-1',
          confidence: 0.7,
          estimatedMatchRate: 0.1,
        });
      } else {
        passes.push({
          order: order++,
          name: 'Clé composite: Montant + Date (±1j)',
          type: 'composite',
          keys: [
            { a: analysisA.amountColumn!, b: analysisB.amountColumn! },
            { a: analysisA.dateColumn!, b: analysisB.dateColumn! },
          ],
          tolerances: { amount: 0, dateMinutes: 1440 },
          mode: '1-1',
          confidence: 0.6,
          estimatedMatchRate: 0.08,
        });
      }
    }

    if (analysisA.amountColumn && analysisB.amountColumn && analysisA.dateColumn && analysisB.dateColumn) {
      passes.push({
        order: order++,
        name: 'Rapprochement approximatif: Montant exact + fenêtre date + libellé',
        type: 'approximate',
        keys: [
          { a: analysisA.amountColumn!, b: analysisB.amountColumn! },
          { a: analysisA.dateColumn!, b: analysisB.dateColumn! },
        ],
        tolerances: { amount: 0, dateMinutes: 4320 },
        mode: '1-1',
        confidence: 0.4,
        estimatedMatchRate: 0.05,
      });
    }

    return passes;
  }

  private identifyRisks(
    profilesA: ColumnProfile[],
    profilesB: ColumnProfile[],
    mappings: ColumnMapping[]
  ): string[] {
    const risks: string[] = [];

    const idMap = mappings.filter((m) => m.nature === 'id');
    if (!idMap.length) risks.push('Aucun identifiant de transaction fiable détecté');
    else if (idMap[0].confidence < 0.8) risks.push('Identifiant principal à confiance modérée');

    const amtMap = mappings.filter((m) => m.nature === 'amount');
    if (!amtMap.length) risks.push('Aucune colonne montant mappée');
    else if (amtMap[0].confidence < 0.8) risks.push('Colonne montant à confiance modérée');

    const dateMap = mappings.filter((m) => m.nature === 'date');
    if (!dateMap.length) risks.push('Aucune colonne date mappée');

    const lowFillA = profilesA.filter((p) => p.fillRate < 0.5 && p.type !== 'empty');
    if (lowFillA.length) risks.push(`Fichier A: colonnes peu remplies: ${lowFillA.map((p) => p.name).join(', ')}`);

    const lowFillB = profilesB.filter((p) => p.fillRate < 0.5 && p.type !== 'empty');
    if (lowFillB.length) risks.push(`Fichier B: colonnes peu remplies: ${lowFillB.map((p) => p.name).join(', ')}`);

    const dupA = profilesA.filter((p) => p.type === 'identifier' && p.uniqueness < 0.9);
    if (dupA.length) risks.push(`Fichier A: identifiants non uniques: ${dupA.map((p) => p.name).join(', ')}`);

    const dupB = profilesB.filter((p) => p.type === 'identifier' && p.uniqueness < 0.9);
    if (dupB.length) risks.push(`Fichier B: identifiants non uniques: ${dupB.map((p) => p.name).join(', ')}`);

    return risks;
  }

  private generateQuestions(
    profilesA: ColumnProfile[],
    profilesB: ColumnProfile[],
    mappings: ColumnMapping[]
  ): Array<{ question: string; defaultHypothesis: string }> {
    const questions: Array<{ question: string; defaultHypothesis: string }> = [];

    const idMap = mappings.filter((m) => m.nature === 'id');
    if (!idMap.length) {
      questions.push({
        question: 'Aucune cléidente unique commune trouvée. Utiliser une clé composite montant+date+téléphone ?',
        defaultHypothesis: 'Oui, passer en mode composite avec tolérance 1 jour',
      });
    }

    const amtMap = mappings.filter((m) => m.nature === 'amount');
    if (amtMap.length && amtMap[0].confidence < 0.8) {
      questions.push({
        question: `Colonne montant "${amtMap[0].a}" ↔ "${amtMap[0].b}" a une confiance ${(amtMap[0].confidence * 100).toFixed(0)}%. Confirmer le mapping ?`,
        defaultHypothesis: 'Oui, les formats semblent compatibles',
      });
    }

    const dateMap = mappings.filter((m) => m.nature === 'date');
    if (dateMap.length) {
      const pa = profilesA.find((p) => p.name === dateMap[0].a);
      const pb = profilesB.find((p) => p.name === dateMap[0].b);
      if (pa?.dateFormat !== pb?.dateFormat) {
        questions.push({
          question: `Formats de date différents: "${pa?.dateFormat}" vs "${pb?.dateFormat}". Normaliser les deux ?`,
          defaultHypothesis: 'Oui, normaliser vers ISO 8601',
        });
      }
    }

    const phoneMap = mappings.filter((m) => m.nature === 'phone');
    if (phoneMap.length) {
      questions.push({
        question: `Colonne téléphone détectée. Les numéros incluent-ils l'indicatif pays (ex: 237) côté BO mais pas côté partenaire ?`,
        defaultHypothesis: 'Oui, retirer l\'indicatif pays côté BO',
      });
    }

    return questions;
  }

  private estimateGlobalMatchRate(passes: PassDef[]): number {
    let remaining = 1;
    let total = 0;
    for (const p of passes) {
      const matchRate = p.estimatedMatchRate * remaining;
      total += matchRate;
      remaining -= matchRate;
      if (remaining <= 0.01) break;
    }
    return Math.min(0.95, total);
  }

  executePlan(
    plan: ReconciliationPlan,
    dataA: Record<string, string>[],
    dataB: Record<string, string>[]
  ): {
    matches: Array<{ indexA: number; indexB: number; pass: number; confidence: number }>;
    orphansA: number[];
    orphansB: number[];
    matchesByPass: Map<number, number>;
  } {
    const ops = new Map<string, NormalizationOp[]>();
    for (const n of plan.normalizations) {
      ops.set(`${n.file}|${n.column}`, n.operations);
    }

    const normalize = (value: string, file: 'A' | 'B', column: string): string => {
      let s = value?.trim() || '';
      const key = `${file}|${column}`;
      const colOps = ops.get(key) || [];
      for (const op of colOps) {
        if (!s) break;
        if (op === 'trim') s = s.trim();
        else if (op === 'upper') s = s.toUpperCase();
        else if (op === 'lower') s = s.toLowerCase();
        else if (op === 'strip_leading_zeros') s = s.replace(/^0+(?=.)/, '');
        else if (op === 'remove_non_alnum') s = s.replace(/[^A-Za-z0-9]/g, '');
        else if (op.startsWith('remove_prefix:')) {
          const p = op.slice('remove_prefix:'.length);
          if (s.startsWith(p)) s = s.slice(p.length);
        } else if (op.startsWith('remove_suffix:')) {
          const p = op.slice('remove_suffix:'.length);
          if (s.endsWith(p)) s = s.slice(0, -p.length);
        } else if (op.startsWith('parse_date:')) {
          const fmt = op.slice('parse_date:'.length);
          const d = getFormatter(fmt)(s);
          s = d ? d.toISOString() : '';
        } else if (op === 'to_amount') {
          const n = toNumber(s);
          s = n != null ? n.toString() : '';
        } else if (op === 'abs') {
          if (s.startsWith('-')) s = s.slice(1);
        } else if (op === 'decimal_sep_dot') {
          s = s.replace(/,/g, '.');
        } else if (op === 'decimal_sep_comma') {
          s = s.replace(/\./g, ',');
        } else if (op === 'remove_spaces') {
          s = s.replace(/\s+/g, '');
        }
      }
      return s;
    };

    const getAmount = (row: Record<string, string>, col: string | null, file: 'A' | 'B'): number | null => {
      if (!col) return null;
      const v = row[col];
      if (!v) return null;
      return toNumber(normalize(v, file, col));
    };

    const getDate = (row: Record<string, string>, col: string | null, file: 'A' | 'B'): Date | null => {
      if (!col) return null;
      const v = row[col];
      if (!v) return null;
      const normalized = normalize(v, file, col);
      return normalized ? new Date(normalized) : null;
    };

    const getKey = (row: Record<string, string>, keys: Array<{ a: string; b: string }>, file: 'A' | 'B'): string | null => {
      let out = '';
      for (const k of keys) {
        const col = file === 'A' ? k.a : k.b;
        const v = normalize(row[col] || '', file, col);
        if (!v) return null;
        out += v + '\u0001';
      }
      return out;
    };

    const usedA = new Array(dataA.length).fill(false);
    const usedB = new Array(dataB.length).fill(false);
    const matches: Array<{ indexA: number; indexB: number; pass: number; confidence: number }> = [];
    const matchesByPass = new Map<number, number>();

    for (const pass of plan.passes.sort((a, b) => a.order - b.order)) {
      const indexB = new Map<string, number[]>();
      for (let j = 0; j < dataB.length; j++) {
        if (usedB[j]) continue;
        const k = getKey(dataB[j], pass.keys, 'B');
        if (k) indexB.set(k, [...(indexB.get(k) || []), j]);
      }

      for (let i = 0; i < dataA.length; i++) {
        if (usedA[i]) continue;
        const k = getKey(dataA[i], pass.keys, 'A');
        if (!k) continue;

        const candidates = indexB.get(k) || [];
        if (!candidates.length) continue;

        let bestIdx = -1;
        let bestScore = Infinity;

        for (const j of candidates) {
          let score = 0;
          let ok = true;

          if (pass.tolerances.amount != null) {
            const amtA = getAmount(dataA[i], plan.analysis.fileA.amountColumn, 'A');
            const amtB = getAmount(dataB[j], plan.analysis.fileB.amountColumn, 'B');
            if (amtA == null || amtB == null) {
              ok = false;
            } else {
              const diff = Math.abs(amtA - amtB);
              if (diff > pass.tolerances.amount) ok = false;
              else score += diff;
            }
          }

          if (ok && pass.tolerances.dateMinutes != null) {
            const dtA = getDate(dataA[i], plan.analysis.fileA.dateColumn, 'A');
            const dtB = getDate(dataB[j], plan.analysis.fileB.dateColumn, 'B');
            if (!dtA || !dtB) ok = false;
            else {
              const gap = Math.abs(dtA.getTime() - dtB.getTime()) / 60000;
              if (gap > pass.tolerances.dateMinutes) ok = false;
              else score += gap;
            }
          }

          if (ok && score < bestScore) {
            bestScore = score;
            bestIdx = j;
          }
        }

        if (bestIdx >= 0) {
          usedA[i] = true;
          usedB[bestIdx] = true;
          matches.push({ indexA: i, indexB: bestIdx, pass: pass.order, confidence: pass.confidence });
          matchesByPass.set(pass.order, (matchesByPass.get(pass.order) || 0) + 1);
        }
      }
    }

    const orphansA: number[] = [];
    const orphansB: number[] = [];
    for (let i = 0; i < dataA.length; i++) if (!usedA[i]) orphansA.push(i);
    for (let j = 0; j < dataB.length; j++) if (!usedB[j]) orphansB.push(j);

    return { matches, orphansA, orphansB, matchesByPass };
  }

  diagnoseOrphans(
    plan: ReconciliationPlan,
    dataA: Record<string, string>[],
    dataB: Record<string, string>[],
    orphansA: number[],
    orphansB: number[],
    sampleSize = 30
  ): Array<{ cause: string; estimatedCount: number }> {
    const diagnostics: Array<{ cause: string; estimatedCount: number }> = [];

    const sampleA = orphansA.slice(0, sampleSize).map((i) => dataA[i]);
    const sampleB = orphansB.slice(0, sampleSize).map((i) => dataB[i]);

    const amtA = plan.analysis.fileA.amountColumn;
    const amtB = plan.analysis.fileB.amountColumn;
    const dateA = plan.analysis.fileA.dateColumn;
    const dateB = plan.analysis.fileB.dateColumn;

    if (amtA && amtB) {
      let feeCount = 0;
      for (const row of sampleA) {
        const v = toNumber(row[amtA] || '');
        if (v != null && v < 1000 && v > 0) feeCount++;
      }
      if (feeCount > sampleA.length * 0.2) {
        diagnostics.push({ cause: 'Écart probable de frais/commissions (montants petits)', estimatedCount: Math.round(orphansA.length * (feeCount / sampleA.length)) });
      }
    }

    if (dateA && dateB) {
      let dateShiftCount = 0;
      for (const row of sampleA) {
        const v = row[dateA];
        if (!v) continue;
        const d = getFormatter(plan.analysis.fileA.dateColumn ? 'dd/MM/yyyy' : 'yyyy-MM-dd')(v);
        if (d) dateShiftCount++;
      }
      if (dateShiftCount > sampleA.length * 0.3) {
        diagnostics.push({ cause: 'Décalage de date (jour ouvré vs jour calendrier, fuseau horaire)', estimatedCount: Math.round(orphansA.length * 0.3) });
      }
    }

    const idMap = plan.columnMappings.find((m) => m.nature === 'id');
    if (idMap) {
      let formatMismatch = 0;
      const valsA = new Set(sampleA.map((r) => r[idMap.a]?.trim()).filter(Boolean));
      const valsB = new Set(sampleB.map((r) => r[idMap.b]?.trim()).filter(Boolean));
      for (const v of valsA) {
        const cleaned = v.replace(/[^A-Za-z0-9]/g, '');
        if (cleaned !== v && valsB.has(cleaned)) formatMismatch++;
      }
      if (formatMismatch > sampleA.length * 0.2) {
        diagnostics.push({ cause: 'Différence de format identifiant (tirets, espaces, préfixes)', estimatedCount: Math.round(orphansA.length * (formatMismatch / sampleA.length)) });
      }
    }

    const statusA = plan.analysis.fileA.statusColumn;
    const statusB = plan.analysis.fileB.statusColumn;
    if (statusA && statusB) {
      let failedCount = 0;
      for (const row of sampleA) {
        const s = (row[statusA] || '').toLowerCase();
        if (s.includes('fail') || s.includes('annul') || s.includes('reject') || s.includes('echec')) failedCount++;
      }
      if (failedCount > 0) {
        diagnostics.push({ cause: 'Transactions échouées/annulées côté BO sans correspondance partenaire', estimatedCount: failedCount });
      }
    }

    const totalOrphans = orphansA.length + orphansB.length;
    const explained = diagnostics.reduce((s, d) => s + d.estimatedCount, 0);
    if (totalOrphans > explained) {
      diagnostics.push({ cause: 'Autres (clé manquante, doublons N-N, lignes totaux/en-tête)', estimatedCount: totalOrphans - explained });
    }

    return diagnostics;
  }
}