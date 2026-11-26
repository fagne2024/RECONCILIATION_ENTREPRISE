// ExcelJS (via uuid ESM) n'est pas transformable par Jest et n'est pas utilisé ici
jest.mock('exceljs', () => ({}));
// Service à web worker (import.meta) non compilable sous Jest, sans rapport avec le sens
jest.mock('../../services/column-rules-processor.service', () => ({ ColumnRulesProcessorService: class {} }));

import { EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BanqueComponent } from './banque.component';
import { SuiviCompenseOpService } from '../../services/suivi-compense-op.service';
import { BanqueDossierLieService } from '../../services/banque-dossier-lie.service';

/**
 * Cas réel Guinée (Ecobank) : APPROVISIONNEMENT_FOURNISSEUR BOLHT-131126AP1, 679 000 776, est un
 * DÉBIT au relevé (ligne « …CONAKRYT-131126CP1… »). Tout type « APPRO » passait en crédit : la clé
 * date + montant + banque + sens ne correspondait jamais.
 */
describe('BanqueComponent - sens des approvisionnements', () => {
  const stub: any = {};
  let comp: any;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: SuiviCompenseOpService, useValue: {} }, { provide: BanqueDossierLieService, useValue: { dossierOf: () => null } }] });
    comp = TestBed.inject(EnvironmentInjector)
      .runInContext(() => new BanqueComponent(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub, stub, stub));
    // Règles de calcul : valeurs par défaut
    comp.calculService = { getList: (_code: string, fallback: string[]) => fallback };
  });

  const op = (typeOperation: string, montant: number) => ({
    id: 1, typeOperation, montant, dateOperation: '2026-11-13T22:54:22', bo: 'ECOBANKG', pays: 'GN',
    reference: 'BOLHT-131126AP1'
  });

  it('approvisionnement fournisseur = débit, distributeur = crédit', () => {
    expect(comp.determineOperationSens(op('APPROVISIONNEMENT_FOURNISSEUR', 679000776))).toBe('debit');
    expect(comp.getOperationDirection(op('APPROVISIONNEMENT_FOURNISSEUR', 679000776))).toBe('debit');
    expect(comp.determineOperationSens(op('APPROVISIONNEMENT_DISTRIBUTEUR', 178000000))).toBe('credit');
    expect(comp.getOperationDirection(op('APPROVISIONNEMENT_DISTRIBUTEUR', 178000000))).toBe('credit');
    expect(comp.determineOperationSens(op('COMPENSE', -5000))).toBe('debit');
  });

  it('la clé de l\'opération AP1 est celle de la ligne de relevé au débit', () => {
    const releve = {
      id: 453, banque: 'ECOBANKG', dateComptable: '2026-11-13', dateValeur: '2026-11-13',
      debit: 679000776, credit: null, montant: -679000776,
      libelle: 'I01ECTR263171137//5236370858//2611131OZ412:-1,CONAKRYT-131126CP1,CONAKRYT-131126CP1'
    };
    const cleOp = comp.buildBaseReconKeyForOperation(op('APPROVISIONNEMENT_FOURNISSEUR', 679000776));
    expect(cleOp).toBe(comp.buildBaseReconKeyForReleve(releve));
  });
});
