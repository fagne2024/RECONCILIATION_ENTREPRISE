import { ModelPreProcessingService } from './model-preprocessing.service';
import { ModelFormatAction } from './auto-processing.service';

describe('ModelPreProcessingService — décalage horaire (timezoneShift)', () => {
  const service = new ModelPreProcessingService();

  it('décale chaque ligne selon le pays de la colonne Pays (TRXGU1)', () => {
    const rows = [
      { Date: '15/11/2026 23:30:00', Pays: 'CM' },
      { Date: '16/11/2026 00:10:00', Pays: 'GA' },
      { Date: '15/11/2026 22:00:00', Pays: 'KE' },
      { Date: '15/11/2026 23:30:00', Pays: 'SN' },
      { Date: '15/11/2026 23:30:00', Pays: 'XX' }
    ];
    const action: ModelFormatAction = {
      type: 'timezoneShift',
      enabled: true,
      columns: ['Date'],
      timezoneCountry: 'column',
      timezoneCountryColumn: 'Pays',
      timezoneToReference: false
    };

    service.applyFormatActions(rows, [action]);

    expect(rows.map(r => r.Date)).toEqual([
      '16/11/2026 00:30:00',
      '16/11/2026 01:10:00',
      '16/11/2026 01:00:00',
      '15/11/2026 23:30:00',
      '15/11/2026 23:30:00'
    ]);
  });

  it('applique un décalage fixe quand un pays est choisi', () => {
    const rows = [{ Date: '2026-11-15 23:00:00' }];
    service.applyFormatActions(rows, [{
      type: 'timezoneShift',
      enabled: true,
      columns: ['Date'],
      timezoneCountry: 'CM',
      timezoneToReference: false
    }]);
    expect(rows[0].Date).toBe('2026-11-16 00:00:00');
  });
});
