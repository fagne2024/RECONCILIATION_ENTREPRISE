import { readCsvFileUltraFast } from './fast-csv-reader.util';

describe('readCsvFileUltraFast - diffusion des lignes (onRow)', () => {
  it('envoie chaque ligne au callback onRow et ne renvoie pas de tableau de lignes', async () => {
    const csv = 'Reference;Montant;Statut\nR1;10;OK\nR2;20;KO\nR3;30;OK\n';
    const file = new File([csv], 'test.csv', { type: 'text/csv' });
    const received: Record<string, string>[] = [];

    const result = await readCsvFileUltraFast(file, {
      stripAirtelPreamble: false,
      onRow: (row) => { received.push(row); }
    });

    expect(received.length).toBe(3);
    expect(received[0]).toEqual({ Reference: 'R1', Montant: '10', Statut: 'OK' });
    expect(received[2]['Reference']).toBe('R3');
    expect(result.rows).toEqual([]);
  });

  it('sans onRow, renvoie toujours les lignes dans rows (comportement inchangé)', async () => {
    const csv = 'Reference;Montant\nR1;10\nR2;20\n';
    const file = new File([csv], 'test.csv', { type: 'text/csv' });

    const result = await readCsvFileUltraFast(file, { stripAirtelPreamble: false });

    expect(result.rows.length).toBe(2);
    expect(result.rows[1]).toEqual({ Reference: 'R2', Montant: '20' });
  });
});
