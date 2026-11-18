/**
 * Classement « Top des utilisateurs » (états de réconciliation transactions et banque).
 *
 * Chaque utilisateur reçoit sa part du total de la catégorie, tous pays confondus :
 * 10 services réconciliés sur 100 au total = 10 %. Ce pourcentage donne le rang.
 */
export interface RankedShare {
    username: string;
    count: number;
    /** Part en %, arrondie à 0,1. 0 si le total est nul. */
    sharePct: number;
}

/** Part en % (arrondie à 0,1) de `count` sur `total`. */
export function sharePercent(count: number, total: number): number {
    if (!(total > 0) || !(count > 0)) {
        return 0;
    }
    return Math.round((count / total) * 1000) / 10;
}

/**
 * Classe les utilisateurs par part décroissante du total (puis par nombre, puis par nom).
 * `total` est le total tous pays de la catégorie ; à défaut (0), la somme des comptes.
 */
export function rankByShare(perUser: Map<string, number>, total: number): RankedShare[] {
    const entries = Array.from(perUser.entries()).filter(([, count]) => count > 0);
    const sum = entries.reduce((acc, [, count]) => acc + count, 0);
    const denominator = total > 0 ? total : sum;
    return entries
        .map(([username, count]) => ({
            username,
            count,
            sharePct: sharePercent(count, denominator),
            exact: denominator > 0 ? count / denominator : 0
        }))
        .sort((a, b) => b.exact - a.exact || b.count - a.count || a.username.localeCompare(b.username, 'fr'))
        .map(({ username, count, sharePct }) => ({ username, count, sharePct }));
}
