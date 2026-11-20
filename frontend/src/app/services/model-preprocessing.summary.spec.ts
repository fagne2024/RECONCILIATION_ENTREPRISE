import { ModelPreProcessingService, createPreProcessingUsage } from './model-preprocessing.service';
import { ModelPreProcessingConfig } from './auto-processing.service';

describe('ModelPreProcessingService — résumé après traitement', () => {
  const service = new ModelPreProcessingService();

  const buildConfig = (): ModelPreProcessingConfig => ({
    rowFilters: [
      { column: 'Statut', selectedValues: ['Succès'], enabled: true },
      { column: 'Pays', selectedValues: ['CM', 'SN'], enabled: true }
    ],
    formatActions: [
      { type: 'removeSpaces', enabled: true, columns: ['Numero', 'Reference'], removeSpacesType: 'all' },
      { type: 'removeSpaces', enabled: true, columns: ['ColonneAbsente'], removeSpacesType: 'all' }
    ],
    valueMappings: [
      { column: 'Service', fromValue: 'CASHIN', toValue: 'Cash in', enabled: true },
      { column: 'Service', fromValue: 'INEXISTANT', toValue: 'Autre', enabled: true }
    ],
    columnRenameRules: [
      { sourceColumn: 'Numero', targetColumn: 'Téléphone', enabled: true },
      { sourceColumn: 'Absente', targetColumn: 'Autre', enabled: true }
    ]
  } as ModelPreProcessingConfig);

  const rows = () => [
    { Statut: 'Succès', Pays: 'CM', Numero: '77 000 00 00', Reference: 'ABC', Service: 'CASHIN' },
    { Statut: 'Échec', Pays: 'SN', Numero: '77 111 11 11', Reference: 'DEF', Service: 'CASHIN' }
  ];

  it('ne résume que les paramètres qui ont modifié les données', async () => {
    const config = buildConfig();
    const usage = createPreProcessingUsage();
    const input = rows();
    await service.applyPreProcessingAsync(input, config, { usage });
    const summary = service.getPreProcessingSummary(config, usage);

    // Filtre Statut : exclut une ligne ; filtre Pays : n'exclut rien.
    expect(summary.activeFilterCount).toBe(1);
    expect(usage.used.has(config.rowFilters![0])).toBe(true);
    expect(usage.used.has(config.rowFilters![1])).toBe(false);
    // Format : seule la colonne Numero est modifiée ; la colonne absente ne compte pas.
    expect(summary.activeFormatCount).toBe(1);
    expect(Array.from(usage.formatColumns.get(config.formatActions![0]) ?? [])).toEqual(['Numero']);
    // Renommage de valeurs : seul CASHIN a été trouvé.
    expect(summary.activeValueMappingCount).toBe(1);
    expect(usage.used.has(config.valueMappings![0])).toBe(true);
    // Renommage d'en-têtes : la colonne source absente n'est pas résumée.
    expect(summary.activeColumnRenameCount).toBe(1);
    expect(usage.used.has(config.columnRenameRules![0])).toBe(true);
  });

  it('sans suivi, l’aperçu liste toute la configuration active', () => {
    const summary = service.getPreProcessingSummary(buildConfig());
    expect(summary.activeFilterCount).toBe(2);
    expect(summary.activeFormatCount).toBe(2);
    expect(summary.activeValueMappingCount).toBe(2);
    expect(summary.activeColumnRenameCount).toBe(2);
  });

  it('un décalage horaire de 0 h n’est pas résumé, même si la cellule est normalisée', async () => {
    const config = {
      formatActions: [{ type: 'timezoneShift', enabled: true, columns: ['Date'], timezoneCountry: 'BF', timezoneToReference: false }]
    } as unknown as ModelPreProcessingConfig;
    const usage = createPreProcessingUsage();
    await service.applyPreProcessingAsync([{ Date: '19/11/2026 10:00:00 ' }], config, { usage });
    expect(usage.used.size).toBe(0);
  });

  it('doublons entre deux colonnes : valeurs de condition séparées par des virgules', async () => {
    const config = {
      crossDedupRules: [{
        enabled: true, columnA: 'ID Partenaire', columnB: 'Token GU', deleteSide: 'A',
        conditionColumn: 'Service', conditionOperator: 'EGAL',
        conditionValue: 'BF_CASHIN_MOBICASH_PART,BF_CASHIN_MOBICASH'
      }]
    } as unknown as ModelPreProcessingConfig;
    const usage = createPreProcessingUsage();
    const output = await service.applyPreProcessingAsync([
      { 'ID Partenaire': 'X1', 'Token GU': 'T1', Service: 'BF_CASHIN_MOBICASH' },
      { 'ID Partenaire': 'T1', 'Token GU': 'T2', Service: 'BF_CASHIN_MOBICASH_PART' },
      { 'ID Partenaire': 'X3', 'Token GU': 'T3', Service: 'AUTRE' }
    ], config, { usage });
    expect(output.map(r => r['ID Partenaire'])).toEqual(['X1', 'X3']);
    expect(usage.used.has(config.crossDedupRules![0])).toBe(true);
  });

  it('ne renvoie rien quand aucun paramètre n’a eu d’effet', async () => {
    const config = buildConfig();
    const usage = createPreProcessingUsage();
    const input = [{ Statut: 'Succès', Pays: 'CM', Telephone: '770000000', Service: 'AUTRE' }];
    const output = await service.applyPreProcessingAsync(input, config, { usage });
    expect(service.buildApplicationResult(input.length, output.length, config, usage)).toBe('');
  });
});
