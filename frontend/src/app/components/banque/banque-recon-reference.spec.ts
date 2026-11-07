// ExcelJS (via uuid ESM) n'est pas transformable par Jest et n'est pas utilisé ici
jest.mock('exceljs', () => ({}));
// Service à web worker (import.meta) non compilable sous Jest, sans rapport avec l'appariement
jest.mock('../../services/column-rules-processor.service', () => ({ ColumnRulesProcessorService: class {} }));

import { EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BanqueComponent } from './banque.component';
import { SuiviCompenseOpService } from '../../services/suivi-compense-op.service';

/** Appariement prioritaire référence de l'opération ↔ libellé du relevé (étape 1 de la réconciliation). */
describe('BanqueComponent - appariement par référence', () => {
  const stub: any = {};
  let comp: any;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: SuiviCompenseOpService, useValue: {} }] });
    // Un champ du composant utilise inject() : construction dans un contexte d'injection (Angular 14.1+)
    comp = TestBed.inject(EnvironmentInjector)
      .runInContext(() => new BanqueComponent(stub, stub, stub, stub, stub, stub, stub, stub, stub));
    // Le sens dépend des règles de calcul (service distant) : fixé ici, il n'entre que dans le départage
    jest.spyOn(comp, 'determineOperationSens').mockReturnValue('credit');
  });

  const op = (id: number, reference: string, montant: number, date = '2026-11-05') => ({
    id, reference, montant, dateOperation: date, typeOperation: 'APPROVISIONNEMENT_DISTRIBUTEUR',
    bo: 'CBAO', key: `k${id}`, sensIndex: 'credit1'
  });
  const rev = (id: number, libelle: string, credit: number, date = '2026-11-05') => ({
    id, libelle, credit, debit: 0, dateValeur: date, banque: 'CBAO SN'
  });

  it('apparie la référence trouvée dans le libellé, même si montant et date diffèrent', () => {
    const o = op(1, 'SNVDMG17938-20261105AP1', 1_000_000);
    const r = rev(10, 'VIRT RECU SNVDMG17938-20261105AP1 / ORANGE', 999_000, '2026-11-06');
    const matches: Map<any, any> = comp.matchOperationsByReference([o], [r]);
    expect(matches.get(o)).toBe(r);
  });

  it('ne confond pas AP1 avec AP12 et ignore les références trop courtes', () => {
    const o1 = op(1, 'SNVDMG17938-20261105AP1', 100);
    const o2 = op(2, 'AB12', 100);
    const r = rev(10, 'VIRT SNVDMG17938-20261105AP12 AB12', 100);
    const matches: Map<any, any> = comp.matchOperationsByReference([o1, o2], [r]);
    expect(matches.size).toBe(0);
  });

  it('préfère le relevé de même montant et n’utilise chaque relevé qu’une fois', () => {
    const o1 = op(1, 'REF-000123', 500);
    const o2 = op(2, 'REF-000123', 700);
    const rA = rev(10, 'PAIEMENT REF000123', 700);
    const rB = rev(11, 'PAIEMENT REF 000123', 500);
    const matches: Map<any, any> = comp.matchOperationsByReference([o1, o2], [rA, rB]);
    expect(matches.get(o1)).toBe(rB);
    expect(matches.get(o2)).toBe(rA);
  });

  it('rapproche une compense Cameroun dont le relevé porte la banque sans pays (pays via le nom de compte)', () => {
    // Cas signalé : opération GRACE-061126CP1 / relevé ECOBANK, compte INTOUCHCM
    comp.popupService = { showWarning: jest.fn() };
    comp.operations = [{
      id: 1, pays: 'Cameroun', dateOperation: '2026-11-06T16:38:34', agence: 'GRACE', typeOperation: 'COMPENSE',
      montant: -5_500_000, reference: 'GRACE-061126CP1', bo: 'ECOBANK', statut: 'OK'
    }];
    const releve = {
      id: 10, numeroCompte: '30245006216', nomCompte: 'INTOUCHCM', banque: 'ECOBANK',
      dateComptable: '2026-11-06', dateValeur: '2026-11-06', libelle: 'GRACE-061126CP1',
      debit: 5_500_000, montant: 5_500_000, devise: 'XAF'
    };
    comp.releveRows = [releve];
    comp.releveAllRows = [releve];
    comp.releveSelectedBatchId = 'ALL';
    comp.reconPays = 'Cameroun';
    comp.reconDate = '2026-11-06';
    jest.spyOn(comp, 'updateTotalSuspensKO').mockImplementation(() => {});
    jest.spyOn(comp, 'updatePagedReconciliationResults').mockImplementation(() => {});

    comp.reconcile();

    expect(comp.matchedOperations.map((o: any) => o.id)).toEqual([1]);
    expect(comp.matchedReleves.map((r: any) => r.id)).toEqual([10]);
    expect(comp.rightOnlyReleves.length).toBe(0);

    // Vue « Résultat » : la paire est exposée, typée « par référence », sans écart de montant
    expect(comp.reconResultPairs.length).toBe(1);
    expect(comp.reconResultPairs[0].op.id).toBe(1);
    expect(comp.reconResultPairs[0].rev.id).toBe(10);
    expect(comp.reconResultPairs[0].matchBy).toBe('REFERENCE');
    expect(comp.reconResultPairs[0].ecart).toBe(0);
    expect(comp.reconResultStats).toEqual({ total: 1, parReference: 1, parCle: 0, avecEcart: 0 });
    comp.reconResultSearch = 'intouch';
    expect(comp.filteredReconResultPairs.length).toBe(1);
    comp.reconResultMatchFilter = 'CLE';
    expect(comp.filteredReconResultPairs.length).toBe(0);
  });

  it('le résultat est calculé dès le choix du pays et le popup s’ouvre sans clic sur Réconcilier', () => {
    comp.popupService = { showWarning: jest.fn() };
    comp.operations = [{
      id: 1, pays: 'Cameroun', dateOperation: '2026-11-06T16:38:34', agence: 'GRACE', typeOperation: 'COMPENSE',
      montant: -5_500_000, reference: 'GRACE-061126CP1', bo: 'ECOBANK', statut: 'OK'
    }];
    const releve = {
      id: 10, numeroCompte: '30245006216', nomCompte: 'INTOUCHCM', banque: 'ECOBANK',
      dateComptable: '2026-11-06', dateValeur: '2026-11-06', libelle: 'GRACE-061126CP1',
      debit: 5_500_000, montant: 5_500_000, devise: 'XAF'
    };
    comp.releveRows = [releve];
    comp.releveAllRows = [releve];
    comp.releveSelectedBatchId = 'ALL';
    comp.reconDate = '';
    jest.spyOn(comp, 'updateTotalSuspensKO').mockImplementation(() => {});
    jest.spyOn(comp, 'updatePagedReconciliationResults').mockImplementation(() => {});

    comp.reconPays = 'Cameroun';
    comp.onReconPaysChange();
    expect(comp.reconResultPairs.length).toBe(1);

    comp.reconResultPairs = [];
    comp.openReconResult();
    expect(comp.showReconResultPopup).toBe(true);
    expect(comp.reconResultPairs.length).toBe(1);
    expect(comp.popupService.showWarning).not.toHaveBeenCalled();

    // Lignes d'export : opération | lien | relevé
    expect(comp.buildReconResultExportRows()).toEqual([[
      '06/11/2026', 'COMPENSE', 'GRACE', 'GRACE-061126CP1', 'ECOBANK', -5_500_000,
      'Référence', 0,
      '06/11/2026', '30245006216 — INTOUCHCM', 'ECOBANK', 'GRACE-061126CP1', 5_500_000, 'Débit'
    ]]);

    // Sans données : pas d'avertissement en mode automatique, résultat vidé
    comp.operations = [];
    comp.onReconPaysChange();
    expect(comp.reconResultPairs.length).toBe(0);
    expect(comp.popupService.showWarning).not.toHaveBeenCalled();
  });

  it('les clés restantes sautent celles déjà réservées par une paire référence', () => {
    const rows = [{ d: '2026-11-05', m: 100 }];
    const keyed = comp.buildKeysWithIndexes(rows, (x: any) => ({ date: x.d, montantAbs: x.m, banque: 'CBAO', sens: 'credit' }),
      new Set<string>(['20261105100CBAOcredit1']));
    expect(keyed[0].key).toBe('20261105100CBAOcredit2');
  });
});
