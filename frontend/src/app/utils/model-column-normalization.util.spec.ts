import {
  applyColumnNormalizationPlanAsync,
  describeColumnNormalization,
  listColumnsOutsideModel,
  ModelColumnEquivalence,
  planColumnNormalization,
  templateCoverage
} from './model-column-normalization.util';

describe('Normalisation modèle : en-têtes équivalents', () => {
  const trxbo: ModelColumnEquivalence[] = [
    { columnName: 'Numéro Trans GU', equivalents: ['Num Trans GU', 'ID'] },
    { columnName: 'Agence', equivalents: ['Agency', 'Client'] },
    { columnName: 'montant', equivalents: ['amount'] }
  ];

  it('même fichier en anglais : les colonnes sont renommées avec les noms par défaut', async () => {
    const rows = [{ 'Num Trans GU': '1794', 'Agency': 'A1', 'amount': '100', 'Service': 'S' }];
    const plan = planColumnNormalization(Object.keys(rows[0]), trxbo);
    expect(plan.missing).toEqual([]);
    const out = await applyColumnNormalizationPlanAsync(rows, plan);
    expect(out[0]).toEqual({ 'Numéro Trans GU': '1794', 'Agence': 'A1', 'montant': '100', 'Service': 'S' });
    expect(Object.keys(out[0])).toEqual(['Numéro Trans GU', 'Agence', 'montant', 'Service']);
  });

  it('nouveau fichier : ID → Numéro Trans GU, Client → Agence, montant inchangé', async () => {
    const rows = [{ ID: '1794', Client: 'A1', Montant: '100' }];
    const plan = planColumnNormalization(Object.keys(rows[0]), trxbo);
    expect(plan.renames).toEqual([
      { from: 'ID', to: 'Numéro Trans GU' },
      { from: 'Client', to: 'Agence' }
    ]);
    const out = await applyColumnNormalizationPlanAsync(rows, plan);
    expect(out[0]).toEqual({ 'Numéro Trans GU': '1794', Agence: 'A1', Montant: '100' });
  });

  it('ne touche pas une colonne par défaut déjà présente (casse et accents ignorés)', () => {
    const plan = planColumnNormalization(['numero trans gu', 'ID', 'Agence'], trxbo);
    expect(plan.renames).toEqual([]);
  });

  it('signale les colonnes introuvables', () => {
    const plan = planColumnNormalization(['Service'], trxbo);
    expect(plan.missing).toEqual(['Numéro Trans GU', 'Agence', 'montant']);
    expect(describeColumnNormalization(plan)).toContain('« Agence »');
  });

  it('un en-tête du fichier ne sert qu’une fois', () => {
    const plan = planColumnNormalization(['ID'], [
      { columnName: 'A', equivalents: ['ID'] },
      { columnName: 'B', equivalents: ['ID'] }
    ]);
    expect(plan.renames).toEqual([{ from: 'ID', to: 'A' }]);
    expect(plan.missing).toEqual(['B']);
  });
});

describe('Normalisation modèle : configuration AIRTELGA réelle sur le fichier Airtel', () => {
  // Configuration enregistrée en base (Configuration > Normalisation modèle) au 2026-11-10.
  const airtel: ModelColumnEquivalence[] = [
    { columnName: 'Transaction ID', equivalents: ['Transfer ID'] },
    { columnName: 'Sender MSISDN', equivalents: ['Sender'] },
    { columnName: 'Receiver MSISDN', equivalents: ['Receiver'] },
    { columnName: 'Transaction Date', equivalents: ['Transfer On'] },
    { columnName: 'Service Charge', equivalents: ['Service Name'] },
    { columnName: 'Status', equivalents: ['Transaction Status', 'Transfer Status'] }
  ];
  // En-têtes du fichier partenaire Airtel reçu (logs de réconciliation du 2026-11-10).
  const headers = [
    'Transaction ID', 'Sender Msisdn', 'Receiver Msisdn', 'Transaction Amount', 'Previous Balance',
    'Reference Number', 'Transaction Date and Time', 'SERVICE', 'Service Name', 'Transaction Status'
  ];

  it('colonnes déjà présentes (casse ignorée) intactes, équivalents trouvés, manquantes signalées', () => {
    const plan = planColumnNormalization(headers, airtel);
    expect(plan.renames).toEqual([
      { from: 'Service Name', to: 'Service Charge' },
      { from: 'Transaction Status', to: 'Status' }
    ]);
    expect(plan.missing).toEqual(['Transaction Date']);
  });

  it('un équivalent trouvé est toujours renommé (jamais copié) : le fichier exporté porte la colonne d’origine', async () => {
    const plan = planColumnNormalization(headers, airtel);
    const rows = [{ 'Service Name': 'Cash In', 'Transaction Status': 'TS', 'Reference Number': 'R' }];
    const out = await applyColumnNormalizationPlanAsync(rows, plan);
    expect(out[0]).toEqual({ 'Service Charge': 'Cash In', 'Status': 'TS', 'Reference Number': 'R' });
    expect(Object.keys(out[0])).toEqual(['Service Charge', 'Status', 'Reference Number']);
    expect(describeColumnNormalization(plan)).not.toContain('copie');
  });
});

describe('Régression AIRTELGA : les colonnes du vrai fichier modèle ne sont jamais renommées', () => {
  // Configuration enregistrée à partir de la liste générique Airtel (et non du vrai fichier).
  const saved: ModelColumnEquivalence[] = [
    { columnName: 'Service Charge', equivalents: ['Service Name'] },
    { columnName: 'Status', equivalents: ['Transaction Status', 'Transfer Status'] },
    { columnName: 'Transaction Date', equivalents: ['Transfer On'] }
  ];
  // En-tête de watch-folder/INTOUCH/AIRTELGA.csv (fichier modèle du modèle AIRTELGA).
  const template = [
    'S. No.', 'Transaction ID', 'Sender Msisdn', 'Transaction Amount', 'Transaction Date and Time',
    'Transaction Type', 'Receiver Msisdn', 'Service Name', 'Transaction Status', 'Reference Number',
    'Previous Balance', 'Post Balance', 'external_transaction_id'
  ];

  it('sans le fichier modèle comme référence, Service Name et Transaction Status disparaissaient', async () => {
    const rows = [Object.fromEntries(template.map(h => [h, h]))];
    const plan = planColumnNormalization(template, saved);
    const out = await applyColumnNormalizationPlanAsync(rows, plan);
    expect(Object.keys(out[0])).not.toContain('Transaction Status');
    expect(Object.keys(out[0])).not.toContain('Service Name');
  });

  it('avec le fichier modèle comme référence, ses colonnes sont conservées et l’erreur signalée', async () => {
    const rows = [Object.fromEntries(template.map(h => [h, h]))];
    const plan = planColumnNormalization(template, saved, template);
    const out = await applyColumnNormalizationPlanAsync(rows, plan);
    expect(Object.keys(out[0])).toEqual(template);
    expect(plan.renames).toEqual([]);
    expect(plan.ignored.map(r => r.from)).toEqual(['Service Name', 'Transaction Status']);
    expect(describeColumnNormalization(plan)).toContain('Équivalents ignorés');
  });
});

describe('Normalisation AIRTELGA : fichier au format « Transfer »', () => {
  // Configuration actuelle (colonnes d'origine = vrai fichier modèle AIRTELGA.csv).
  const config: ModelColumnEquivalence[] = [
    { columnName: 'Transaction ID', equivalents: ['Transfer ID'] },
    { columnName: 'Sender Msisdn', equivalents: ['Sender'] },
    { columnName: 'Receiver Msisdn', equivalents: ['Receiver'] },
    { columnName: 'Transaction Date and Time', equivalents: ['Transfer On'] },
    { columnName: 'Transaction Status', equivalents: ['Transfer Status'] }
  ];
  const template = [
    'S. No.', 'Transaction ID', 'Sender Msisdn', 'Transaction Amount', 'Transaction Date and Time',
    'Transaction Type', 'Receiver Msisdn', 'Service Name', 'Transaction Status', 'Reference Number'
  ];

  it('les colonnes équivalentes prennent le libellé d’origine, dans le même ordre', async () => {
    const rows = [{
      'Transfer ID': 'MP1', Sender: '7478', Receiver: '7765', 'Transfer On': '09-APR-26',
      'Transfer Status': 'Transaction Success', 'Transaction Type': 'MR'
    }];
    const plan = planColumnNormalization(Object.keys(rows[0]), config, template);
    const out = await applyColumnNormalizationPlanAsync(rows, plan);
    expect(Object.keys(out[0])).toEqual([
      'Transaction ID', 'Sender Msisdn', 'Receiver Msisdn', 'Transaction Date and Time',
      'Transaction Status', 'Transaction Type'
    ]);
    // Le filtre du modèle « Transaction Status = Transaction Success » s'applique donc aussi.
    expect(out[0]['Transaction Status']).toBe('Transaction Success');
    expect(plan.ignored).toEqual([]);
  });
});

describe('Colonnes du modèle : les colonnes en plus du fichier chargé sont ignorées', () => {
  // En-tête de watch-folder/INTOUCH/TRXBOTest.csv.
  const template = [
    'ID Partenaire', 'Téléphone client', 'Montant', 'Service', 'Agence', 'Date', 'Token GU', 'Pays', 'Status transaction'
  ];
  // TRXBO_09.csv (export anglais, 21 colonnes) après normalisation.
  const headers = [
    'ID', 'ID Partenaire', 'Téléphone client', 'Montant', 'Service', 'Payment method', 'Agence', 'Agent',
    'Agent Type', 'PIXI', 'Date', 'Token GU', 'Pays', 'Status transaction', 'Latitude', 'Longitude',
    'Partner ID DIST', 'Sender', 'Country of origin', 'Beneficiary', 'Distribution channel'
  ];

  it('liste les colonnes hors modèle (casse et accents ignorés)', () => {
    expect(listColumnsOutsideModel(headers, template)).toEqual([
      'ID', 'Payment method', 'Agent', 'Agent Type', 'PIXI', 'Latitude', 'Longitude',
      'Partner ID DIST', 'Sender', 'Country of origin', 'Beneficiary', 'Distribution channel'
    ]);
    expect(listColumnsOutsideModel(['téléphone client', 'MONTANT'], template)).toEqual([]);
  });

  it('mesure la couverture du fichier modèle', () => {
    expect(templateCoverage(headers, template)).toBe(1);
    expect(templateCoverage(['ID', 'Montant'], template)).toBeCloseTo(1 / 9);
    expect(templateCoverage(headers, [])).toBe(0);
  });
});
