/**
 * Cloisonnement réconciliation magique : priorité absolue au tag _magicService.
 * Ne pas utiliser TRANS TYPE / Service pour le partitionnement lorsque les tags magiques existent.
 */

export function getMagicPartitionServiceTag(record: Record<string, string>): string {
    return String(record['_magicService'] || '').trim();
}

export function getMagicPartitionPartnerFileTag(record: Record<string, string>): string {
    return String(record['_magicPartnerFile'] || '').trim();
}

export function hasMagicPartitionTags(records: Record<string, string>[]): boolean {
    return records.some(r => !!getMagicPartitionServiceTag(r) || !!getMagicPartitionPartnerFileTag(r));
}

export function servicesMatchPartition(a: string, b: string): boolean {
    if (!a || !b) {
        return a === b;
    }
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function recordMatchesMagicPartition(
    record: Record<string, string>,
    service: string,
    partnerFile: string,
    magicTaggedDataset: boolean
): boolean {
    const serviceFilter = (service || '').trim();
    const partnerFileFilter = (partnerFile || '').trim();

    if (partnerFileFilter) {
        const partnerTag = getMagicPartitionPartnerFileTag(record);
        if (partnerTag && !servicesMatchPartition(partnerTag, partnerFileFilter)) {
            return false;
        }
    }

    if (!serviceFilter) {
        return true;
    }

    const magicServiceTag = getMagicPartitionServiceTag(record);
    if (magicServiceTag) {
        return servicesMatchPartition(magicServiceTag, serviceFilter);
    }

    if (magicTaggedDataset) {
        return false;
    }

    const fallback = String(
        record['Service'] ||
        record['service'] ||
        record['SERV'] ||
        ''
    ).trim();
    return servicesMatchPartition(fallback, serviceFilter);
}

export function filterRecordsByMagicPartition(
    records: Record<string, string>[],
    service: string,
    partnerFile: string
): Record<string, string>[] {
    if (!service && !partnerFile) {
        return records;
    }
    const magicTaggedDataset = hasMagicPartitionTags(records);
    return records.filter(record =>
        recordMatchesMagicPartition(record, service, partnerFile, magicTaggedDataset)
    );
}

/**
 * Cloisonne des enregistrements sur plusieurs services magiques (ensemble).
 * L'enregistrement est conservé s'il correspond (via _magicService / colonne service)
 * à l'UN des services demandés, et respecte le fichier partenaire s'il est fourni.
 */
export function recordMatchesAnyMagicService(
    record: Record<string, string>,
    services: string[],
    partnerFile: string
): boolean {
    const partnerFileFilter = (partnerFile || '').trim();
    if (partnerFileFilter) {
        const partnerTag = getMagicPartitionPartnerFileTag(record);
        if (partnerTag && !servicesMatchPartition(partnerTag, partnerFileFilter)) {
            return false;
        }
    }
    const cleanServices = services.map(s => (s || '').trim()).filter(Boolean);
    if (cleanServices.length === 0 && !partnerFileFilter) {
        return true;
    }
    if (cleanServices.length === 0) {
        return true;
    }
    const magicServiceTag = getMagicPartitionServiceTag(record);
    if (magicServiceTag) {
        return cleanServices.some(svc => servicesMatchPartition(magicServiceTag, svc));
    }
    if (hasMagicPartitionTags([record])) {
        return false;
    }
    const fallback = String(
        record['Service'] ||
        record['service'] ||
        record['SERV'] ||
        ''
    ).trim();
    return cleanServices.some(svc => servicesMatchPartition(fallback, svc));
}

export function filterRecordsByMagicPartitionMulti(
    records: Record<string, string>[],
    services: string[],
    partnerFile: string
): Record<string, string>[] {
    if (services.length === 0 && !partnerFile) {
        return records;
    }
    return records.filter(record => recordMatchesAnyMagicService(record, services, partnerFile));
}

/** Contexte de cloisonnement partagé entre /results, /ecart-bo et /ecart-partner. */
export interface MagicPartitionContext {
    service: string;
    partnerFile: string;
}

export function resolveMagicPartitionContext(sources: {
    appStateService?: string | null;
    appStatePartnerFile?: string | null;
    tabsContext?: MagicPartitionContext | null;
    fallbackService?: string | null;
    fallbackPartnerFile?: string | null;
}): MagicPartitionContext {
    const tabs = sources.tabsContext || { service: '', partnerFile: '' };
    return {
        service: String(
            sources.appStateService || tabs.service || sources.fallbackService || ''
        ).trim(),
        partnerFile: String(
            sources.appStatePartnerFile || tabs.partnerFile || sources.fallbackPartnerFile || ''
        ).trim()
    };
}

export function partitionEcartRecords(
    records: Record<string, string>[],
    context: MagicPartitionContext
): Record<string, string>[] {
    if (!context.service && !context.partnerFile) {
        return records;
    }
    return filterRecordsByMagicPartition(records, context.service, context.partnerFile);
}

/**
 * Filtre les correspondances (Match) selon le contexte magique.
 * Le cloisonnement se fait sur le boData de chaque Match via le tag _magicService.
 */
export function filterMatchBoDataByMagicPartition<T extends { boData?: Record<string, string> | null }>(
    matches: T[],
    service: string,
    partnerFile: string
): T[] {
    if (!service && !partnerFile) {
        return matches;
    }
    const boDataList = matches
        .map(m => m.boData)
        .filter((record): record is Record<string, string> => !!record);
    const magicTaggedDataset = hasMagicPartitionTags(boDataList);
    return matches.filter(m =>
        !!m.boData &&
        recordMatchesMagicPartition(m.boData, service, partnerFile, magicTaggedDataset)
    );
}

/** Filtre les correspondances selon plusieurs services magiques (le Match est conservé s'il correspond à l'un d'eux). */
export function filterMatchBoDataByMagicPartitionMulti<T extends { boData?: Record<string, string> | null }>(
    matches: T[],
    services: string[],
    partnerFile: string
): T[] {
    if (services.length === 0 && !partnerFile) {
        return matches;
    }
    return matches.filter(m =>
        !!m.boData &&
        recordMatchesAnyMagicService(m.boData, services, partnerFile)
    );
}
