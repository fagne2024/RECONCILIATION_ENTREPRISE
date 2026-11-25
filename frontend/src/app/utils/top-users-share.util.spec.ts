import { rankByAverageShare, rankByShare, sharePercent } from './top-users-share.util';

describe('Top utilisateurs – moyenne services / volume', () => {
    it('rang = moyenne de la part services et de la part volume', () => {
        // a : 10 % des services, 30 % du volume → 20 % ; b : 40 % des services, 2 % du volume → 21 %.
        const services = new Map([['a', 10], ['b', 40]]);
        const volume = new Map([['a', 300], ['b', 20]]);
        const res = rankByAverageShare(services, 100, volume, 1000);
        expect(res.map(r => r.username)).toEqual(['b', 'a']);
        expect(res[0]).toEqual(expect.objectContaining({ services: 40, volume: 20, servicesPct: 40, volumePct: 2, sharePct: 21 }));
        expect(res[1]).toEqual(expect.objectContaining({ services: 10, volume: 300, servicesPct: 10, volumePct: 30, sharePct: 20 }));
    });

    it('un utilisateur présent dans un seul des deux classements est retenu', () => {
        const res = rankByAverageShare(new Map([['a', 5]]), 10, new Map([['b', 50]]), 100);
        expect(res.map(r => [r.username, r.sharePct])).toEqual([['a', 25], ['b', 25]]);
    });

    it('sans total fourni, utilise la somme des comptes ; ignore les utilisateurs à zéro', () => {
        const res = rankByAverageShare(new Map([['a', 1], ['b', 3], ['z', 0]]), 0, new Map([['a', 3], ['b', 1]]), 0);
        expect(res.map(r => [r.username, r.sharePct])).toEqual([['b', 50], ['a', 50]]);
    });
});

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
