import { EcartBoSummaryPendingLine } from '../services/ecart-bo-summary.service';
import { BILINGUAL_COLUMN_ALIASES, getRecordValueByAliases } from './bilingual-column.util';

type GroupAccumulator = {
  agence: string;
  service: string;
  pays: string;
  date: string;
  recordCount: number;
  totalMontant: number;
  multiAgenceRecords?: Record<string, string>[];
};

/**
 * Agrège des enregistrements BO (boOnly + mismatches) en lignes prêtes pour ecart-bo-summary.
 */
export function buildEcartBoPendingLinesFromRecords(
  records: Record<string, string>[]
): EcartBoSummaryPendingLine[] {
  const grouped = new Map<string, GroupAccumulator>();

  for (const record of records) {
    const agence = getRecordValueByAliases(record, BILINGUAL_COLUMN_ALIASES.agence) || 'Non spécifié';
    const service = getRecordValueByAliases(record, BILINGUAL_COLUMN_ALIASES.service) || 'Non spécifié';
    const pays = getRecordValueByAliases(record, BILINGUAL_COLUMN_ALIASES.pays) || 'Non spécifié';
    const date = getRecordValueByAliases(record, BILINGUAL_COLUMN_ALIASES.date) || '';
    const montantStr = getRecordValueByAliases(record, BILINGUAL_COLUMN_ALIASES.montant);
    const montant = montantStr ? parseFloat(String(montantStr).replace(',', '.')) : 0;
    const key = `${agence}|${service}|${pays}`;
    const isMultiAgence = agence === 'multiAgence';

    let group = grouped.get(key);
    if (!group) {
      group = {
        agence,
        service,
        pays,
        date,
        recordCount: 0,
        totalMontant: 0,
        ...(isMultiAgence ? { multiAgenceRecords: [] } : {})
      };
      grouped.set(key, group);
    }

    if (isMultiAgence) {
      group.multiAgenceRecords!.push(record);
    } else {
      group.recordCount += 1;
    }
    group.totalMontant += Number.isFinite(montant) ? montant : 0;
    if (!group.date && date) {
      group.date = date;
    }
  }

  const lines: EcartBoSummaryPendingLine[] = [];
  for (const group of grouped.values()) {
    if (group.agence === 'multiAgence' && group.multiAgenceRecords?.length) {
      for (const record of group.multiAgenceRecords) {
        const agence = getRecordValueByAliases(record, BILINGUAL_COLUMN_ALIASES.agence) || group.agence;
        const service = getRecordValueByAliases(record, BILINGUAL_COLUMN_ALIASES.service) || group.service;
        const pays = getRecordValueByAliases(record, BILINGUAL_COLUMN_ALIASES.pays) || group.pays;
        const date = getRecordValueByAliases(record, BILINGUAL_COLUMN_ALIASES.date) || group.date;
        const montantStr = getRecordValueByAliases(record, BILINGUAL_COLUMN_ALIASES.montant);
        const montant = montantStr ? parseFloat(String(montantStr).replace(',', '.')) : 0;
        lines.push({
          agence,
          service,
          pays,
          date: date || new Date().toISOString().split('T')[0],
          montant,
          statut: 'EN_COURS',
          nombreTransactions: 1
        });
      }
      continue;
    }

    lines.push({
      agence: group.agence,
      service: group.service,
      pays: group.pays,
      date: group.date || new Date().toISOString().split('T')[0],
      montant: group.totalMontant,
      statut: 'EN_COURS',
      nombreTransactions: group.recordCount
    });
  }

  return lines;
}
