// exceljs (importé indirectement) charge la version ESM de uuid, non transformée par Jest.
jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000000' }));
// Ce service démarre un web worker (import.meta.url) : inutile ici.
jest.mock('../../services/column-rules-processor.service', () => ({ ColumnRulesProcessorService: class {} }));

import { FileUploadComponent } from './file-upload.component';
import { ReconciliationFlowStateService } from '../../services/reconciliation-flow-state.service';

/**
 * Retour arrière dans le parcours de réconciliation (popups de filtres et
 * restauration de l'écran après navigation).
 */
describe('FileUploadComponent — retour arrière dans le parcours', () => {
    const stub = {} as any;

    function createComponent(flowState: ReconciliationFlowStateService, routeData: Record<string, unknown> = { manualOnly: true }) {
        const route = { snapshot: { data: routeData, queryParamMap: { get: () => null } } } as any;
        const appState = {
            getReconciliationType: () => '1-1',
            clearData: () => undefined,
            setReconciliationData: () => undefined,
            setCurrentStep: () => undefined
        } as any;
        const cd = { detectChanges: () => undefined } as any;
        const component = new FileUploadComponent(
            stub, stub, stub, { navigate: () => Promise.resolve(true) } as any, route, appState,
            stub, stub, stub, stub, stub, stub, stub, stub, stub, cd, stub, stub, flowState, stub
        );
        component.ngOnInit();
        return component;
    }

    const boRows = [
        { Service: 'CASHIN', Statut: 'OK', Montant: '10' },
        { Service: 'CASHIN', Statut: 'KO', Montant: '20' },
        { Service: 'CASHOUT', Statut: 'OK', Montant: '30' },
        { Service: 'PAIEMENT', Statut: 'OK', Montant: '40' }
    ];

    function openManualServiceStep(component: FileUploadComponent): void {
        component.manualAvailableServices = ['CASHIN', 'CASHOUT', 'PAIEMENT'];
        component.manualServiceSelectionData = boRows;
        component.manualStatusColumn = 'Statut';
        component.showManualServiceSelection = true;
        component.manualSelectedServices = ['CASHIN', 'CASHOUT', 'PAIEMENT'];
    }

    it('revient aux services BO en conservant la sélection faite par l\'utilisateur', async () => {
        const component = createComponent(new ReconciliationFlowStateService());
        openManualServiceStep(component);
        component.manualSelectedServices = ['CASHIN', 'CASHOUT']; // PAIEMENT décoché

        await component.runFilterStep('confirmManualServiceSelection');

        expect(component.activeFilterStep).toBe('bo-status-manual');
        expect(component.manualAvailableStatuses).toEqual(['KO', 'OK']);
        expect(component.canGoBackFilterStep).toBe(true);

        expect(component.goToPreviousFilterStep()).toBe(true);

        expect(component.activeFilterStep).toBe('bo-service-manual');
        expect(component.showManualStatusSelection).toBe(false);
        expect(component.manualSelectedServices).toEqual(['CASHIN', 'CASHOUT']);
        expect(component.canGoBackFilterStep).toBe(false);
    });

    it('ne mémorise pas d\'étape quand la validation échoue', async () => {
        const component = createComponent(new ReconciliationFlowStateService());
        openManualServiceStep(component);
        component.manualSelectedServices = [];

        await component.runFilterStep('confirmManualServiceSelection');

        expect(component.activeFilterStep).toBe('bo-service-manual');
        expect(component.filterStepHistory.length).toBe(0);
    });

    it('« Retour aux statuts » depuis les paiements réaffiche les statuts (plus de liste vide)', async () => {
        const component = createComponent(new ReconciliationFlowStateService(), { assistedOnly: true });
        const partnerRows = [
            { Service: 'A', Statut: 'Succès', Paiement: 'Wallet' },
            { Service: 'A', Statut: 'Échec', Paiement: 'Carte' },
            { Service: 'B', Statut: 'Succès', Paiement: 'Wallet' }
        ];
        component.autoPartnerSourceFormat = 'csv';
        component.partnerServiceColumn = 'Service';
        component.partnerStatusColumn = 'Statut';
        component.partnerAvailableServices = ['A', 'B'];
        component.partnerSelectedServices = ['A'];
        component.partnerServiceSelectionData = partnerRows;
        component.showPartnerServiceSelection = true;

        await component.runFilterStep('confirmPartnerServiceSelection');
        expect(component.activeFilterStep).toBe('partner-status');
        component.partnerSelectedStatuses = ['Succès'];

        await component.runFilterStep('confirmPartnerStatusSelection');
        expect(component.activeFilterStep).toBe('partner-payment');
        expect(component.partnerAvailableStatuses).toEqual([]); // vidés à l'ouverture des paiements

        component.cancelPartnerPaymentSelection();

        expect(component.activeFilterStep).toBe('partner-status');
        expect(component.partnerAvailableStatuses).toEqual(['Succès', 'Échec'].sort());
        expect(component.partnerSelectedStatuses).toEqual(['Succès']);
        expect(component.partnerStatusSelectionData.length).toBe(2);

        // Et encore un cran : retour aux services, avec le service choisi.
        component.cancelPartnerStatusSelection();
        expect(component.activeFilterStep).toBe('partner-service');
        expect(component.partnerSelectedServices).toEqual(['A']);
    });

    it('restaure fichiers, filtres et historique en revenant sur la page', async () => {
        const flowState = new ReconciliationFlowStateService();
        const first = createComponent(flowState);
        const boFile = new File(['x'], 'TRXBO.csv');
        first.boFile = boFile;
        first.boData = boRows;
        first.reconciliationType = '1-3';
        openManualServiceStep(first);
        first.manualSelectedServices = ['CASHIN'];
        await first.runFilterStep('confirmManualServiceSelection');
        first.showManualStatusSelection = false; // l'utilisateur a quitté la page (ex. vers les colonnes)

        first.ngOnDestroy();
        const second = createComponent(flowState);

        expect(second.boFile).toBe(boFile);
        expect(second.boData).toEqual(boRows);
        expect(second.reconciliationType).toBe('1-3');
        expect(second.canReopenPreviousFilterStep).toBe(true);

        second.goToPreviousFilterStep();

        expect(second.activeFilterStep).toBe('bo-service-manual');
        expect(second.manualSelectedServices).toEqual(['CASHIN']);
    });

    it('ne restaure rien pour une nouvelle réconciliation (reset=1)', () => {
        const flowState = new ReconciliationFlowStateService();
        flowState.saveUploadSnapshot('manual', { filters: { boFile: new File(['x'], 'a.csv') }, filterStepHistory: [{}] });
        const route = { snapshot: { data: { manualOnly: true }, queryParamMap: { get: (k: string) => (k === 'reset' ? '1' : null) } } } as any;
        const component = new FileUploadComponent(
            stub, stub, stub, stub, route,
            { getReconciliationType: () => '1-1', clearData: () => undefined } as any,
            { clearAllData: () => undefined } as any, stub, stub, stub, stub, stub, stub, stub, stub,
            { detectChanges: () => undefined } as any, stub, stub, flowState, stub
        );
        (component as any).reconciliationService = { clearData: () => undefined };
        (component as any).closeTraitementModal = () => undefined;

        component.ngOnInit();

        expect(component.boFile).toBeNull();
        expect(component.filterStepHistory.length).toBe(0);
        expect(flowState.getUploadSnapshot('manual')).toBeNull();
    });
});
