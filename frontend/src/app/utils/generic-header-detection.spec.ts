import { alignRowsToHeaders } from './row-column.util';
import { chooseBatchHeaderSet, resolveCanonicalColumnId } from './bilingual-column.util';
import { parseCsvWithHeaderPlan, readCsvContentUltraFast, resolveCsvHeaderPlan } from './fast-csv-reader.util';
import { detectGenericHeaderRowIndex, isMarkerRow } from './model-header-detection.util';

const TAB = '\t';
const HEADER = [
  'Transfer ID', 'Sender', 'Transaction Amount', 'Transfer On', 'Transaction Type', 'Receiver',
  'Service Name', 'Transfer Status', 'Reference Number', 'Previous Balance', 'Post Balance'
].join(TAB);
const DATA_1 = [
  'MP261105.0000.A92925', '77502030', '10000', '05/11/2026 00:00', 'MR', '77667104',
  'Deposit money', 'Transaction Success', '1793833192585', '143133205.915', '143143205.915'
].join(TAB);
const DATA_2 = [
  'CI261105.0000.B69620', '77667104', '6000', '05/11/2026 00:00', 'MP', '77739039',
  'Pay money', 'Transaction Success', 'disburs-ONBNCTTAGH-1793833202423', '143139305.915', '143133305.915'
].join(TAB);

/** Export « Transfer » : 3 lignes de préambule, en-tête, puis [STARTDATA] avant les données. */
const TRANSFER_EXPORT = [
  'Present Date and Time=06/11/26 02:01:18',
  'File Number=1',
  ['To Date= 06/11/2026', 'From Date= 05/11/2026'].join(TAB),
  HEADER,
  '[STARTDATA]',
  DATA_1,
  DATA_2
].join('\n');

describe('en-tête générique : préambule et lignes parasites', () => {
  it('ignore le préambule et le marqueur [STARTDATA] (lecture CSV)', async () => {
    const result = await readCsvContentUltraFast(TRANSFER_EXPORT);

    expect(result.rows.length).toBe(2);
    expect(result.rows[0]['Transfer ID']).toBe('MP261105.0000.A92925');
    expect(result.rows[0]['Post Balance']).toBe('143143205.915');
    expect(result.rows[1]['Sender']).toBe('77667104');
    expect(result.rows.some(row => row['Transfer ID'] === '[STARTDATA]')).toBe(false);
    expect(Object.keys(result.rows[0])).not.toContain('Present Date and Time=06/11/26 02:01:18');
  });

  it('choisit la tabulation même si « : » des heures fait échouer la détection par défaut', () => {
    const lines = TRANSFER_EXPORT.split('\n');
    const resolved = resolveCsvHeaderPlan(lines, ':');

    expect(resolved.delimiter).toBe(TAB);
    expect(resolved.plan.kind).toBe('generic');
    expect(resolved.plan.headerIndex).toBe(3);
  });

  it('ne modifie pas un CSV simple dont la 1re ligne est l’en-tête', async () => {
    const result = await readCsvContentUltraFast('Nom;Montant\nA;10\nB;20');

    expect(result.rows).toEqual([
      { Nom: 'A', Montant: '10' },
      { Nom: 'B', Montant: '20' }
    ]);
  });

  it('détecte l’en-tête dans une grille (automatique) et ignore les titres au-dessus', () => {
    const grid: unknown[][] = [
      ['Rapport du 05/11/2026'],
      ['Période', '05/11/2026'],
      ['Nom du compte', 'Banque', 'Montant', 'Date'],
      ['Compte A', 'BICEC', '1000', '05/11/2026'],
      ['Compte B', 'SGBC', '2000', '06/11/2026']
    ];
    expect(detectGenericHeaderRowIndex(grid)).toBe(2);
  });

  it('reconnaît une ligne marqueur isolée, pas une ligne de données', () => {
    expect(isMarkerRow(['[STARTDATA]', '', ''])).toBe(true);
    expect(isMarkerRow(['File Number=1'])).toBe(true);
    expect(isMarkerRow(['MP261105.0000.A92925', '77502030'])).toBe(false);
    expect(isMarkerRow(['12345'])).toBe(false);
  });
});

describe('paramétrage manuel des lignes (parseCsvWithHeaderPlan)', () => {
  it('prend l’en-tête à la ligne 4 et les données à partir de la ligne 6', () => {
    const table = parseCsvWithHeaderPlan(TRANSFER_EXPORT, {}, { headerLine: 4, dataStartLine: 6 });

    expect(table.headerLine).toBe(4);
    expect(table.dataStartLine).toBe(6);
    expect(table.delimiter).toBe(TAB);
    expect(table.headers[0]).toBe('Transfer ID');
    expect(table.rows.length).toBe(2);
    expect(table.rows[0]['Transfer ID']).toBe('MP261105.0000.A92925');
  });

  it('sans paramétrage, retrouve la même structure que la détection automatique', () => {
    const table = parseCsvWithHeaderPlan(TRANSFER_EXPORT);

    expect(table.headerLine).toBe(4);
    expect(table.dataStartLine).toBe(6);
    expect(table.rows.length).toBe(2);
  });

  it('ignore les lignes situées entre l’en-tête et la ligne de données choisie', () => {
    const table = parseCsvWithHeaderPlan(TRANSFER_EXPORT, {}, { headerLine: 4, dataStartLine: 7 });

    expect(table.rows.length).toBe(1);
    expect(table.rows[0]['Transfer ID']).toBe('CI261105.0000.B69620');
  });
});

describe('origine de la détection d’en-tête (headerSource)', () => {
  it('signale une détection générique pour l’export à préambule', () => {
    expect(parseCsvWithHeaderPlan(TRANSFER_EXPORT).headerSource).toBe('generic');
  });

  it('signale un en-tête non détecté quand aucune ligne ne ressemble à un en-tête', () => {
    expect(parseCsvWithHeaderPlan('1\n2\n3').headerSource).toBe('none');
  });

  it('signale un paramétrage manuel', () => {
    expect(parseCsvWithHeaderPlan(TRANSFER_EXPORT, {}, { headerLine: 4, dataStartLine: 6 }).headerSource).toBe('manual');
  });
});

const AIRTEL_HEADER = [
  'Transaction ID', 'Sender Msisdn', 'Transaction Amount', 'Transaction Date and Time', 'Transaction Type',
  'Receiver Msisdn', 'Service Name', 'Transaction Status', 'Reference Number', 'Previous Balance'
].join(TAB);
const AIRTEL_ROW = [
  'MP260409.1021.D11691', 'IND03', '2', '09-APR-26', 'CP', '77655346', 'Merchant Payment',
  'Transaction Success', '1,77573E+12', '3889032.92'
].join(TAB);

describe('modèle Airtel : synonymes des colonnes de transfert', () => {
  it('résout les libellés Airtel vers les mêmes concepts que le transfert', () => {
    expect(resolveCanonicalColumnId('Transaction ID')).toBe(resolveCanonicalColumnId('Transfer ID'));
    expect(resolveCanonicalColumnId('Sender Msisdn')).toBe(resolveCanonicalColumnId('Sender'));
    expect(resolveCanonicalColumnId('Receiver Msisdn')).toBe(resolveCanonicalColumnId('Receiver'));
    expect(resolveCanonicalColumnId('Transaction Date and Time')).toBe(resolveCanonicalColumnId('Transfer On'));
    expect(resolveCanonicalColumnId('Transaction Status')).toBe(resolveCanonicalColumnId('Transfer Status'));
  });

  it('empile le format transfert et le format Airtel sous un seul jeu de colonnes', () => {
    const transfer = parseCsvWithHeaderPlan([HEADER, DATA_1].join('\n'));
    const airtel = parseCsvWithHeaderPlan([AIRTEL_HEADER, AIRTEL_ROW].join('\n'));
    const headers = chooseBatchHeaderSet([...transfer.headers, ...airtel.headers]);
    const rows = [...alignRowsToHeaders(transfer.rows, headers), ...alignRowsToHeaders(airtel.rows, headers)];

    const idColumn = headers.find(h => resolveCanonicalColumnId(h) === resolveCanonicalColumnId('Transfer ID'))!;
    expect(headers.filter(h => resolveCanonicalColumnId(h) === resolveCanonicalColumnId('Sender')).length).toBe(1);
    expect(rows.length).toBe(2);
    expect(rows[0][idColumn]).toBe('MP261105.0000.A92925');
    expect(rows[1][idColumn]).toBe('MP260409.1021.D11691');
  });
});
