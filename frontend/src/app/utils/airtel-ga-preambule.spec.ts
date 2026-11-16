import { TextDecoder as NodeTextDecoder } from 'util';
import { readCsvFileUltraFast } from './fast-csv-reader.util';
import { planColumnNormalization, applyColumnNormalizationPlanAsync } from './model-column-normalization.util';
import { ModelPreProcessingService } from '../services/model-preprocessing.service';

// jsdom ne fournit ni TextDecoder ni Blob.text() (disponibles dans les navigateurs).
if (typeof (globalThis as any).TextDecoder === 'undefined') {
  (globalThis as any).TextDecoder = NodeTextDecoder;
}
if (!(Blob.prototype as any).text) {
  (Blob.prototype as any).text = function (this: Blob) {
    return new Promise<string>(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(this);
    });
  };
}

/** Export Airtel GA : 3 lignes de métadonnées, en-tête en ligne 5, marqueur [STARTDATA]. */
const AIRTEL_GA = [
  '',
  ' Present Date and Time=16/11/26 02:01:08',
  ' File Number=1',
  'To Date= 16/11/2026 From Date= 15/11/2026',
  'Transfer ID,Sender,Transaction Amount,Transfer On,Transaction Type,Receiver,Service Name,Transfer Status,Reference Number,Previous Balance,Post Balance',
  '[STARTDATA]',
  'MP261115.0000.B76423,076427270,2500,15/11/2026 00:00:02 AM,MR,077665971,Deposit money,Transaction Success,1794697194476,113106292.825,113108792.825',
  'CI261115.0001.A63963,077665971,3000,15/11/2026 00:01:10 AM,MP,074375929,Pay money,Transaction Success,disburs-BKP0KDLEL9-1794697270055,113124607.825,113121607.825',
  'MP261115.0002.X00001,077000000,500,15/11/2026 00:02:00 AM,CP,077665971,Deposit money,Transaction Failed,1794697355000,1,1'
].join('\r\n');

const TEMPLATE = ['ID PARTENAIRE', 'Telephone envoi', 'Montant', 'Date', 'Telephone recu', 'Statut transaction', 'Token GU', 'SERVICE', 'Type de service'];
const EQUIVALENCES = ([
  ['ID PARTENAIRE', ['Transfer ID', 'Transaction ID']],
  ['Telephone envoi', ['Sender', 'Sender Msisdn']],
  ['Montant', ['Transaction Amount']],
  ['Date', ['Transfer On', 'Transaction Date and Time']],
  ['Telephone recu', ['Receiver', 'Receiver Msisdn']],
  ['Statut transaction', ['Transfer Status', 'Transaction Status']],
  ['Token GU', ['Reference Number']],
  ['SERVICE', ['Transaction Type']],
  ['Type de service', ['Service Name']]
] as [string, string[]][]).map(([columnName, equivalents]) => ({ columnName, equivalents, modelId: 'airtelga1' }));

const CONFIG: any = {
  rowFilters: [
    { id: 'filter-1', column: 'SERVICE', selectedValues: ['MP', 'MR'], enabled: true },
    { id: 'filter-2', column: 'Statut transaction', selectedValues: ['Transaction Success'], enabled: true }
  ]
};

async function lireEtNormaliser(equivalences = EQUIVALENCES): Promise<Record<string, string>[]> {
  const parsed = await readCsvFileUltraFast(new File([AIRTEL_GA], 'AIRTELGA.csv'), {
    stripAirtelPreamble: true,
    expectedHeaderColumns: TEMPLATE
  });
  const plan = planColumnNormalization(Object.keys(parsed.rows[0]), equivalences as any, TEMPLATE);
  return applyColumnNormalizationPlanAsync(parsed.rows, plan, {});
}

describe('Airtel GA avec préambule (modèle AIRTELGA1)', () => {
  const service = new ModelPreProcessingService();

  it('ignore les lignes de métadonnées et [STARTDATA], puis garde les transactions réussies MP/MR', async () => {
    const rows = await lireEtNormaliser();
    expect(rows.length).toBe(3);
    expect(rows[0]['ID PARTENAIRE']).toBe('MP261115.0000.B76423');
    expect(service.applyRowFilters(rows, CONFIG.rowFilters).length).toBe(2);
  });

  it('explique un résultat vide : colonne de filtre absente (équivalent manquant)', async () => {
    const sansService = EQUIVALENCES.filter(eq => eq.columnName !== 'SERVICE');
    const rows = await lireEtNormaliser(sansService);
    expect(service.applyRowFilters(rows, CONFIG.rowFilters).length).toBe(0);
    // Traductions non chargées sous Jest : I18nService.t renvoie la clé.
    expect(service.describeEmptyRowFilterResult(rows, CONFIG)).toBe('FU.msg.filtreColonneAbsente');
  });

  it('explique un résultat vide : valeurs présentes différentes des valeurs attendues', async () => {
    const rows = await lireEtNormaliser();
    const config = { rowFilters: [{ id: 'f', column: 'SERVICE', selectedValues: ['XX'], enabled: true }] } as any;
    expect(service.describeEmptyRowFilterResult(rows, config)).toBe('FU.msg.filtreAucuneValeur');
    expect(service.describeEmptyRowFilterResult(rows, CONFIG)).toBe('');
  });
});
