import { Match, ReconciliationResponse } from '../models/reconciliation-response.model';
import { getRowColumnValue } from './row-column.util';

function readRowServiceValue(row: Record<string, string> | undefined, column: string): string {
  if (!row || !column) {
    return '';
  }
  return String(getRowColumnValue(row, column) ?? '').trim();
}

/** Longueur minimale d'un token service pour un rapprochement par inclusion. */
export const MIN_SERVICE_TOKEN_LENGTH = 5;

/** Normalise un libellé service (casse, accents, séparateurs). */
export function normalizeServiceToken(value: string): string {
  return (value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

/** Extrait les tokens significatifs d'un libellé TRXBO (segments + variantes sans préfixes/suffixes). */
export function extractServiceTokens(value: string): string[] {
  const tokens = new Set<string>();
  const normalized = normalizeServiceToken(value);
  if (normalized) {
    tokens.add(normalized);
  }

  const parts = (value || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^A-Z0-9]+/)
    .filter(part => part.length >= 3);

  for (const part of parts) {
    tokens.add(part);
    const withoutPrefix = part.replace(/^(GA|GU\d*|MYTP|NET|PMU|PMR|MXX|DFG)/, '');
    if (withoutPrefix.length >= MIN_SERVICE_TOKEN_LENGTH) {
      tokens.add(withoutPrefix);
    }
    const withoutAffixes = part
      .replace(/^(GA|GU\d*|MYTP|NET|PMU|PMR|MXX|DFG)/, '')
      .replace(/(PART2?|CI|GA|MTN|OM|MOOV|AIRTEL)$/g, '');
    if (withoutAffixes.length >= MIN_SERVICE_TOKEN_LENGTH) {
      tokens.add(withoutAffixes);
    }
  }

  return [...tokens];
}

/** Cash-in MOOV (ex. GACASHINMOOV, CASHINMOOV côté partenaire). */
function isMoovCashInPartner(norm: string): boolean {
  return norm.includes('MOOV')
    && norm.includes('CASHIN')
    && !norm.includes('PAIEMENT')
    && !norm.includes('MARCHAND');
}

/** Paiement marchand MOOV (ex. GAPAIEMENTMARCHANDMOOV). */
function isMoovMerchantPartner(norm: string): boolean {
  return norm.includes('MOOV') && (norm.includes('PAIEMENT') || norm.includes('MARCHAND'));
}

function hasTrxBoOperatorPrefix(norm: string): boolean {
  return /^(GA|GU\d*|MYTP|NET|PMU|PMR|MXX|DFG)/.test(norm);
}

/**
 * Règles MOOV GA : sépare cash-in et paiement marchand.
 * Ex. partenaire GACASHINMOOV ↔ BO GACASHINMOOV (pas CASHINMOOV nu ni paiement marchand).
 */
export function matchesMoovGaServiceLabels(boNormalized: string, partnerNormalized: string): boolean {
  if (!boNormalized.includes('MOOV') && !partnerNormalized.includes('MOOV')) {
    return false;
  }

  const partnerCashIn = isMoovCashInPartner(partnerNormalized);
  const partnerMerchant = isMoovMerchantPartner(partnerNormalized);
  const boCashIn = boNormalized.includes('CASHIN')
    && !boNormalized.includes('PAIEMENT')
    && !boNormalized.includes('MARCHAND');
  const boMerchant = boNormalized.includes('PAIEMENT') || boNormalized.includes('MARCHAND');

  if (partnerCashIn) {
    if (!boCashIn || boMerchant || !boNormalized.includes('CASHINMOOV')) {
      return false;
    }
    if (boNormalized.includes('PART') && !partnerNormalized.includes('PART')) {
      return false;
    }
    return hasTrxBoOperatorPrefix(boNormalized);
  }

  if (partnerMerchant) {
    if (!boMerchant || boCashIn) {
      return false;
    }
    if (!boNormalized.includes('PAIEMENT') && !boNormalized.includes('MARCHAND')) {
      return false;
    }
    return hasTrxBoOperatorPrefix(boNormalized);
  }

  return false;
}

/** Libellés partenaire Airtel GA (Merchant Payment, Cash In…) ↔ services TRXBO GA_*_AIRTEL. */
export function matchesAirtelGaServiceLabels(boNormalized: string, partnerNormalized: string): boolean {
  if (!boNormalized.includes('AIRTEL')) {
    return false;
  }
  if (partnerNormalized.includes('MERCHANTPAYMENT') || partnerNormalized.includes('MERCHANT')) {
    return boNormalized.includes('PAIEMENTMARCHAND') || boNormalized.includes('PAYMENT');
  }
  if (partnerNormalized.includes('CASHIN') || partnerNormalized.includes('CASH')) {
    return boNormalized.includes('CASHIN');
  }
  return false;
}

/**
 * Vérifie si un service partenaire correspond à un service TRXBO (égalité ou inclusion partielle).
 * Ex. partenaire CASHINMTN ↔ BO CASHINMTN, CASHINMTNPART, GU2_CASHINMTNPART_CI, MYTP_CASHINMTN.
 */
export function partnerServiceMatchesBo(partnerValue: string, boValue: string): boolean {
  const partnerNorm = normalizeServiceToken(partnerValue);
  const boNorm = normalizeServiceToken(boValue);
  if (!partnerNorm || !boNorm) {
    return false;
  }

  if (partnerNorm === boNorm) {
    return true;
  }

  if (matchesAirtelGaServiceLabels(boNorm, partnerNorm)) {
    return true;
  }

  // MOOV GA : cash-in et paiement marchand — pas de fallback générique (évite CASHINMOOV nu sur TRXBO)
  if (partnerNorm.includes('MOOV') || boNorm.includes('MOOV')) {
    if (isMoovCashInPartner(partnerNorm) || isMoovMerchantPartner(partnerNorm)) {
      return matchesMoovGaServiceLabels(boNorm, partnerNorm);
    }
  }

  const minLen = MIN_SERVICE_TOKEN_LENGTH;

  // Le libellé partenaire (souvent court / canonique) est contenu dans le libellé BO
  if (partnerNorm.length >= minLen && boNorm.includes(partnerNorm)) {
    return true;
  }

  // Le libellé BO est contenu dans le partenaire (cas rare)
  if (boNorm.length >= minLen && partnerNorm.includes(boNorm)) {
    return true;
  }

  // Comparaison par tokens extraits (segments séparés par _ sur TRXBO)
  const partnerTokens = extractServiceTokens(partnerValue);
  const boTokens = extractServiceTokens(boValue);

  for (const partnerToken of partnerTokens) {
    if (partnerToken.length < minLen) {
      continue;
    }
    // Évite les sous-chaînes trop génériques (ex. CASHINMOOV → token « CASHIN »).
    if (partnerToken.length < partnerNorm.length && partnerNorm.includes(partnerToken)) {
      continue;
    }
    if (boNorm.includes(partnerToken)) {
      return true;
    }
    for (const boToken of boTokens) {
      if (boToken.length < minLen) {
        continue;
      }
      if (boToken.length < boNorm.length && boNorm.includes(boToken)) {
        continue;
      }
      if (partnerToken === boToken || partnerToken.includes(boToken) || boToken.includes(partnerToken)) {
        return true;
      }
    }
  }

  return false;
}

export interface PartnerBoServiceMatch {
  partnerService: string;
  boServices: string[];
}

/**
 * Associe chaque service partenaire aux variantes TRXBO correspondantes.
 * Les services partenaire les plus courts sont traités en premier (ex. CASHINMTN avant CASHINMTNPART).
 */
export function matchPartnerServicesToBo(
  boValues: string[],
  partnerValues: string[]
): PartnerBoServiceMatch[] {
  const sortedPartners = [...partnerValues].sort(
    (a, b) => normalizeServiceToken(a).length - normalizeServiceToken(b).length
  );
  const assignedBo = new Set<string>();
  const matches: PartnerBoServiceMatch[] = [];

  for (const partnerService of sortedPartners) {
    const boServices: string[] = [];
    for (const boService of boValues) {
      if (assignedBo.has(boService)) {
        continue;
      }
      if (partnerServiceMatchesBo(partnerService, boService)) {
        boServices.push(boService);
        assignedBo.add(boService);
      }
    }
    if (boServices.length) {
      matches.push({
        partnerService,
        boServices: boServices.sort()
      });
    }
  }

  return matches.sort((a, b) => a.partnerService.localeCompare(b.partnerService));
}

export function countPartnerBoServiceOverlap(boValues: string[], partnerValues: string[]): number {
  let overlap = 0;
  for (const partnerValue of partnerValues) {
    for (const boValue of boValues) {
      if (partnerServiceMatchesBo(partnerValue, boValue)) {
        overlap++;
        break;
      }
    }
  }
  return overlap;
}

/** Ensemble des libellés service TRXBO rattachés à au moins un service partenaire. */
export function collectMatchedBoServiceLabels(serviceMatches: PartnerBoServiceMatch[]): Set<string> {
  const labels = new Set<string>();
  for (const match of serviceMatches) {
    for (const boService of match.boServices) {
      labels.add(boService);
    }
  }
  return labels;
}

/** Ne conserve que les lignes BO dont le service fait partie des services appariés. */
export function filterBoRowsByMatchedServices(
  rows: Record<string, string>[],
  boServiceColumn: string,
  serviceMatches: PartnerBoServiceMatch[]
): Record<string, string>[] {
  const allowed = collectMatchedBoServiceLabels(serviceMatches);
  if (!allowed.size) {
    return [];
  }
  return rows.filter(row => {
    const boSvc = readRowServiceValue(row, boServiceColumn);
    return boSvc && allowed.has(boSvc);
  });
}

/** Ne conserve que les lignes partenaire rattachées à un service apparié. */
export function filterPartnerRowsByMatchedServices(
  rows: Record<string, string>[],
  partnerServiceColumn: string,
  serviceMatches: PartnerBoServiceMatch[],
  rowMatchesPartnerService: (rowValue: string, partnerService: string) => boolean
): Record<string, string>[] {
  if (!serviceMatches.length) {
    return [];
  }
  return rows.filter(row => {
    const value = readRowServiceValue(row, partnerServiceColumn);
    if (!value) {
      return false;
    }
    return serviceMatches.some(match => rowMatchesPartnerService(value, match.partnerService));
  });
}

/**
 * Avant réconciliation : ne conserve que les lignes BO rattachées au service partenaire.
 */
export function filterBoRowsForServiceMatch(
  rows: Record<string, string>[],
  boServiceColumn: string,
  match: PartnerBoServiceMatch
): Record<string, string>[] {
  const partnerService = match.partnerService;
  if (!partnerService) {
    return [];
  }
  const allowedBo = new Set(match.boServices);
  return rows.filter(row => {
    const boSvc = readRowServiceValue(row, boServiceColumn);
    if (!boSvc) {
      return false;
    }
    if (allowedBo.has(boSvc)) {
      return true;
    }
    return partnerServiceMatchesBo(partnerService, boSvc);
  });
}

/** Vérifie qu'une ligne partenaire appartient au service partenaire canonique. */
export function partnerRowMatchesCanonicalService(
  canonicalPartnerService: string,
  rowPartnerValue: string
): boolean {
  const canonical = normalizeServiceToken(canonicalPartnerService);
  const rowNorm = normalizeServiceToken(rowPartnerValue);
  if (!canonical || !rowNorm) {
    return false;
  }
  if (canonical === rowNorm) {
    return true;
  }
  return partnerServiceMatchesBo(canonicalPartnerService, rowPartnerValue)
    || partnerServiceMatchesBo(rowPartnerValue, canonicalPartnerService);
}

/**
 * Avant réconciliation : ne conserve que les lignes partenaire du service concerné.
 */
export function filterPartnerRowsForServiceMatch(
  rows: Record<string, string>[],
  partnerServiceColumn: string,
  partnerService: string
): Record<string, string>[] {
  if (!partnerService) {
    return [];
  }
  return rows.filter(row => {
    const partnerSvc = readRowServiceValue(row, partnerServiceColumn);
    if (!partnerSvc) {
      return false;
    }
    return partnerRowMatchesCanonicalService(partnerService, partnerSvc);
  });
}

/** Parse la liste des libellés BO autorisés (champ boServices du résumé magique). */
export function parseAllowedBoServiceLabels(boServices?: string): string[] {
  if (!boServices) {
    return [];
  }
  return boServices.split(',').map(label => label.trim()).filter(Boolean);
}

/** Ne conserve que les lignes rattachées au service partenaire actif (réconciliation magique). */
export function scopeReconciliationResultToPartnerService(
  result: ReconciliationResponse,
  partnerService: string,
  boServiceCol: string,
  partnerServiceCol: string,
  allowedBoServices?: readonly string[]
): ReconciliationResponse {
  const allowedBo = new Set(
    (allowedBoServices ?? []).map(label => label.trim()).filter(Boolean)
  );

  const boMatchesService = (row: Record<string, string> | undefined): boolean => {
    if (!row) {
      return false;
    }
    const magicTag = String(row['_magicService'] || '').trim();
    if (magicTag && normalizeServiceToken(magicTag) === normalizeServiceToken(partnerService)) {
      return true;
    }
    const boSvc = readRowServiceValue(row, boServiceCol);
    if (!boSvc) {
      return false;
    }
    if (allowedBo.size && allowedBo.has(boSvc)) {
      return true;
    }
    return partnerServiceMatchesBo(partnerService, boSvc);
  };

  const partnerMatchesService = (row: Record<string, string> | undefined): boolean => {
    if (!row) {
      return false;
    }
    const magicTag = String(row['_magicService'] || '').trim();
    if (magicTag && normalizeServiceToken(magicTag) === normalizeServiceToken(partnerService)) {
      return true;
    }
    const partnerSvc = readRowServiceValue(row, partnerServiceCol);
    if (!partnerSvc) {
      return false;
    }
    return partnerRowMatchesCanonicalService(partnerService, partnerSvc);
  };

  const matches = (result.matches ?? []).filter((m: Match) => boMatchesService(m.boData));
  const mismatches = (result.mismatches ?? []).filter(boMatchesService);
  const boOnly = (result.boOnly ?? []).filter(boMatchesService);
  const partnerOnly = (result.partnerOnly ?? []).filter(partnerMatchesService);

  const totalMatches = matches.length;
  const totalBoOnly = mismatches.length + boOnly.length;
  const totalPartnerOnly = partnerOnly.length;

  return {
    ...result,
    matches,
    mismatches,
    boOnly,
    partnerOnly,
    totalMatches,
    totalBoOnly,
    totalPartnerOnly,
    totalMismatches: mismatches.length,
    totalBoRecords: totalMatches + totalBoOnly,
    totalPartnerRecords: totalPartnerOnly + totalMatches
  };
}
