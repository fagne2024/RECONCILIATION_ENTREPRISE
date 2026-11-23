import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { DashboardReconciliationService } from './dashboard-reconciliation.service';

/**
 * Résumé result8rec sur une longue période : le backend refuse (413) plus de 5 000 lignes
 * sans filtre pays ; la plage est alors chargée par tranches de dates.
 */
describe('DashboardReconciliationService.loadResult8RecProgressive', () => {
    const dates = ['2026-11-21', '2026-11-20', '2026-11-19', '2026-11-18', '2026-11-17'];
    const lignesParDate = (d: string) => [{ id: Number(d.replace(/-/g, '')), date: d } as any];

    function service(maxDatesParRequete: number) {
        const s = new DashboardReconciliationService({} as any);
        const appels: string[] = [];
        jest.spyOn(s, 'getResult8RecDates').mockReturnValue(of(dates));
        jest.spyOn(s, 'getResult8RecDataScoped').mockImplementation((start: string, end: string) => {
            appels.push(`${start}..${end}`);
            const plage = dates.filter(d => d >= start && d <= end);
            if (plage.length > maxDatesParRequete) {
                return throwError(() => new HttpErrorResponse({ status: 413 }));
            }
            return of(plage.flatMap(lignesParDate));
        });
        return { s, appels };
    }

    it('charge le reste de la plage en une requête quand le backend l accepte', async () => {
        const { s, appels } = service(10);
        const rows = await s.loadResult8RecProgressive('2026-11-17', '2026-11-21', () => undefined);
        expect(rows).toHaveLength(5);
        expect(appels).toEqual(['2026-11-21..2026-11-21', '2026-11-17..2026-11-20']);
    });

    it('découpe la plage en tranches après un 413 et charge toutes les dates', async () => {
        const { s } = service(1);
        const lots: boolean[] = [];
        const rows = await s.loadResult8RecProgressive('2026-11-17', '2026-11-21', (_d, _first, complete) => lots.push(complete));
        expect(rows.map(r => r.id).sort()).toEqual(dates.map(d => Number(d.replace(/-/g, ''))).sort());
        expect(lots[lots.length - 1]).toBe(true);
        expect(lots.filter(c => c)).toHaveLength(1);
    });

    it('propage le 413 si une seule date dépasse déjà le plafond', async () => {
        const { s } = service(0);
        await expect(s.loadResult8RecProgressive('2026-11-17', '2026-11-21', () => undefined)).rejects.toBeInstanceOf(HttpErrorResponse);
    });
});
