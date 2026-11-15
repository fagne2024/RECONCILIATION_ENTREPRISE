import { KeySuggestionService } from './key-suggestion.service';

function donnees(n: number) {
  const bo: Record<string, string>[] = [];
  const partner: Record<string, string>[] = [];
  for (let i = 0; i < n; i++) {
    const ref = 'MP2611' + (1000000000 + i);
    const montant = String(100 * ((i * 7919) % 5000 + 1));
    bo.push({ 'ID': String(i + 1), 'Numéro Trans GU': ref, 'montant': montant, 'Service': ['CASHIN', 'CASHOUT'][i % 2], 'Agence': 'AG' + (i % 40) });
    partner.push({ 'Transaction ID': 'TX' + (500000000 + i), 'Reference Number': ref, 'Transaction Amount': montant, 'Service Name': ['CASHIN', 'CASHOUT'][i % 2] });
  }
  return { bo, partner };
}

describe('KeySuggestionService', () => {
  it('propose la paire de clés de transaction', () => {
    const { bo, partner } = donnees(5000);
    const res = new KeySuggestionService().analyzeAndSuggestKeys(bo, partner);
    expect(res.recommendedKeys).toContain('Numéro Trans GU ↔ Reference Number');
  });

  it('calcule le chevauchement (Jaccard) sans copier les ensembles', () => {
    const service = new KeySuggestionService() as any;
    expect(service.calculateValueOverlap(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd']))).toBeCloseTo(2 / 4);
    expect(service.calculateValueOverlap(new Set(['a']), new Set<string>())).toBe(0);
  });

  it('deux analyses successives donnent le même résultat (caches vidés entre deux analyses)', () => {
    const { bo, partner } = donnees(2000);
    const service = new KeySuggestionService();
    const a = service.analyzeAndSuggestKeys(bo, partner).recommendedKeys;
    const b = service.analyzeAndSuggestKeys(bo, partner).recommendedKeys;
    expect(b).toEqual(a);
  });
});
