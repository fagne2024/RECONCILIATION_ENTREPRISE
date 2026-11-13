import {
    addDaysIso,
    buildBankAccountRows,
    computePeriodRange,
    computeStats,
    lineStatus,
    listDates,
    previousRange,
    sparkHeights,
    toIsoDate
} from './etat-reconciliation-bancaire.util';
import { ReleveBancaireRow } from '../../models/releve-bancaire.model';
import { OperationBancaire } from '../../models/operation-bancaire.model';

const line = (over: Partial<ReleveBancaireRow>): ReleveBancaireRow => ({
    numeroCompte: '001',
    nomCompte: 'Compte A',
    banque: 'BICEC CM',
    dateComptable: '2026-11-10',
    dateValeur: '2026-11-10',
    credit: 1000,
    debit: 0,
    reconStatus: 'KO',
    ...over
});

const op = (over: Partial<OperationBancaire>): OperationBancaire =>
    ({ id: 1, dateOperation: '2026-11-10', montant: 1000, bo: 'BICEC CM', traitement: '', ...over } as OperationBancaire);

describe('etat-reconciliation-bancaire.util', () => {
    describe('statut d\'une ligne', () => {
        it('KO sans opération : non réconcilié', () => {
            expect(lineStatus(line({ reconStatus: 'KO' }))).toBe('NON_RECONCILIE');
        });
        it('OK sans opération : réconcilié', () => {
            expect(lineStatus(line({ reconStatus: 'OK' }))).toBe('RECONCILIE');
        });
        it('OK + opération niveau reconciliation (ou vide) : en cours de validation', () => {
            expect(lineStatus(line({ reconStatus: 'OK' }), op({ traitement: 'Niveau reconciliation' }))).toBe('EN_COURS_VALIDATION');
            expect(lineStatus(line({ reconStatus: 'OK' }), op({ traitement: '' }))).toBe('EN_COURS_VALIDATION');
        });
        it('KO + opération encore au niveau reconciliation : non réconcilié', () => {
            expect(lineStatus(line({ reconStatus: 'KO' }), op({ traitement: '' }))).toBe('NON_RECONCILIE');
        });
        it('opération Niveau Group : en cours de clôture', () => {
            expect(lineStatus(line({ reconStatus: 'OK' }), op({ traitement: 'Niveau Group' }))).toBe('EN_COURS_CLOTURE');
        });
        it('opération Terminé (avec ou sans accent) : terminé', () => {
            expect(lineStatus(line({ reconStatus: 'OK' }), op({ traitement: 'Terminé' }))).toBe('TERMINE');
            expect(lineStatus(line({ reconStatus: 'OK' }), op({ traitement: 'termine' }))).toBe('TERMINE');
        });
    });

    describe('regroupement par compte et par jour', () => {
        it('rapproche la ligne de l\'opération par date, montant et banque', () => {
            const rows = buildBankAccountRows(
                [line({ reconStatus: 'OK' }), line({ credit: 555, reconStatus: 'OK' })],
                [op({ traitement: 'Terminé', bo: 'bicec-cm' })]
            );
            const cell = rows[0].days['2026-11-10'];
            expect(cell.counts.TERMINE).toBe(1);
            expect(cell.counts.RECONCILIE).toBe(1);
            // la case prend le statut de la ligne la moins avancée
            expect(cell.status).toBe('RECONCILIE');
        });

        it('utilise la banque corrigée de l\'opération en priorité', () => {
            const rows = buildBankAccountRows(
                [line({ reconStatus: 'OK' })],
                [op({ bo: 'AUTRE', banqueCorrigee: 'BICEC CM', traitement: 'Niveau Group' })]
            );
            expect(rows[0].days['2026-11-10'].status).toBe('EN_COURS_CLOTURE');
        });

        it('sépare les comptes et déduit le pays', () => {
            const rows = buildBankAccountRows([line({}), line({ numeroCompte: '002', nomCompte: 'Compte B' })]);
            expect(rows.length).toBe(2);
            expect(rows[0].country).toBe('CM');
        });

        it('ignore les lignes sans date comptable', () => {
            expect(buildBankAccountRows([line({ dateComptable: undefined })]).length).toBe(0);
        });

        it('une case dont toutes les lignes sont terminées est terminée', () => {
            const rows = buildBankAccountRows([line({ reconStatus: 'OK' })], [op({ traitement: 'Terminé' })]);
            expect(rows[0].days['2026-11-10'].status).toBe('TERMINE');
        });
    });

    it('calcule les statistiques par statut sur un intervalle', () => {
        const rows = buildBankAccountRows(
            [
                line({ reconStatus: 'OK' }),
                line({ dateComptable: '2026-11-11', dateValeur: '2026-11-11' }),
                line({ dateComptable: '2026-11-20', dateValeur: '2026-11-20', reconStatus: 'OK' })
            ],
            [op({ traitement: 'Niveau Group' })]
        );
        expect(computeStats(rows, '2026-11-10', '2026-11-12'))
            .toEqual({ total: 2, reconcilie: 0, enCoursValidation: 0, enCoursCloture: 1, termine: 0, nonReco: 1 });
    });

    it('normalise les dates (chaîne, tableau Jackson)', () => {
        expect(toIsoDate('2026-11-10T00:00:00')).toBe('2026-11-10');
        expect(toIsoDate([2026, 1, 5])).toBe('2026-01-05');
        expect(toIsoDate(null)).toBe('');
    });

    it('calcule les bornes de période plafonnées à aujourd\'hui', () => {
        const today = new Date(2026, 10, 13); // vendredi 13/11/2026
        expect(computePeriodRange('jour', today)).toEqual({ start: '2026-11-13', end: '2026-11-13' });
        expect(computePeriodRange('semaine', today)).toEqual({ start: '2026-11-09', end: '2026-11-13' });
        expect(computePeriodRange('semaine_passee', today)).toEqual({ start: '2026-11-02', end: '2026-11-08' });
        expect(computePeriodRange('7_jours', today)).toEqual({ start: '2026-11-07', end: '2026-11-13' });
        expect(computePeriodRange('mois', today)).toEqual({ start: '2026-11-01', end: '2026-11-13' });
    });

    it('calcule la période précédente de même longueur', () => {
        expect(previousRange('2026-11-09', '2026-11-13')).toEqual({ start: '2026-11-04', end: '2026-11-08' });
    });

    it('liste les jours et gère les bornes inversées', () => {
        expect(listDates('2026-11-29', '2026-12-02')).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
        expect(listDates('2026-11-10', '2026-11-09')).toEqual([]);
        expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    });

    it('calcule les hauteurs de spark', () => {
        expect(sparkHeights([0, 5, 10], 20, 2)).toEqual([2, 10, 20]);
        expect(sparkHeights([0, 0])).toEqual([3, 3]);
    });
});
