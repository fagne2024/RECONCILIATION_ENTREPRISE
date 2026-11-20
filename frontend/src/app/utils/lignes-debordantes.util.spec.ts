import { rattacherLignesDebordantes } from './lignes-debordantes.util';

const source = (rows: Record<string, string>[]) => ({ length: rows.length, at: (i: number) => rows[i] });
const ligne = (n: string, date: string, sens: string, description: string, montant: string) =>
  ({ 'N°': n, DATE: date, SENS: sens, DESCRIPTION: description, MONTANT: montant });

describe('rattacherLignesDebordantes', () => {
  it('rattache la suite de DESCRIPTION arrivée comme une nouvelle ligne', () => {
    const rows = [
      ligne('11', '11/15/26', 'Crédit', 'retrait a partir du compte 0426 - agent intouch reseau hors total', '10000'),
      ligne('2026111551.jj1623715.544 de ouedraogo 61762960', '', '', '', ''),
      ligne('12', '11/14/26', 'Crédit', 'retrait a partir du compte 0426 - agent intouch reseau hors total 2026111424.iw1623715.408 de foner sawadogo 60210404', '30000'),
      ligne('13', '11/14/26', 'Crédit', 'retrait a partir du compte 0426 - agent intouch reseau hors total 202611142.wx1623715.526 de ouedraogo 54537936', '15000')
    ];
    const { rows: out, fusions } = rattacherLignesDebordantes(source(rows));
    expect(fusions).toBe(1);
    expect(out!.length).toBe(3);
    expect(out![0]['N°']).toBe('11');
    expect(out![0].DESCRIPTION).toBe(
      'retrait a partir du compte 0426 - agent intouch reseau hors total 2026111551.jj1623715.544 de ouedraogo 61762960'
    );
    expect(out![0].MONTANT).toBe('10000');
    expect(out![1]['N°']).toBe('12');
  });

  it('complète une colonne vide de la ligne précédente (montant passé à la ligne)', () => {
    const rows = [
      ligne('11', '11/15/26', 'Crédit', 'retrait a', '10000'),
      ligne('12', '11/14/26', 'Crédit', 'retrait b', '30000'),
      ligne('13', '11/14/26', 'Crédit', 'retrait c 202611142.wx1623715.526', ''),
      ligne('de ouedraogo 54537936', '', '', '', '15000'),
      ligne('14', '11/13/26', 'Débit', 'frais', '500')
    ];
    const { rows: out, fusions } = rattacherLignesDebordantes(source(rows));
    expect(fusions).toBe(1);
    expect(out![2].DESCRIPTION).toBe('retrait c 202611142.wx1623715.526 de ouedraogo 54537936');
    expect(out![2].MONTANT).toBe('15000');
    expect(out!.length).toBe(4);
  });

  it('ne touche pas un fichier sans ligne débordante ni une ligne Total', () => {
    const rows = [
      ligne('11', '11/15/26', 'Crédit', 'retrait a', '10000'),
      ligne('12', '11/14/26', 'Crédit', 'retrait b', '30000'),
      ligne('13', '11/14/26', 'Crédit', 'retrait c', '15000'),
      ligne('', '', '', 'Total', '55000')
    ];
    expect(rattacherLignesDebordantes(source(rows))).toEqual({ rows: null, fusions: 0 });
  });
});
