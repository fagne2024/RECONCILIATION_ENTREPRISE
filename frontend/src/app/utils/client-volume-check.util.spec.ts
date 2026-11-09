import {
    ClientVolumeEntry,
    collectEntryServices,
    computeClientVolumes,
    filterAndSortClientVolumes,
    guessAmountColumn,
    guessPhoneColumn,
    guessServiceColumn,
    normalizePhone,
    parseFlexibleAmount
} from './client-volume-check.util';

describe('client-volume-check.util', () => {
    describe('parseFlexibleAmount', () => {
        it.each([
            ['1 000,50', 1000.5],
            ['1.000,50', 1000.5],
            ['1,000.50', 1000.5],
            ['1,000,000', 1000000],
            ['1.000.000', 1000000],
            ['250000', 250000],
            ['12,5', 12.5],
            ['-200 000', -200000],
            ['150 000 FCFA', 150000],
            ['', 0],
            ['abc', 0]
        ])('%s -> %s', (raw, expected) => {
            expect(parseFlexibleAmount(raw)).toBe(expected);
        });
    });

    it('normalise les numéros', () => {
        expect(normalizePhone("+237 699-00-11-22")).toBe('237699001122');
        expect(normalizePhone("'699001122")).toBe('699001122');
        expect(normalizePhone(null)).toBe('');
    });

    describe('computeClientVolumes', () => {
        const row = (tel: string, montant: string) => ({ tel, montant });
        const times = (n: number, tel: string, montant: string) => Array.from({ length: n }, () => row(tel, montant));

        it('liste un numéro présent plus de 3 fois avec un volume >= 400 000', () => {
            const rows = [
                row('699001122', '100000'),
                row('699 00 11 22', '100000'),
                row('699001122', '100 000'),
                row('699001122', '100000')
            ];
            const res = computeClientVolumes(rows, 'tel', 'montant');
            expect(res.entries).toEqual([{ phone: '699001122', occurrences: 4, volume: 400000, services: [] }]);
            expect(res.distinctPhones).toBe(1);
        });

        it('ignore un numéro présent seulement 3 fois, même avec un gros volume', () => {
            expect(computeClientVolumes(times(3, '1', '900000'), 'tel', 'montant').entries).toEqual([]);
        });

        it('ignore un volume inférieur à 400 000', () => {
            expect(computeClientVolumes(times(4, '1', '99999'), 'tel', 'montant').entries).toEqual([]);
        });

        it('cumule les montants en valeur absolue et trie par volume décroissant', () => {
            const rows = [
                ...times(4, '1', '-300000'),
                ...times(5, '2', '100000'),
                row('', '999999')
            ];
            const res = computeClientVolumes(rows, 'tel', 'montant');
            expect(res.entries.map(e => e.phone)).toEqual(['1', '2']);
            expect(res.entries[0].volume).toBe(1200000);
            expect(res.skippedRows).toBe(1);
            expect(res.analyzedRows).toBe(10);
        });
    });

    it('recalcule tout sur un seul service quand il est filtré', () => {
        const rows = [
            ...Array.from({ length: 4 }, () => ({ tel: '1', montant: '100000', service: 'PAIEMENT' })),
            ...Array.from({ length: 6 }, () => ({ tel: '1', montant: '500000', service: 'CASHIN' })),
            ...Array.from({ length: 3 }, () => ({ tel: '2', montant: '300000', service: 'PAIEMENT' })),
            ...Array.from({ length: 5 }, () => ({ tel: '2', montant: '300000', service: 'CASHIN' }))
        ];
        const res = computeClientVolumes(rows, 'tel', 'montant', undefined, 'service', 'PAIEMENT');
        // Le numéro 2 n'a que 3 transactions PAIEMENT : il n'est plus listé.
        expect(res.entries).toEqual([{ phone: '1', occurrences: 4, volume: 400000, services: ['PAIEMENT'] }]);
        expect(res.analyzedRows).toBe(7);
    });

    describe('filterAndSortClientVolumes', () => {
        const entries: ClientVolumeEntry[] = [
            { phone: '300', occurrences: 4, volume: 900000, services: ['CASHIN'] },
            { phone: '1000', occurrences: 9, volume: 400000, services: ['CASHOUT', 'CASHIN'] },
            { phone: '20', occurrences: 5, volume: 600000, services: ['PAIEMENT'] }
        ];

        it('filtre par service', () => {
            expect(filterAndSortClientVolumes(entries, 'CASHIN', 'volume', 'desc').map(e => e.phone)).toEqual(['300', '1000']);
            expect(filterAndSortClientVolumes(entries, '', 'volume', 'desc')).toHaveLength(3);
        });

        it('trie dans les deux sens', () => {
            expect(filterAndSortClientVolumes(entries, '', 'volume', 'asc').map(e => e.phone)).toEqual(['1000', '20', '300']);
            expect(filterAndSortClientVolumes(entries, '', 'occurrences', 'desc').map(e => e.phone)).toEqual(['1000', '20', '300']);
            expect(filterAndSortClientVolumes(entries, '', 'phone', 'asc').map(e => e.phone)).toEqual(['20', '300', '1000']);
        });

        it('liste les services distincts', () => {
            expect(collectEntryServices(entries)).toEqual(['CASHIN', 'CASHOUT', 'PAIEMENT']);
        });
    });

    it('regroupe les services distincts utilisés par un numéro', () => {
        const rows = [
            { tel: '1', montant: '200000', service: 'PAIEMENT' },
            { tel: '1', montant: '200000', service: 'CASHIN' },
            { tel: '1', montant: '200000', service: 'CASHOUT' },
            { tel: '1', montant: '200000', service: 'CASHIN' },
            { tel: '1', montant: '200000', service: '' }
        ];
        const res = computeClientVolumes(rows, 'tel', 'montant', undefined, 'service');
        expect(res.entries[0].services).toEqual(['PAIEMENT', 'CASHIN', 'CASHOUT']);
        expect(res.entries[0].occurrences).toBe(5);
    });

    it('devine les colonnes téléphone et montant', () => {
        const cols = ['Date', 'Numéro client', 'Montant TTC', 'Agence'];
        expect(guessPhoneColumn(cols)).toBe('Numéro client');
        expect(guessAmountColumn(cols)).toBe('Montant TTC');
        expect(guessPhoneColumn(['MSISDN', 'Amount'])).toBe('MSISDN');
        expect(guessAmountColumn(['MSISDN', 'Amount'])).toBe('Amount');
        expect(guessServiceColumn(['Date', 'Service', 'Montant'])).toBe('Service');
        expect(guessServiceColumn(['Date', 'Montant'])).toBe('');
    });
});
