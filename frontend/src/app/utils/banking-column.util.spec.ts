import { resolveColumnKeyInRow } from './row-column.util';
import { resolveCanonicalColumnId, enrichRowWithCanonicalFrenchColumns, mergeBilingualColumnsInRows } from './bilingual-column.util';
import { findHeaderRowIndexInGrid, scoreHeaderRowMatch } from './model-header-detection.util';

/** Colonnes attendues par un modèle configuré en français (relevé bancaire). */
const RELEVE_MODEL_COLUMNS_FR = [
  'Numéro de compte',
  'Nom du compte',
  'Banque',
  'Date comptable',
  'Date de valeur',
  'Libellé / Narration',
  'Débit',
  'Crédit',
  'Montant',
  'Devise'
];

const RELEVE_HEADERS_EN = [
  'Account Number',
  'Account Name',
  'Bank',
  'Accounting Date',
  'Value Date',
  'Label / Narration',
  'Debit',
  'Credit',
  'Amount',
  'Currency'
];

describe('colonnes bancaires FR / EN', () => {
  it('reconnaît un libellé anglais comme la colonne française du modèle', () => {
    expect(resolveCanonicalColumnId('Account Number')).toBe(resolveCanonicalColumnId('Numéro de compte'));
    expect(resolveCanonicalColumnId('Amount')).toBe(resolveCanonicalColumnId('Montant'));
    expect(resolveCanonicalColumnId('Value Date')).toBe(resolveCanonicalColumnId('Date de valeur'));
    expect(resolveCanonicalColumnId('Label / Narration')).toBe(resolveCanonicalColumnId('Libellé'));
  });

  it('retrouve la clé réelle d\'une ligne EN à partir du nom FR configuré dans le modèle', () => {
    const row = { 'Account Number': '1001', 'Amount': '5000', 'Value Date': '2026-01-02' };
    expect(resolveColumnKeyInRow(row, 'Numéro de compte')).toBe('Account Number');
    expect(resolveColumnKeyInRow(row, 'Montant')).toBe('Amount');
    expect(resolveColumnKeyInRow(row, 'Date de valeur')).toBe('Value Date');
  });

  it('ajoute les clés FR canoniques pour une ligne EN (règles de traitement en FR)', () => {
    const enriched = enrichRowWithCanonicalFrenchColumns({ 'Account Number': '1001', 'Amount': '5000' });
    expect(enriched['Numéro de compte']).toBe('1001');
    expect(enriched['Montant']).toBe('5000');
  });

  it('détecte la ligne d\'en-tête anglaise pour un modèle FR', () => {
    const grid: unknown[][] = [
      ['Relevé bancaire'],
      [],
      RELEVE_HEADERS_EN,
      ['1001', 'Client', 'BANQUE', '2026-01-02', '2026-01-02', 'Virement', '', '5000', '5000', 'XAF']
    ];
    expect(findHeaderRowIndexInGrid(grid, RELEVE_MODEL_COLUMNS_FR, 10)).toBe(2);
  });

  it('détecte un en-tête français pour un modèle FR (non-régression)', () => {
    expect(scoreHeaderRowMatch(RELEVE_MODEL_COLUMNS_FR, RELEVE_MODEL_COLUMNS_FR)).toBeGreaterThan(0);
  });

  it('ne fusionne pas Balance before et Balance after (colonnes distinctes)', () => {
    const row = { 'Balance before': '100', 'Balance after': '90' };
    const out = mergeBilingualColumnsInRows([row]);
    expect(out.columns).toEqual(['Balance before', 'Balance after']);
    expect(out.rows[0]['Balance before']).toBe('100');
    expect(out.rows[0]['Balance after']).toBe('90');
  });

  it('accepte un en-tête mixte FR / EN', () => {
    const mixed = ['Numéro de compte', 'Account Name', 'Banque', 'Accounting Date', 'Value Date', 'Narration', 'Debit', 'Crédit', 'Amount', 'Devise'];
    expect(scoreHeaderRowMatch(mixed, RELEVE_MODEL_COLUMNS_FR)).toBeGreaterThan(0);
  });
});

describe('colonnes du modèle opérations (EN -> FR)', () => {
  it('reconnaît les en-têtes anglais des colonnes cochées du modèle', () => {
    const pairs: [string, string][] = [
      ['Billnumber', 'Num bordereau'],
      ['network group', 'groupe de réseau'],
      ['Bank appro', 'Banque'],
      ['Applicant Login Appro', 'Demandeur'],
      ['Login validator Appro', 'Valideur'],
      ['Balance before', 'Solde avant'],
      ['Balance after', 'Solde après'],
      ['Phone', 'Téléphone'],
      ['Proprietary Code', 'Code propriétaire']
    ];
    for (const [en, fr] of pairs) {
      expect(resolveCanonicalColumnId(en)).not.toBeNull();
      expect(resolveCanonicalColumnId(en)).toBe(resolveCanonicalColumnId(fr));
    }
  });
});

describe('relevé EN + FR empilés (même concept = une colonne)', () => {
  const EN = ['Receipt No.','Completion Time','Initiation Time','Details','Transaction Status','Currency','Paid In','Withdrawn','Balance','Reason Type','Opposite Party','Linked Transaction ID','Remark'];
  const FR = ['Reçu n°',"Le temps d'achèvement","Temps d'initiation",'Des détails','Etat de la transaction','Devise','Payé en','Retiré','Solde','Type de raison','Partie adverse','Identifiant des liens de la transaction','Remarque'];

  it('reconnaît chaque libellé FR comme son équivalent EN', () => {
    EN.forEach((en, i) => {
      expect(resolveCanonicalColumnId(en)).not.toBeNull();
      expect(resolveCanonicalColumnId(FR[i])).toBe(resolveCanonicalColumnId(en));
    });
  });

  it('fusionne les deux fichiers en une colonne par concept', () => {
    const rowEn: Record<string, string> = {};
    EN.forEach((h, i) => (rowEn[h] = 'en' + i));
    const rowFr: Record<string, string> = {};
    FR.forEach((h, i) => (rowFr[h] = 'fr' + i));
    const out = mergeBilingualColumnsInRows([rowEn, rowFr]);
    expect(out.columns.length).toBe(EN.length);
    expect(out.rows.length).toBe(2);
    expect(out.rows[1][out.columns[1]]).toBe('fr1');
  });
});
