import { ReconciliationFlowStateService, ColumnSelectionSnapshot } from './reconciliation-flow-state.service';

describe('ReconciliationFlowStateService', () => {
    let service: ReconciliationFlowStateService;

    const selection = (): ColumnSelectionSnapshot => ({
        boColumns: ['ID', 'Montant'],
        partnerColumns: ['Reference', 'Amount'],
        selectedBoKeyColumn: 'ID',
        selectedPartnerKeyColumn: 'Reference',
        additionalKeys: [{ boColumn: 'Montant', partnerColumn: 'Amount' }],
        comparisonColumns: [],
        disableAutoAnalysis: true
    });

    beforeEach(() => {
        service = new ReconciliationFlowStateService();
    });

    it('conserve un instantané d\'écran par parcours', () => {
        service.saveUploadSnapshot('manual', { a: 1 });
        service.saveUploadSnapshot('assisted', { b: 2 });

        expect(service.getUploadSnapshot('manual')?.state).toEqual({ a: 1 });
        expect(service.getUploadSnapshot('assisted')?.state).toEqual({ b: 2 });
        expect(service.getUploadSnapshot('certification')).toBeNull();

        service.clearUploadSnapshot('manual');
        expect(service.getUploadSnapshot('manual')).toBeNull();
        expect(service.getUploadSnapshot('assisted')).not.toBeNull();
    });

    it('restitue la sélection des colonnes quand les colonnes sont identiques (ordre indifférent)', () => {
        service.saveColumnSelection(selection());

        const restored = service.getColumnSelectionFor(['Montant', 'ID'], ['Amount', 'Reference']);

        expect(restored?.selectedBoKeyColumn).toBe('ID');
        expect(restored?.additionalKeys).toEqual([{ boColumn: 'Montant', partnerColumn: 'Amount' }]);
    });

    it('ignore la sélection mémorisée si les fichiers ont changé de colonnes', () => {
        service.saveColumnSelection(selection());

        expect(service.getColumnSelectionFor(['ID'], ['Reference', 'Amount'])).toBeNull();
        expect(service.getColumnSelectionFor(['ID', 'Montant'], ['Reference', 'Autre'])).toBeNull();
    });

    it('isole les copies : modifier la sélection restituée ne touche pas la mémoire', () => {
        const original = selection();
        service.saveColumnSelection(original);
        original.additionalKeys[0].boColumn = 'MODIFIE_AVANT';

        const restored = service.getColumnSelectionFor(['ID', 'Montant'], ['Reference', 'Amount'])!;
        restored.additionalKeys[0].boColumn = 'MODIFIE_APRES';

        const again = service.getColumnSelectionFor(['ID', 'Montant'], ['Reference', 'Amount'])!;
        expect(again.additionalKeys[0].boColumn).toBe('Montant');
    });

    it('clearAll purge tout le parcours', () => {
        service.saveUploadSnapshot('manual', { a: 1 });
        service.saveColumnSelection(selection());

        service.clearAll();

        expect(service.getUploadSnapshot('manual')).toBeNull();
        expect(service.getColumnSelectionFor(['ID', 'Montant'], ['Reference', 'Amount'])).toBeNull();
    });
});
