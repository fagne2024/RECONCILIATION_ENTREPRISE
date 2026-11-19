import { findTransactionAmountColumns, parseAmountValue, transactionAmountOf, tryParseAmount } from './record-amount.util';

describe('parseAmountValue / tryParseAmount', () => {
  it('conserve les zéros après la virgule des milliers', () => {
    expect(parseAmountValue('-2,531,000')).toBe(-2531000);
    expect(parseAmountValue('-195,000')).toBe(-195000);
    expect(parseAmountValue('-5,000,000')).toBe(-5000000);
    expect(parseAmountValue('-700,000')).toBe(-700000);
  });
  it('garde les décimales françaises et mixtes', () => {
    expect(parseAmountValue('139 474,44')).toBe(139474.44);
    expect(parseAmountValue('1.234,56')).toBe(1234.56);
    expect(parseAmountValue('1,234.56')).toBe(1234.56);
    expect(parseAmountValue('12,5')).toBe(12.5);
  });
  it('0 si vide ou non numérique', () => {
    expect(parseAmountValue('')).toBe(0);
    expect(parseAmountValue('abc')).toBe(0);
  });
  it('groupedThousands : « 12,500 » = 12500', () => {
    expect(tryParseAmount('12,500', { groupedThousands: true })).toBe(12500);
    expect(tryParseAmount('12,500')).toBe(12.5);
    expect(tryParseAmount('texte')).toBeNull();
  });
});

describe('findTransactionAmountColumns / transactionAmountOf (équilibre des volumes)', () => {
  it('fichier Airtel : seul « Transaction Amount », jamais les soldes ni les frais', () => {
    const headers = ['Transaction ID', 'Transaction Amount', 'Previous Balance', 'Post Balance', 'Service Charge'];
    expect(findTransactionAmountColumns(headers)).toEqual(['Transaction Amount']);
    const row = { 'Transaction ID': 'T1', 'Transaction Amount': '1500', 'Previous Balance': '90000', 'Post Balance': '88500', 'Service Charge': '50' };
    expect(transactionAmountOf(row, ['Transaction Amount'])).toBe(1500);
  });

  it('préfère la colonne « Montant » exacte (TRXBO), frais exclus', () => {
    expect(findTransactionAmountColumns(['ID', 'Frais', 'Montant', 'Montant TTC'])).toEqual(['Montant']);
  });

  it('relevé sans colonne montant : débit + crédit', () => {
    const columns = findTransactionAmountColumns(['Date', 'Libellé', 'Débit', 'Crédit', 'Solde']);
    expect(columns).toEqual(['Débit', 'Crédit']);
    expect(transactionAmountOf({ 'Débit': '', 'Crédit': '2 000,50', Solde: '10' }, columns)).toBe(2000.5);
    expect(transactionAmountOf({ 'Débit': '-300', 'Crédit': '' }, columns)).toBe(300);
  });

  it('aucune colonne montant : volume nul', () => {
    expect(findTransactionAmountColumns(['ID', 'Balance'])).toEqual([]);
    expect(transactionAmountOf({ ID: '1' }, [])).toBe(0);
  });
});
