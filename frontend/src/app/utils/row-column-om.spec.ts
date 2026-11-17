import { deduplicateHeaderNames, keepSecondDuplicateColumns, looksLikeOrangeMoneyStatement } from './row-column.util';

describe('keepSecondDuplicateColumns (relevé Orange Money)', () => {
  const headers = deduplicateHeaderNames([
    'N°', 'Référence', 'N° de Compte', 'Wallet', 'N° Pseudo', 'N° de Compte', 'Wallet', 'Débit'
  ]);

  const row = (values: string[]) => Object.fromEntries(headers.map((h, i) => [h, values[i]]));

  it('garde la 2e colonne « N° de Compte » sous son nom d\'origine, à sa position', () => {
    const rows = [row(['5', 'PP261116.1111.C54182', '656250168', 'Normal', '', '656980927', 'Normal', '30 000 000,00'])];

    const out = keepSecondDuplicateColumns(rows);

    expect(Object.keys(out[0])).toEqual(['N°', 'Référence', 'Wallet', 'N° Pseudo', 'N° de Compte', 'Wallet (2)', 'Débit']);
    expect(out[0]['N° de Compte']).toBe('656980927');
    expect(out[0]['N° de Compte (2)']).toBeUndefined();
  });

  it('laisse les lignes intactes sans doublon', () => {
    const rows = [{ 'N° de Compte': '656250168', 'Débit': '10' }];
    expect(keepSecondDuplicateColumns(rows)).toBe(rows);
  });

  it('reconnaît un relevé Orange Money par la colonne « N° Pseudo »', () => {
    expect(looksLikeOrangeMoneyStatement(headers)).toBe(true);
    expect(looksLikeOrangeMoneyStatement(['Date', 'Montant'])).toBe(false);
  });
});
