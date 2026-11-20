import {
  applyColumnNormalizationPlanAsync,
  describeColumnNormalization,
  expandConditionValuesWithMappings,
  renameHeaders,
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

  it('un en-tête du fichier est renommé une fois, puis copié pour les autres colonnes', () => {
    const plan = planColumnNormalization(['ID'], [
      { columnName: 'A', equivalents: ['ID'] },
      { columnName: 'B', equivalents: ['ID'] }
    ]);
    expect(plan.renames).toEqual([{ from: 'ID', to: 'A' }]);
    expect(plan.copies).toEqual([{ from: 'ID', to: 'B' }]);
    expect(plan.missing).toEqual([]);
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

describe('Normalisation modèle : deux équivalents présents (A et B) pour une même colonne', () => {
  const config: ModelColumnEquivalence[] = [
    { columnName: 'Agence', equivalents: ['Code agence', 'Agency'] }
  ];

  it('A est renommée en Agence et ses lignes vides sont complétées par B', async () => {
    const rows = [
      { ID: '1', 'Code agence': 'AG01', Agency: '' },
      { ID: '2', 'Code agence': '', Agency: 'AG02' },
      { ID: '3', 'Code agence': '   ', Agency: 'AG03' },
      { ID: '4', 'Code agence': '', Agency: '' }
    ];
    const plan = planColumnNormalization(Object.keys(rows[0]), config);

    expect(plan.renames).toEqual([{ from: 'Code agence', to: 'Agence', fillFrom: ['Agency'] }]);
    expect(plan.missing).toEqual([]);

    const out = await applyColumnNormalizationPlanAsync(rows, plan);

    expect(out.map(r => r['Agence'])).toEqual(['AG01', 'AG02', 'AG03', '']);
    // B est fusionnée dans Agence : plus de colonne en double.
    expect(Object.keys(out[0])).toEqual(['ID', 'Agence']);
    expect(renameHeaders(['ID', 'Code agence', 'Agency'], plan)).toEqual(['ID', 'Agence']);
    expect(describeColumnNormalization(plan)).toContain('« Code agence » + « Agency » → « Agence »');
  });

  it('A renseignée garde la priorité sur B (ordre de configuration)', async () => {
    const rows = [{ 'Code agence': 'AG01', Agency: 'AUTRE' }];
    const plan = planColumnNormalization(Object.keys(rows[0]), config);
    const out = await applyColumnNormalizationPlanAsync(rows, plan);
    expect(out[0]).toEqual({ Agence: 'AG01' });
  });

  it('un seul équivalent présent : simple renommage, sans fusion', () => {
    const plan = planColumnNormalization(['Agency', 'ID'], config);
    expect(plan.renames).toEqual([{ from: 'Agency', to: 'Agence' }]);
    expect(plan.renames[0].fillFrom).toBeUndefined();
  });

  it('la colonne Agence déjà présente n’est jamais touchée', () => {
    const plan = planColumnNormalization(['Agence', 'Code agence', 'Agency'], config);
    expect(plan.renames).toEqual([]);
  });
});

describe('Normalisation modèle : choix de l’équivalent par condition', () => {
  const config: ModelColumnEquivalence[] = [
    {
      columnName: 'Montant',
      equivalents: ['Montant CI', 'Montant CO'],
      conditions: [
        { column: 'Service', values: ['CASHIN_OM', 'CASHIN_MOMO'], source: 'Montant CI' },
        { column: 'Service', values: ['cashout_om'], source: 'Montant CO' }
      ]
    }
  ];
  const headers = ['ID', 'Service', 'Montant CI', 'Montant CO'];

  it('prend A ou B selon la valeur de la colonne de condition ; vide si aucune condition vérifiée', async () => {
    const plan = planColumnNormalization(headers, config);
    const rows = await applyColumnNormalizationPlanAsync([
      { ID: '1', Service: 'CASHIN_OM', 'Montant CI': '100', 'Montant CO': '900' },
      { ID: '2', Service: ' CashOut_OM ', 'Montant CI': '100', 'Montant CO': '900' },
      { ID: '3', Service: 'AUTRE', 'Montant CI': '', 'Montant CO': '700' },
      { ID: '4', Service: 'CASHOUT_OM', 'Montant CI': '100', 'Montant CO': '' }
    ], plan);
    expect(rows.map(r => r['Montant'])).toEqual(['100', '900', '', '']);
    expect(Object.keys(rows[0])).toEqual(['ID', 'Service', 'Montant']);
  });

  it('colonne de condition elle-même obtenue par équivalence', async () => {
    const plan = planColumnNormalization(['Type', 'Montant CI', 'Montant CO'], [
      ...config,
      { columnName: 'Service', equivalents: ['Type'] }
    ]);
    const rows = await applyColumnNormalizationPlanAsync([
      { Type: 'CASHOUT_OM', 'Montant CI': '100', 'Montant CO': '900' }
    ], plan);
    expect(rows[0]).toEqual({ Service: 'CASHOUT_OM', Montant: '900' });
  });
});

describe('Normalisation modèle : un même en-tête équivalent de plusieurs colonnes', () => {
  it('« Montant » alimente « Montant CI » (renommage) et « Montant CO » (copie)', async () => {
    const plan = planColumnNormalization(['ID', 'Montant'], [
      { columnName: 'Montant CI', equivalents: ['Montant'] },
      { columnName: 'Montant CO', equivalents: ['Montant'] }
    ]);
    expect(plan.renames).toEqual([{ from: 'Montant', to: 'Montant CI' }]);
    expect(plan.copies).toEqual([{ from: 'Montant', to: 'Montant CO' }]);
    const rows = await applyColumnNormalizationPlanAsync([{ ID: '1', Montant: '500' }], plan);
    expect(rows[0]).toEqual({ ID: '1', 'Montant CI': '500', 'Montant CO': '500' });
    expect(renameHeaders(['ID', 'Montant'], plan)).toEqual(['ID', 'Montant CI', 'Montant CO']);
  });

  it('avec conditions : chaque colonne reçoit « Montant » seulement pour son service', async () => {
    const plan = planColumnNormalization(['Service', 'Montant'], [
      { columnName: 'Montant CI', equivalents: ['Montant'], conditions: [{ column: 'Service', values: ['CASHIN'], source: 'Montant' }] },
      { columnName: 'Montant CO', equivalents: ['Montant'], conditions: [{ column: 'Service', values: ['CASHOUT'], source: 'Montant' }] }
    ]);
    const rows = await applyColumnNormalizationPlanAsync([
      { Service: 'CASHIN', Montant: '100' },
      { Service: 'CASHOUT', Montant: '200' }
    ], plan);
    expect(rows).toEqual([
      { Service: 'CASHIN', 'Montant CI': '100', 'Montant CO': '' },
      { Service: 'CASHOUT', 'Montant CI': '', 'Montant CO': '200' }
    ]);
  });
});

describe('Normalisation modèle : cas Orange (Montant CI / Montant CO selon le service)', () => {
  const config: ModelColumnEquivalence[] = [
    { columnName: 'Montant CI', equivalents: ['Débit', 'Transfer Amount', 'Montant'],
      conditions: [{ column: 'Service', values: ['CASHIN_OM'], source: 'Montant' }] },
    { columnName: 'Montant CO', equivalents: ['Crédit', 'TRANSFER_AMOUNT', 'Montant'],
      conditions: [{ column: 'Service', values: ['PAIEMENTMARCHAND_OM'], source: 'Montant' }] }
  ];

  it('un seul équivalent présent : la condition s’applique quand même (plus les mêmes montants partout)', async () => {
    const plan = planColumnNormalization(['Service', 'Montant'], config);
    const rows = await applyColumnNormalizationPlanAsync([
      { Service: 'CASHIN_OM', Montant: '15000' },
      { Service: 'PAIEMENTMARCHAND_OM', Montant: '2500' },
      { Service: 'AUTRE', Montant: '7' }
    ], plan);
    expect(rows).toEqual([
      { Service: 'CASHIN_OM', 'Montant CI': '15000', 'Montant CO': '' },
      { Service: 'PAIEMENTMARCHAND_OM', 'Montant CI': '', 'Montant CO': '2500' },
      { Service: 'AUTRE', 'Montant CI': '', 'Montant CO': '' }
    ]);
  });

  it('valeur d’origine du fichier reconnue via le renommage de valeurs du modèle (Cash in → CASHIN_OM)', async () => {
    const expanded = expandConditionValuesWithMappings(config, [
      { column: 'Service', fromValue: 'Cash in', toValue: 'CASHIN_OM', enabled: true },
      { column: 'Service', fromValue: 'Merchant Payment', toValue: 'PAIEMENTMARCHAND_OM', enabled: true },
      { column: 'Autre', fromValue: 'Cash in', toValue: 'X', enabled: true }
    ]);
    expect(expanded[0].conditions![0].values).toEqual(['CASHIN_OM', 'Cash in']);
    const plan = planColumnNormalization(['Service', 'Montant'], expanded);
    const rows = await applyColumnNormalizationPlanAsync([
      { Service: 'Cash in', Montant: '15000' },
      { Service: 'Merchant Payment', Montant: '2500' }
    ], plan);
    expect(rows.map(r => [r['Montant CI'], r['Montant CO']])).toEqual([['15000', ''], ['', '2500']]);
  });
});
