// ExcelJS (via uuid ESM) n'est pas transformable par Jest et n'est pas utilisé ici
jest.mock('exceljs', () => ({}));
// Service à web worker (import.meta) non compilable sous Jest
jest.mock('../../services/column-rules-processor.service', () => ({ ColumnRulesProcessorService: class {} }));

import { EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BanqueComponent } from './banque.component';
import { SuiviCompenseOpService } from '../../services/suivi-compense-op.service';
import { BanqueDossierLieService } from '../../services/banque-dossier-lie.service';

/**
 * /banque : intervalle de dates (la date de fin incluait seulement minuit, les opérations du
 * dernier jour disparaissaient) et sélection multiple étendue à toutes les pages filtrées.
 */
describe('BanqueComponent - filtres de date et sélection multiple', () => {
  const stub: any = {};
  let comp: any;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: SuiviCompenseOpService, useValue: {} }, { provide: BanqueDossierLieService, useValue: { dossierOf: () => null } }] });
    comp = TestBed.inject(EnvironmentInjector)
      .runInContext(() => new BanqueComponent(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub, stub, stub));
  });

  const op = (id: number, dateOperation: Date) => ({ id, dateOperation, montant: 1, pays: 'SN', statut: 'En attente' });

  it('inclut toute la journée de la date de fin', () => {
    comp.operations = [
      op(1, new Date(2026, 10, 18, 9, 0)),
      op(2, new Date(2026, 10, 20, 15, 30)),
      op(3, new Date(2026, 10, 21, 0, 5)),
    ];
    comp.filters.dateDebut = '2026-11-18';
    comp.filters.dateFin = '2026-11-20';
    comp.applyFilters();
    expect(comp.filteredOperations.map((o: any) => o.id)).toEqual([1, 2]);

    comp.filters.dateDebut = '';
    comp.applyFilters();
    expect(comp.filteredOperations.map((o: any) => o.id)).toEqual([1, 2]);
  });

  it('lit une date « AAAA-MM-JJ » du serveur sans décalage de fuseau', () => {
    expect(comp.dateDansIntervalle('2026-11-20', '2026-11-20', '2026-11-20')).toBe(true);
    expect(comp.dateDansIntervalle('2026-11-21T00:00:00', '2026-11-20', '2026-11-20')).toBe(false);
    expect(comp.dateDansIntervalle(null, '2026-11-20', '')).toBe(false);
    expect(comp.dateDansIntervalle(null, '', '')).toBe(true);
  });

  it('sélectionne les opérations filtrées de toutes les pages (vue rapprochement)', () => {
    comp.filteredLeftOps = Array.from({ length: 25 }, (_, i) => op(i + 1, new Date()));
    comp.pagedLeftOps = comp.filteredLeftOps.slice(0, 10);
    comp.toggleSelectAllOpsHeader();
    expect(comp.selectedOpIds.size).toBe(25);
    expect(comp.allOpsSelected).toBe(true);
    comp.toggleSelectAllOpsHeader();
    expect(comp.selectedOpIds.size).toBe(0);
  });

  it('sélectionne les correspondances de toutes les pages', () => {
    comp.reconView = 'corr_operation';
    comp.filteredMatchedOps = Array.from({ length: 15 }, (_, i) => ({ key: 'k' + i }));
    comp.pagedMatchedOps = comp.filteredMatchedOps.slice(0, 10);
    comp.toggleSelectAllCurrentPage();
    expect(comp.selectedReconKeys.size).toBe(15);
  });
});
