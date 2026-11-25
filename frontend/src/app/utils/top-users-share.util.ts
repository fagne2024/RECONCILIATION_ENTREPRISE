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

/** Rang « moyenne » : part services, part volume et moyenne des deux. */
export interface RankedAverageShare {
    username: string;
    services: number;
    volume: number;
    /** Part (%) sur le nombre de services, arrondie à 0,1. */
    servicesPct: number;
    /** Part (%) sur le volume, arrondie à 0,1. */
    volumePct: number;
    /** Moyenne des deux parts (%), arrondie à 0,1 : donne le rang. */
    sharePct: number;
    /** Moyenne exacte (non arrondie), pour comparer deux périodes. */
    exactPct: number;
}

/**
 * Classe les utilisateurs par moyenne de leur part en nombre de services et de leur part en
 * volume : (part services + part volume) / 2. Ex. 10 % des services et 30 % du volume = 20 %.
 * Chaque total est le total tous pays de la catégorie ; à défaut (0), la somme des comptes.
 */
export function rankByAverageShare(
    servicesPerUser: Map<string, number>,
    servicesTotal: number,
    volumePerUser: Map<string, number>,
    volumeTotal: number
): RankedAverageShare[] {
    const sumOf = (m: Map<string, number>): number =>
        Array.from(m.values()).reduce((acc, v) => acc + (v > 0 ? v : 0), 0);
    const servicesDen = servicesTotal > 0 ? servicesTotal : sumOf(servicesPerUser);
    const volumeDen = volumeTotal > 0 ? volumeTotal : sumOf(volumePerUser);
    const usernames = new Set<string>([...servicesPerUser.keys(), ...volumePerUser.keys()]);
    const result: RankedAverageShare[] = [];
    usernames.forEach(username => {
        const services = Math.max(0, servicesPerUser.get(username) || 0);
        const volume = Math.max(0, volumePerUser.get(username) || 0);
        if (services <= 0 && volume <= 0) {
            return;
        }
        const sExact = servicesDen > 0 ? services / servicesDen : 0;
        const vExact = volumeDen > 0 ? volume / volumeDen : 0;
        const exactPct = ((sExact + vExact) / 2) * 100;
        result.push({
            username,
            services,
            volume,
            servicesPct: sharePercent(services, servicesDen),
            volumePct: sharePercent(volume, volumeDen),
            sharePct: Math.round(exactPct * 10) / 10,
            exactPct
        });
    });
    return result.sort((a, b) =>
        b.exactPct - a.exactPct
        || b.services - a.services
        || b.volume - a.volume
        || a.username.localeCompare(b.username, 'fr'));
}
