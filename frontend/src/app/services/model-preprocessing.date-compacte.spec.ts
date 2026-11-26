import { ModelPreProcessingService } from './model-preprocessing.service';

describe('ModelPreProcessingService — date compacte (compactDate)', () => {
  const service = new ModelPreProcessingService();

  it('convertit AAAAMMJJHHMMSS en AAAA-MM-JJ HH:MM:SS sur les colonnes choisies', () => {
    const rows: Record<string, any>[] = [
      { Date: '20261124220323', Ref: '20261124220323' },
      { Date: '="20261124"', Ref: 'x' },
      { Date: '20260231120000', Ref: 'y' }
    ];
    service.applyFormatActions(rows, [{ type: 'compactDate', enabled: true, columns: ['Date'] }]);
    expect(rows.map(r => r['Date'])).toEqual(['2026-11-24 22:03:23', '2026-11-24', '20260231120000']);
    expect(rows[0]['Ref']).toBe('20261124220323');
  });
});
