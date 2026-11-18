import { rankByShare, sharePercent } from './top-users-share.util';

describe('Top utilisateurs – part sur le total tous pays', () => {
    it('10 services sur 100 au total = 10 %', () => {
        expect(sharePercent(10, 100)).toBe(10);
        expect(sharePercent(1, 3)).toBe(33.3);
        expect(sharePercent(5, 0)).toBe(0);
    });

    it('classe par part du total tous pays, même si le filtre pays ne montre qu\'une partie', () => {
        // Filtre Cameroun : seuls A et B apparaissent, mais le total tous pays est 100.
        const cameroun = new Map([['b.agent', 4], ['a.agent', 10]]);
        const res = rankByShare(cameroun, 100);
        expect(res.map(r => r.username)).toEqual(['a.agent', 'b.agent']);
        expect(res.map(r => r.sharePct)).toEqual([10, 4]);
    });

    it('sans total fourni, utilise la somme des comptes et départage par nom', () => {
        const res = rankByShare(new Map([['zoe', 2], ['ali', 2], ['nul', 0]]), 0);
        expect(res).toEqual([
            { username: 'ali', count: 2, sharePct: 50 },
            { username: 'zoe', count: 2, sharePct: 50 }
        ]);
    });
});
