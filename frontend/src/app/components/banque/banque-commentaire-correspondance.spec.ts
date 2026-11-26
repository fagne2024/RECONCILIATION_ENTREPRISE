// ExcelJS (via uuid ESM) n'est pas transformable par Jest et n'est pas utilisé ici
jest.mock('exceljs', () => ({}));
// Service à web worker (import.meta) non compilable sous Jest
jest.mock('../../services/column-rules-processor.service', () => ({ ColumnRulesProcessorService: class {} }));

import { EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BanqueComponent } from './banque.component';
import { SuiviCompenseOpService } from '../../services/suivi-compense-op.service';
import { BanqueDossierLieService } from '../../services/banque-dossier-lie.service';

/** Une ligne sans vis-à-vis commentée (hors SUSPENS_*) passe dans les correspondances. */
describe('BanqueComponent - correspondances par commentaire', () => {
  const stub: any = {};
  let comp: any;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: SuiviCompenseOpService, useValue: {} }, { provide: BanqueDossierLieService, useValue: { dossierOf: () => null } }] });
    comp = TestBed.inject(EnvironmentInjector)
      .runInContext(() => new BanqueComponent(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub, stub, stub));
  });

  it('rapproche tout commentaire non vide sauf les tags SUSPENS_', () => {
    const ok = BanqueComponent.isCommentaireCorrespondance;
    expect(ok('OK_REGUL_COMMENT')).toBe(true);
    expect(ok(' ok_frais_bancaires_autres')).toBe(true);
    expect(ok('COMPENSE CB MYTP')).toBe(true);
    expect(ok('SUSPENS_BO')).toBe(false);
    expect(ok(' suspens_bo_memo')).toBe(false);
    expect(ok('SUSPENS_RLV')).toBe(false);
    expect(ok('   ')).toBe(false);
    expect(ok('')).toBe(false);
    expect(ok(undefined)).toBe(false);
  });

  it('remonte les lignes OK_ de chaque côté, garde les suspens et relit le commentaire à jour', () => {
    // Tableaux source (commentaires à jour)
    comp.operations = [
      { id: 1, source: 'bancaire', commentaire: 'COMPENSE CB MYTP' },
      { id: 2, source: 'bancaire', commentaire: 'SUSPENS_BO' },
      { id: 3, source: 'bancaire', commentaire: '' }
    ];
    comp.releveAllRows = [{ id: 10, commentaire: 'OK_REGUL_BANQUE' }, { id: 11, commentaire: 'SUSPENS_RLV' }];
    comp.releveRows = [];
    // Copies de la réconciliation (commentaire de l'op 3 obsolète, sans effet)
    const op1 = { id: 1, source: 'bancaire', key: 'a' };
    const op2 = { id: 2, source: 'bancaire', key: 'b' };
    const rev10 = { id: 10, key: 'c' };
    const rev11 = { id: 11, key: 'd' };
    const pairOp = { id: 3, source: 'bancaire', key: 'e', commentaire: 'OK_REGUL_MONTANT' };
    const pairRev = { id: 12, key: 'e' };
    comp.reconBaseLists = {
      leftOnly: [op1, op2],
      rightOnly: [rev10, rev11],
      diffs: [{ left: op1 }, { left: op2 }, { right: rev10 }, { right: rev11 }],
      matchedOps: [pairOp],
      matchedRevs: [pairRev],
      pairs: [{ key: 'e', op: pairOp, rev: pairRev, matchBy: 'CLE', ecart: 0 }]
    };

    comp.applyCommentCorrespondances();

    expect(comp.matchedOperations).toEqual([pairOp, op1]);
    expect(comp.matchedReleves).toEqual([pairRev, rev10]);
    expect(comp.leftOnlyOperations).toEqual([op2]);
    expect(comp.rightOnlyReleves).toEqual([rev11]);
    expect(comp.reconDiffRows).toEqual([{ left: op2 }, { right: rev11 }]);
    expect(comp.isCommentMatch(op1)).toBe(true);
    expect(comp.isCommentMatch(pairOp)).toBe(false);
    // Bloc des tableaux affiché même sans écart ni paire « réelle » (cas Togo : une seule opération commentée)
    comp.reconDiffRows = [];
    comp.matchedPairs = [];
    expect(comp.hasReconDisplayData).toBe(true);
    comp.applyCommentCorrespondances();

    // Vue « Résultat » : la paire existante + une ligne seule par commentaire de chaque côté
    const resultat = comp.reconResultPairs;
    expect(resultat.length).toBe(3);
    const parOp = resultat.find((p: any) => p.matchBy === 'COMMENTAIRE' && p.op);
    const parRev = resultat.find((p: any) => p.matchBy === 'COMMENTAIRE' && p.rev);
    expect(parOp.op).toBe(op1);
    expect(parOp.rev).toBeUndefined();
    expect(parOp.commentaire).toBe('COMPENSE CB MYTP');
    expect(parRev.rev).toBe(rev10);
    expect(parRev.op).toBeUndefined();
    expect(parRev.commentaire).toBe('OK_REGUL_BANQUE');
    expect(comp.reconResultStats.parCommentaire).toBe(2);
    comp.reconResultMatchFilter = 'COMMENTAIRE';
    expect(comp.filteredReconResultPairs.length).toBe(2);
    comp.reconResultMatchFilter = '';

    // Commentaire retiré : la ligne revient dans les suspens
    comp.operations[0].commentaire = '';
    comp.applyCommentCorrespondances();
    expect(comp.leftOnlyOperations).toEqual([op1, op2]);
    expect(comp.matchedOperations).toEqual([pairOp]);
    expect(comp.reconResultPairs.length).toBe(2);
  });
});
