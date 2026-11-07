import { alignRowsToHeaders, filterRealDataRows } from './row-column.util';

describe('filterRealDataRows / alignRowsToHeaders (modèle à colonnes fixes)', () => {
  const modelHeaders = [
    'Transfer ID', 'Sender', 'Transaction Amount', 'Transfer On', 'Transaction Type',
    'Receiver', 'Service Name', 'Transfer Status', 'Reference Number',
    'Previous Balance', 'Post Balance'
  ];

  it('écarte le marqueur [STARTDATA] et les lignes de pied', () => {
    const rows = [
      { 'Transfer ID': '[STARTDATA]' },
      {
        'Transfer ID': 'MP261105.0000.A92925', Sender: '77502030', 'Transaction Amount': '10000',
        'Transfer On': '05/11/2026 00:00', 'Transaction Type': 'MR', Receiver: '77667104',
        'Service Name': 'Deposit money', 'Transfer Status': 'Transaction Success',
        'Reference Number': '1793833192585', 'Previous Balance': '143133205.915', 'Post Balance': '143143205.915'
      },
      { 'Transfer ID': 'Total', Sender: '1' }
    ];
    const kept = filterRealDataRows(alignRowsToHeaders(rows, modelHeaders), modelHeaders);
    expect(kept.length).toBe(1);
    expect(kept[0]['Transfer ID']).toBe('MP261105.0000.A92925');
  });

  it('rapproche une colonne légèrement renommée dans le fichier', () => {
    const row = { 'Transfer ID': 'X1', 'Sender Msisdn': '775', 'Transaction Amount': '5', 'Transfer On Date': '05/11/2026' };
    const aligned = alignRowsToHeaders([row], ['Transfer ID', 'Sender', 'Transaction Amount', 'Transfer On']);
    expect(aligned[0]['Sender']).toBe('775');
    expect(aligned[0]['Transfer On']).toBe('05/11/2026');
  });

  it('ne donne pas la même colonne du fichier à deux colonnes du modèle', () => {
    const row = { 'Transfer ID': 'X1', 'Transaction Amount': '5' };
    const aligned = alignRowsToHeaders([row], ['Transaction Amount', 'Transaction Amount Fee']);
    expect(aligned[0]['Transaction Amount']).toBe('5');
    expect(aligned[0]['Transaction Amount Fee']).toBe('');
  });

  it('garde toutes les lignes sans modèle quand aucun en-tête n’est fixé', () => {
    const rows = [{ a: '1' }, { a: '' }];
    expect(filterRealDataRows(rows, [])).toEqual(rows);
  });
});
