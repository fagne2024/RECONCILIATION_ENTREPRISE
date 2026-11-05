import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { ReconciliationResponse, TrxboOppartAggregationTypeConfig } from '../models/reconciliation-response.model';
import { FraisTransaction } from '../models/frais-transaction.model';
import { CommissionTransaction } from '../models/commission.model';
import { ConfigurationCalculService } from './configuration-calcul.service';

export type EcartDetailSource = 'BO' | 'PARTNER';

export type EcartRegularisationType = 'TSOP' | 'TRXSF' | 'ECART_PARTNER' | 'TRXSF_PARTNER' | string;

/**
 * Catégorie d'agrégat, indépendante du libellé du type (commentaire) : sert à agréger
 * les totaux. Les lignes BO et partenaire d'un même type de commentaire sont regroupées
 * par catégorie (`TSOP` pour les écarts BO, `PARTNER` pour les écarts partenaire).
 */
export type EcartCategory =
  | 'CORRESPONDANCE'
  | 'TSOP'
  | 'ECART_BO'
  | 'PARTNER'
  | 'TRXSF'
  | 'RGFRAIS'
  | 'MISMATCH';

export interface EcartDetailLine {
  type: EcartRegularisationType;
  /** Catégorie d'agrégat (pour les totaux) dérivée du type de commentaire. */
  category: EcartCategory;
  source: EcartDetailSource;
  service: string;
  agence: string;
  montant: number;
  montantBo: number | null;
  frais: number;
  /** Commission (versement de commission) rattachée à la ligne, toujours positive. */
  commission?: number;
  montantARegulariser: number;
  date: string;
  idTransaction: string;
  numeroTransGu: string;
  commentaire: string;
  typeOperation: string;
  /** Libellé du type d'opération supplémentaire rattaché (colonne synthétique « AdditionalOperationType »). */
  additionalOperationType?: string;
  /** Vrai si la ligne est exclue de la régularisation car son type d'OPPART n'est pas listé pour ce type supplémentaire. */
  regularisationExclue?: boolean;
}

export interface EcartAggregateRow {
  code: string;
  label: string;
  /** Catégorie (pour les totaux), alignée sur les détails de l'agrégat. */
  category: EcartCategory;
  count: number;
  volume: number;
  frais: number;
  montantARegulariser: number;
  details: EcartDetailLine[];
}

export interface CertificationSoldeContext {
  response: ReconciliationResponse;
  partnerData: Record<string, string>[];
  boData: Record<string, string>[];
  fraisConfigs?: FraisTransaction[];
  commissionConfigs?: CommissionTransaction[];
  dateDe?: string;
  dateAu?: string;
}

export interface OppartOperationTypeVolume {
  type: string;
  volume: number;
}

export interface OppartOperationBreakdown {
  hasData: boolean;
  volume: number;
  frais: number;
  otherTypes: OppartOperationTypeVolume[];
}

/** Composant de règle de régularisation, normalisé pour l'évaluation. */
interface NormalizedRegularisationComponent {
  source: string;
  type: string;
  sign: string;
  negativeTokens: string[];
  defaultSign: string;
  coefficient: number;
}

/** Règle de régularisation d'un cas, indexée par libellé de commentaire normalisé. */
interface NormalizedRegularisationRule {
  components: NormalizedRegularisationComponent[];
  /** Vrai si la règle comporte au moins un composant de type OPPART (applicable aux lignes partenaire). */
  hasOppartComponents: boolean;
}

/** Mode de régularisation côté BO, piloté par la configuration du modèle. */
export type AggregationBoMode = 'MONTANT_FRAIS' | 'MONTANT' | 'FRAIS' | 'SIMPLE' | 'NONE';

/** Mode de régularisation côté partenaire, piloté par la configuration du modèle. */
export type AggregationPartnerMode = 'MONTANT' | 'FRAIS' | 'ZERO' | 'NONE';

/** Descripteur normalisé d'un type d'agrégat d'écart, dérivé de la configuration du modèle. */
export interface AggregationTypeDescriptor {
  kind: string;
  commentBo: string;
  commentPartner: string;
  boLabel: string;
  partnerLabel: string;
  boMode: AggregationBoMode;
  partnerMode: AggregationPartnerMode;
}

/** Normalisation des clés de correspondance de la configuration /frais (casse, accents, séparateurs). */
export function normalizeFraisKey(value: string | null | undefined): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export interface TrxboServiceRow {
  service: string;
  /** Client (agence) de la ligne : la configuration /frais est indexée sur service + agence. */
  agence: string;
  count: number;
  volume: number;
  frais: number;
  montantFrais: number;
  /** Faux si aucune configuration ne correspond au couple service + agence. */
  fraisConfigExact: boolean;
}

export interface TrxboServiceBreakdown {
  hasData: boolean;
  rows: TrxboServiceRow[];
  totalCount: number;
  totalVolume: number;
  totalMontantFrais: number;
}

export interface CertificationSoldeComputed {
  soldeOuvertureOppart: number | null;
  soldeClotureOppart: number | null;
  soldesHorsPeriode: boolean;
  mouvementNetOppart: number;
  fraisAttendu: number | null;
  totalDebit: number;
  totalCredit: number;
  volumeMatches: number;
  volumeEcartBo: number;
  volumeEcartPartner: number;
  montantEcartPartenaire: number;
  compenseTotal: number;
  compenseDetails: EcartDetailLine[];
  /** Écarts partenaire hors compense (lignes de compense exclues). */
  ecartPartenaireDetails: EcartDetailLine[];
  totalRegularisation: number;
  aggregates: EcartAggregateRow[];
  regularisationDetails: EcartDetailLine[];
  oppartOperationBreakdown: OppartOperationBreakdown;
  trxboServiceBreakdown: TrxboServiceBreakdown;
  totals: {
    matches: number;
    boOnly: number;
    partnerOnly: number;
    mismatches: number;
    totalBoRecords: number;
    totalPartnerRecords: number;
  };
}

/** Tableaux du PDF de certification conservés avec le résultat enregistré. */
export interface CertificationResultatDetails {
  regularisation: { label: string; count: number; volume: number; frais: number; montantARegulariser: number }[];
  compense: {
    parAgence: { agence: string; montant: number }[];
    totalPartenaire: number | null;
    ecartLabel: string | null;
    ecart: number | null;
  } | null;
  ecartPartenaire: {
    parAgence: { agence: string; montant: number }[];
    totalListe: number;
    totalFichier: number | null;
    ecartLabel: string | null;
    ecart: number | null;
    lignes: { numeroTransGu: string; service: string; agence: string; montant: number; statut: 'OK' | 'KO' }[];
    okCount: number | null;
    koCount: number | null;
  } | null;
  typesOperations: { type: string; volume: number }[];
  trxboParService: {
    rows: { service: string; agence: string; count: number; volume: number; frais: number; montantFrais: number }[];
    totalCount: number;
    totalVolume: number;
    totalMontantFrais: number;
  } | null;
}

/** Résultat de certification tel qu'enregistré (chiffres clés du PDF + détails). */
export interface CertificationResultat {
  id?: number;
  numeroCompte: string;
  dateDebut: string;
  dateFin: string;
  env: string | null;
  pays: string | null;
  heureOuverture: string | null;
  heureCloture: string | null;
  titre: string | null;
  soldeOuverture: number | null;
  soldeCloture: number | null;
  totalDebit: number | null;
  totalCredit: number | null;
  variation: number | null;
  mouvementNetOppart: number | null;
  fraisAttendu: number | null;
  fraisFactures: number | null;
  ecartFrais: number | null;
  ecartMouvement: number | null;
  totalRegularisation: number | null;
  ecartCertification: number | null;
  soldeClotureTheorique: number | null;
  volumeEcartBo: number | null;
  volumeEcartPartenaire: number | null;
  nbLignesBo: number | null;
  nbLignesPartenaire: number | null;
  nbCorrespondances: number | null;
  commentaire: string | null;
  detailsJson: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/** Ligne de la liste des certifications enregistrées. */
export interface CertificationResultatSummary {
  id: number;
  numeroCompte: string;
  dateDebut: string;
  dateFin: string;
  env: string | null;
  pays: string | null;
  titre: string | null;
  soldeOuverture: number | null;
  soldeCloture: number | null;
  ecartMouvement: number | null;
  ecartCertification: number | null;
  soldeClotureTheorique: number | null;
  commentaire: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CertificationResultatFilter {
  numeroCompte?: string;
  env?: string;
  pays?: string;
  dateDebut?: string;
  dateFin?: string;
}

/** Page de la liste des certifications enregistrées (numérotation à partir de 0). */
export interface CertificationResultatPage {
  content: CertificationResultatSummary[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

@Injectable({ providedIn: 'root' })
export class CertificationSoldeService {
  private static readonly OPPART_TYPE_KEYS = [
    'Type',
    'type',
    'Type Opération',
    'Type Operation',
    'Type operation',
    'typeOperation',
    'Type_Operation',
    'type_operation'
  ];

  /**
   * Types d'opération OPPART retenus dans le périmètre de l'Écart partenaire à régulariser.
   * Tout le reste (compense, approvisionnement, ajustement, régularisation de solde, …)
   * est exclu du calcul.
   */
  private static readonly ECART_PARTNER_TYPES_RETENUS = [
    'IMPACTCOMPTEGENERAL',
    'FRAISTRANSACTION',
    'VERSEMENTCOMMISSION'
  ];

  /** Type d'opération des lignes alimentant l'agrégat RGFRAIS. */
  private static readonly FEES_OPERATION_TYPE = 'FRAISTRANSACTION';

  private readonly compteSoldeBoUrl = '/api/compte-solde-bo';
  private readonly compteSoldeClotureUrl = '/api/compte-solde-cloture';
  private readonly resultatsUrl = '/api/certification-solde-resultats';

  constructor(private http: HttpClient, private calcul: ConfigurationCalculService) {}

  compute(context: CertificationSoldeContext): CertificationSoldeComputed {
    const { response, partnerData, boData, fraisConfigs = [], commissionConfigs = [], dateDe, dateAu } = context;
    const { aggregates, regularisationDetails } = this.buildAggregates(response, boData, fraisConfigs, commissionConfigs);
    const volumeMatches = this.sumMatchVolumes(response);
    const volumeEcartBo = this.sumVolumeEcartBo(aggregates);

    // Total à régulariser = Écart partenaire (montant OPPART signé)
    //   + RGFRAIS (frais, négatif) + TSOP (montant + frais) + TRX SF (frais).
    // L'Écart partenaire est restreint aux opérations IMPACT_COMPTE_GENERAL,
    // FRAIS_TRANSACTION et VERSEMENT_COMMISSION : compense, approvisionnement,
    // ajustement et régularisation de solde sont exclus du périmètre.
    const compenseDetails = regularisationDetails
      .filter(d => d.category === 'PARTNER' && this.isCompenseDetail(d));
    const compenseTotal = compenseDetails.reduce((s, d) => s + d.montant, 0);
    const ecartPartenaireDetails = regularisationDetails
      .filter(d => d.category === 'PARTNER' && this.isEcartPartenaireRetenu(d));
    const montantEcartPartenaire = ecartPartenaireDetails.reduce((s, d) => s + d.montant, 0);

    // Détail de régularisation : on écarte les lignes écart partenaire hors périmètre
    // (compense, approvisionnement, ajustement, régularisation de solde).
    const regularisationDetailsRetenues = regularisationDetails.filter(
      d => d.category !== 'PARTNER' || this.isEcartPartenaireRetenu(d)
    );

    // Agrégat Écart partenaire restreint au périmètre retenu (hors compense et autres opérations).
    const aggregatesRetenues = this.filterEcartPartenaireAggregate(aggregates, ecartPartenaireDetails);
    const totalRegularisation = this.sumTotalARegulariser(aggregatesRetenues, montantEcartPartenaire);

    // Montant écarts Partenaire : même périmètre que l'Écart partenaire (compense exclue).
    const volumeEcartPartner = this.sumVolumeEcartPartner(aggregatesRetenues);

    const mouvementNetOppart = this.extractOppartMouvementNet(partnerData);
    const soldesPeriode = this.extractOppartSoldesPeriode(partnerData, dateDe, dateAu);
    const oppartOperationBreakdown = this.extractOppartOperationBreakdown(partnerData);
    const trxboServiceBreakdown = this.extractTrxboServiceBreakdown(boData, fraisConfigs);
    const debitCredit = this.extractDebitCredit(partnerData);

    // Frais attendu = somme du détail par service + client. Même source que le
    // tableau de synthèse, donc plus de divergence entre les deux.
    const fraisAttendu = trxboServiceBreakdown.hasData
      ? trxboServiceBreakdown.totalMontantFrais
      : null;

    return {
      soldeOuvertureOppart: soldesPeriode.ouverture,
      soldeClotureOppart: soldesPeriode.cloture,
      soldesHorsPeriode: soldesPeriode.horsPeriode,
      mouvementNetOppart,
      fraisAttendu,
      totalDebit: debitCredit.debit,
      totalCredit: debitCredit.credit,
      volumeMatches,
      volumeEcartBo,
      volumeEcartPartner,
      montantEcartPartenaire,
      compenseTotal,
      compenseDetails,
      ecartPartenaireDetails,
      totalRegularisation,
      aggregates: aggregatesRetenues,
      regularisationDetails: regularisationDetailsRetenues,
      oppartOperationBreakdown,
      trxboServiceBreakdown,
      totals: {
        matches: response.totalMatches ?? response.matches?.length ?? 0,
        boOnly: response.totalBoOnly ?? response.boOnly?.length ?? 0,
        partnerOnly: response.totalPartnerOnly ?? response.partnerOnly?.length ?? 0,
        mismatches: response.totalMismatches ?? response.mismatches?.length ?? 0,
        totalBoRecords: response.totalBoRecords ?? 0,
        totalPartnerRecords: response.totalPartnerRecords ?? 0
      }
    };
  }

  computeVariation(soldeOuverture: number | null, soldeCloture: number | null): number | null {
    if (soldeOuverture == null || soldeCloture == null || Number.isNaN(soldeOuverture) || Number.isNaN(soldeCloture)) {
      return null;
    }
    return soldeCloture - soldeOuverture;
  }

  computeEcartCertification(variation: number | null, mouvementNetOppart: number): number | null {
    if (variation == null) {
      return null;
    }
    return this.calcul.evaluate(
      'CERTIF.ECART_MOUVEMENT',
      { VARIATION: variation, MOUVEMENT_NET_OPPART: mouvementNetOppart },
      variation - mouvementNetOppart
    );
  }

  hasRegularisationDetails(row: EcartAggregateRow): boolean {
    return (
      row.category === 'TSOP' ||
      row.category === 'PARTNER' ||
      row.category === 'TRXSF' ||
      row.category === 'RGFRAIS'
    ) && row.details.length > 0;
  }

  /** Ligne d'écart partenaire qui est une opération de compensation (Compense_client / Compense_fournisseur, …). */
  private isCompenseDetail(detail: EcartDetailLine): boolean {
    return this.isCompenseOperation(detail.typeOperation, detail.service);
  }

  /** Vrai si le type d'opération (ou le service) désigne une compensation. */
  private isCompenseOperation(
    typeOperation: string | null | undefined,
    service: string | null | undefined
  ): boolean {
    const haystack = `${typeOperation || ''} ${service || ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const tokens = this.calcul.getListRaw('CERTIF.TOKENS_COMPENSE', ['COMPENS']);
    return tokens.some(token => haystack.includes(token.toLowerCase()));
  }

  /** Vrai si la ligne partenaire est une compensation (commentaire RGFRAIS ou non). */
  private isCompenseRecord(record: Record<string, string>): boolean {
    const typeOperation = this.getTypeValue(record);
    const service = this.extractField(record, ['Service', 'service', 'Type Opération', 'Type Operation']);
    return this.isCompenseOperation(typeOperation, service);
  }

  /**
   * Vrai si la ligne partenaire est une ligne de frais (RGFRAIS). Le type d'opération doit
   * être FRAIS_TRANSACTION : un commentaire « RGFRAIS » porté par une autre opération
   * (compense, impact, …) ne doit jamais alimenter l'agrégat RGFRAIS.
   */
  private isRgfraisPartnerRecord(
    record: Record<string, string>,
    partnerByComment: Map<string, AggregationTypeDescriptor>,
    rgfraisTokens: string[]
  ): boolean {
    const typeOperation = this.normalizeOperationType(this.getTypeValue(record));
    if (typeOperation && !typeOperation.includes(CertificationSoldeService.FEES_OPERATION_TYPE)) {
      return false;
    }
    const comment = this.normalizeComment(record);
    const descriptor = comment ? partnerByComment.get(this.normalizeCaseKey(comment)) : undefined;
    return descriptor?.partnerMode === 'FRAIS' || this.containsAnyToken(typeOperation, rgfraisTokens);
  }

  /**
   * Vrai si la ligne d'écart partenaire entre dans le périmètre de régularisation :
   * uniquement IMPACT_COMPTE_GENERAL, FRAIS_TRANSACTION et VERSEMENT_COMMISSION.
   */
  private isEcartPartenaireRetenu(detail: EcartDetailLine): boolean {
    if (detail.regularisationExclue) {
      return false;
    }
    const type = (detail.typeOperation || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s_\-]/g, '');
    return this.calcul
      .getList('CERTIF.TYPES_ECART_PARTENAIRE_RETENUS', CertificationSoldeService.ECART_PARTNER_TYPES_RETENUS)
      .includes(type);
  }

  /**
   * Restreint les agrégats d'écart partenaire (toutes catégories `PARTNER`, donc tous les
   * types de commentaire) à leurs lignes retenues dans le périmètre de régularisation.
   */
  private filterEcartPartenaireAggregate(
    aggregates: EcartAggregateRow[],
    details: EcartDetailLine[]
  ): EcartAggregateRow[] {
    const retainedByCode = new Map<string, EcartDetailLine[]>();
    for (const detail of details) {
      const list = retainedByCode.get(detail.type) ?? [];
      list.push(detail);
      retainedByCode.set(detail.type, list);
    }
    const result: EcartAggregateRow[] = [];
    for (const row of aggregates) {
      if (row.category !== 'PARTNER') {
        result.push(row);
        continue;
      }
      const retained = retainedByCode.get(row.code) ?? [];
      if (!retained.length) {
        continue;
      }
      const volume = retained.reduce((sum, d) => sum + d.montant, 0);
      const frais = retained.reduce((sum, d) => sum + d.frais, 0);
      const montantARegulariser = retained.reduce((sum, d) => sum + d.montantARegulariser, 0);
      result.push({
        ...row,
        count: retained.length,
        volume,
        frais,
        montantARegulariser,
        details: retained
      });
    }
    return result;
  }

  /** Écarts BO (TSOP et types associés) → montant à régulariser ; Écart BO générique → volume. */
  private sumVolumeEcartBo(aggregates: EcartAggregateRow[]): number {
    return aggregates.reduce((sum, row) => {
      if (row.category === 'TSOP') {
        return sum + row.montantARegulariser;
      }
      if (row.category === 'ECART_BO') {
        return sum + row.volume;
      }
      return sum;
    }, 0);
  }

  /** Écart partenaire (tous types) → montant OPPART ; TRX SF → frais ; RGFRAIS → volume. */
  private sumVolumeEcartPartner(aggregates: EcartAggregateRow[]): number {
    return aggregates.reduce((sum, row) => {
      if (row.category === 'PARTNER' || row.category === 'TRXSF') {
        return sum + row.montantARegulariser;
      }
      if (row.category === 'RGFRAIS') {
        return sum + row.volume;
      }
      return sum;
    }, 0);
  }

  /**
   * Total à régulariser = Écart partenaire hors compense (montant OPPART signé)
   *   + RGFRAIS (frais, négatif) + TSOP et types BO (montant + frais) + TRX SF (frais).
   */
  private sumTotalARegulariser(
    aggregates: EcartAggregateRow[],
    montantEcartPartenaireHorsCompense: number
  ): number {
    return aggregates.reduce((sum, row) => {
      if (row.category === 'TSOP' || row.category === 'TRXSF') {
        return sum + row.montantARegulariser;
      }
      if (row.category === 'RGFRAIS') {
        return sum + row.volume;
      }
      return sum;
    }, montantEcartPartenaireHorsCompense);
  }

  saveSoldeOuverture(numeroCompte: string, dateSolde: string, soldeBo: number): Observable<unknown> {
    return this.http.post(`${this.compteSoldeBoUrl}/set`, { numeroCompte, dateSolde, soldeBo });
  }

  saveSoldeCloture(numeroCompte: string, dateSolde: string, soldeCloture: number): Observable<unknown> {
    return this.http.post(`${this.compteSoldeClotureUrl}/set`, { numeroCompte, dateSolde, soldeCloture });
  }

  saveResultat(resultat: CertificationResultat): Observable<CertificationResultat> {
    return this.http.post<CertificationResultat>(this.resultatsUrl, resultat);
  }

  listResultats(filter: CertificationResultatFilter = {}, page = 0, size = 20): Observable<CertificationResultatPage> {
    const params: Record<string, string> = { page: String(page), size: String(size) };
    if (filter.numeroCompte?.trim()) params['numeroCompte'] = filter.numeroCompte.trim();
    if (filter.env) params['env'] = filter.env;
    if (filter.pays) params['pays'] = filter.pays;
    if (filter.dateDebut) params['dateDebut'] = filter.dateDebut;
    if (filter.dateFin) params['dateFin'] = filter.dateFin;
    return this.http.get<CertificationResultatPage>(this.resultatsUrl, { params });
  }

  getResultat(id: number): Observable<CertificationResultat> {
    return this.http.get<CertificationResultat>(`${this.resultatsUrl}/${id}`);
  }

  /** Met à jour le pays d'une certification enregistrée (null pour retirer le pays). */
  updateResultatPays(id: number, pays: string | null): Observable<CertificationResultat> {
    return this.http.put<CertificationResultat>(`${this.resultatsUrl}/${id}/pays`, { pays });
  }

  deleteResultat(id: number): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.resultatsUrl}/${id}`);
  }

  async loadSoldeOuverture(numeroCompte: string, dateSolde: string): Promise<number | null> {
    if (!numeroCompte?.trim()) return null;
    try {
      const value = await firstValueFrom(
        this.http.get<number | null>(`${this.compteSoldeBoUrl}/get`, {
          params: { numeroCompte, dateSolde }
        })
      );
      return value == null ? null : Number(value);
    } catch {
      return null;
    }
  }

  async loadSoldeCloture(numeroCompte: string, dateSolde: string): Promise<number | null> {
    if (!numeroCompte?.trim()) return null;
    try {
      const value = await firstValueFrom(
        this.http.get<number | null>(`${this.compteSoldeClotureUrl}/get`, {
          params: { numeroCompte, dateSolde }
        })
      );
      return value == null ? null : Number(value);
    } catch {
      return null;
    }
  }

  private buildAggregates(
    response: ReconciliationResponse,
    boData: Record<string, string>[],
    fraisConfigs: FraisTransaction[],
    commissionConfigs: CommissionTransaction[] = []
  ): { aggregates: EcartAggregateRow[]; regularisationDetails: EcartDetailLine[] } {
    const map = new Map<string, EcartAggregateRow>();
    const regularisationDetails: EcartDetailLine[] = [];
    const boByTransGu = this.buildBoIndex(response, boData);
    const regularisationRules = this.buildRegularisationRuleIndex(response);

    // Toute la logique de classification/libellisation est pilotée par la configuration du
    // modèle (types d'agrégats). Aucun libellé de commentaire n'est codé en dur ici.
    const descriptors = this.resolveAggregationDescriptors(response);
    const boByComment = new Map<string, AggregationTypeDescriptor>();
    const partnerByComment = new Map<string, AggregationTypeDescriptor>();
    for (const descriptor of descriptors) {
      if (descriptor.kind !== 'partnerOnly' && descriptor.boMode !== 'NONE' && descriptor.commentBo) {
        boByComment.set(this.normalizeCaseKey(descriptor.commentBo), descriptor);
      }
      if (descriptor.partnerMode !== 'NONE' && descriptor.commentPartner) {
        partnerByComment.set(this.normalizeCaseKey(descriptor.commentPartner), descriptor);
      }
    }
    const defaults = this.defaultAggregationDescriptors(response.configComments);
    const defaultBoDescriptor = this.findDescriptorByKind(descriptors, 'tsop')
      ?? descriptors.find(d => d.boMode === 'MONTANT_FRAIS')
      ?? defaults.find(d => d.kind === 'tsop')!;
    const defaultPartnerDescriptor = this.findDescriptorByKind(descriptors, 'ecart')
      ?? this.findDescriptorByKind(descriptors, 'partnerOnly')
      ?? descriptors.find(d => d.partnerMode === 'MONTANT')
      ?? defaults.find(d => d.kind === 'ecart')!;
    const ecartDescriptor = this.findDescriptorByKind(descriptors, 'ecart')
      ?? defaults.find(d => d.kind === 'ecart')!;
    const partnerFraisDescriptor = descriptors.find(d => d.partnerMode === 'FRAIS') ?? null;

    // Jetons de détection pilotés par les règles LISTE (au lieu de littéraux codés en dur) :
    // TRX SF / OP SANS FRAIS et RGFRAIS / frais. Lus une seule fois par calcul.
    const trxsfTokens = this.calcul.getListRaw('CERTIF.TOKENS_TRXSF', ['TRXSF']);
    const rgfraisTokens = this.calcul.getListRaw('CERTIF.TOKENS_RGFRAIS', ['RGFRAIS', 'FRAIS']);

    const upsertSimple = (code: string, label: string, amount: number, frais = 0, category: EcartCategory = 'CORRESPONDANCE') => {
      const row = map.get(code) ?? this.emptyAggregate(code, label, category);
      row.count += 1;
      row.volume += amount;
      row.frais += frais;
      map.set(code, row);
    };

    const pushDetailToAggregate = (code: string, label: string, detail: EcartDetailLine) => {
      regularisationDetails.push(detail);
      const row = map.get(code) ?? this.emptyAggregate(code, label, detail.category);
      row.count += 1;
      row.volume += detail.montant;
      row.frais += detail.frais;
      row.montantARegulariser += detail.montantARegulariser;
      row.details.push(detail);
      map.set(code, row);
    };

    // Type de ligne non configuré : agrégat dynamique (montant + frais), sans littéral codé en dur.
    const dynamicDescriptor = (comment: string): AggregationTypeDescriptor => ({
      kind: 'dynamic',
      commentBo: comment,
      commentPartner: comment,
      boLabel: comment,
      partnerLabel: comment,
      boMode: 'MONTANT_FRAIS',
      partnerMode: 'MONTANT'
    });

    const buildBoDetail = (
      descriptor: AggregationTypeDescriptor,
      comment: string,
      record: Record<string, string>
    ) => {
      const code = this.aggregationBoCode(descriptor);
      const label = this.aggregationBoLabel(descriptor, comment);
      const mode = descriptor.boMode;
      const montant = this.parseAmount(record);
      const service = this.extractField(record, ['Service', 'service']);
      const agence = this.extractField(record, ['Agence', 'agence', 'Code proprietaire']);
      const frais = this.calculateFrais(fraisConfigs, service, agence, montant);
      // Montant OPPART négatif si le service contient un service TSOP à signe négatif (règle
      // de calcul prioritaire ; à défaut CASHIN, AIRTIME, SEND), sinon positif.
      const serviceUppercase = (service || '').toUpperCase();
      const tsopNegativeServices = this.calcul.getListRaw('CERTIF.SERVICES_TSOP_NEGATIFS', ['CASHIN', 'AIRTIME', 'SEND']);
      const montantOppart = tsopNegativeServices.some(s => serviceUppercase.includes(s))
        ? -Math.abs(montant)
        : Math.abs(montant);
      const tsopInclureFrais = this.calcul.getNumber('CERTIF.TSOP_INCLURE_FRAIS', 1) !== 0;
      // Commission (versement de commission) : source dédiée (service + agence), toujours positive.
      const tsopInclureCommission = this.calcul.getNumber('CERTIF.TSOP_INCLURE_COMMISSION', 1) !== 0;
      const commission = tsopInclureCommission
        ? this.calculateCommission(commissionConfigs, service, agence, montant)
        : 0;

      let montantARegulariser: number;
      let montantDetail = montantOppart;
      let category: EcartCategory = 'TSOP';
      const commentKey = this.normalizeOperationType(comment);
      const isTrxSansFrais = this.isTrxSansFraisComment(commentKey, trxsfTokens);
      if (mode === 'FRAIS' || isTrxSansFrais) {
        // Frais seuls régularisés : le montant OPPART ne sert qu'au calcul des frais.
        // Règle métier : pour TRX SANS FRAIS, uniquement les frais sont à régulariser.
        montantDetail = montant;
        montantARegulariser = frais;
        category = 'TRXSF';
      } else {
        const rule = this.findRegularisationRule(regularisationRules, comment);
        const ruleAmount = rule
          ? this.computeBoRegularisation(montant, frais, service, rule, comment, trxsfTokens)
          : null;
        if (ruleAmount != null) {
          montantARegulariser = ruleAmount + commission;
          montantDetail = this.computeBoPrimaryAmount(montant, frais, service, rule) ?? montantOppart;
        } else if (mode === 'MONTANT') {
          // Montant OPPART seul.
          montantARegulariser = montantOppart;
        } else {
          // Montant OPPART − frais + commission.
          montantARegulariser = (tsopInclureFrais ? montantOppart + frais : montantOppart) + commission;
        }
      }

      pushDetailToAggregate(code, label, {
        type: code,
        category,
        source: 'BO',
        service,
        agence,
        montant: montantDetail,
        montantBo: montantDetail,
        frais,
        commission,
        montantARegulariser,
        date: this.extractField(record, ['Date', 'date', 'Date opération', 'Date operation']),
        idTransaction: this.extractField(record, ['IDTransaction', 'ID Transaction', 'idTransaction']),
        numeroTransGu: this.extractNumeroTransGu(record),
        commentaire: comment,
        typeOperation: this.getTypeValue(record)
      });
    };

    // Détail partenaire pour un type dont le montant n'est pas régularisé (ex. OP SANS FRAIS :
    // les frais étant déjà régularisés côté BO, le montant partenaire est à 0).
    const buildPartnerZeroDetail = (
      descriptor: AggregationTypeDescriptor,
      comment: string,
      record: Record<string, string>
    ) => {
      const code = this.aggregationPartnerCode(descriptor);
      const label = this.aggregationPartnerLabel(descriptor, comment);
      const montant = this.parseAmount(record);
      const service = this.extractField(record, ['Service', 'service', 'Type Opération', 'Type Operation']);
      const agence = this.extractField(record, ['Agence', 'agence', 'Code proprietaire']);
      pushDetailToAggregate(code, label, {
        type: code,
        category: 'TRXSF',
        source: 'PARTNER',
        service,
        agence,
        montant,
        montantBo: null,
        frais: 0,
        montantARegulariser: 0,
        date: this.extractField(record, ['Date opération', 'Date operation', 'Date', 'date']),
        idTransaction: this.extractField(record, ['ID Transaction', 'IDTransaction', 'idTransaction']),
        numeroTransGu: this.extractNumeroTransGu(record),
        commentaire: label,
        typeOperation: this.getTypeValue(record)
      });
    };

    // Détail partenaire de type « frais » (RGFRAIS) : le montant OPPART correspond aux frais
    // à régulariser. On expose le détail comme pour TSOP / Écart partenaire / TRX SF.
    const buildPartnerFraisDetail = (
      descriptor: AggregationTypeDescriptor | undefined,
      comment: string,
      record: Record<string, string>
    ) => {
      const code = descriptor ? this.aggregationPartnerCode(descriptor) : 'RGFRAIS';
      const label = descriptor ? this.aggregationPartnerLabel(descriptor, comment) : 'RGFRAIS / Frais transaction';
      const montant = this.parseAmount(record);
      const service = this.extractField(record, ['Service', 'service', 'Type Opération', 'Type Operation']);
      const agence = this.extractField(record, ['Agence', 'agence', 'Code proprietaire']);
      pushDetailToAggregate(code, label, {
        type: code,
        category: 'RGFRAIS',
        source: 'PARTNER',
        service,
        agence,
        montant,
        montantBo: null,
        frais: 0,
        montantARegulariser: montant,
        date: this.extractField(record, ['Date opération', 'Date operation', 'Date', 'date']),
        idTransaction: this.extractField(record, ['ID Transaction', 'IDTransaction', 'idTransaction']),
        numeroTransGu: this.extractNumeroTransGu(record),
        commentaire: comment || label,
        typeOperation: 'FRAIS_TRANSACTION'
      });
    };

    for (const match of response.matches ?? []) {
      const { volume, frais } = this.extractMatchVolumeAndFrais(match.partnerData);
      // Convention : frais toujours négatifs (sortie de trésorerie).
      upsertSimple('MATCHES', 'Correspondances (TRXBO ↔ OPPART)', volume, frais === 0 ? 0 : -Math.abs(frais), 'CORRESPONDANCE');
    }

    // Lignes partenaire de type « frais » (config ou heuristique type d'opération) : leurs lignes
    // BO ne portent aucun commentaire (choix métier), on les retrouve par numéro GU.
    const rgfraisGuKeysFromPartner = new Set<string>();
    for (const record of response.partnerOnly ?? []) {
      // RGFRAIS = uniquement les lignes FRAIS_TRANSACTION (une compense commentée « RGFRAIS »
      // ne doit pas être traitée comme des frais).
      if (this.isRgfraisPartnerRecord(record, partnerByComment, rgfraisTokens)) {
        const guKey = this.normalizeTransGuKey(this.extractNumeroTransGu(record));
        if (guKey) {
          rgfraisGuKeysFromPartner.add(guKey);
        }
      }
    }

    // Numéros GU dont le montant ne doit pas être reporté aussi en Écart partenaire :
    // côté BO (types « frais seuls ») et côté partenaire (types à montant non régularisé).
    const noDoubleCountGuKeys = new Set<string>();
    for (const record of response.boOnly ?? []) {
      const comment = this.normalizeComment(record);
      const guKey = this.normalizeTransGuKey(this.extractNumeroTransGu(record));
      const matched = comment ? boByComment.get(this.normalizeCaseKey(comment)) : undefined;
      let descriptor: AggregationTypeDescriptor;

      if (matched) {
        descriptor = matched;
      } else if (!comment) {
        if (guKey && rgfraisGuKeysFromPartner.has(guKey)) {
          upsertSimple(
            this.aggregationBoCode(ecartDescriptor),
            this.aggregationBoLabel(ecartDescriptor, comment),
            this.parseAmount(record),
            0,
            'ECART_BO'
          );
          continue;
        }
        descriptor = defaultBoDescriptor;
      } else {
        descriptor = dynamicDescriptor(comment);
      }

      if (descriptor.boMode === 'NONE') {
        continue;
      }
      if (descriptor.boMode === 'SIMPLE') {
        upsertSimple(
          this.aggregationBoCode(descriptor),
          this.aggregationBoLabel(descriptor, comment),
          this.parseAmount(record),
          0,
          'ECART_BO'
        );
      } else {
        buildBoDetail(descriptor, comment || descriptor.commentBo || '', record);
      }
      if (descriptor.boMode === 'FRAIS' && guKey) {
        noDoubleCountGuKeys.add(guKey);
      }
    }

    // Types partenaire à montant non régularisé : leurs numéros GU ne doivent pas être
    // reportés aussi en Écart partenaire.
    for (const record of response.partnerOnly ?? []) {
      const comment = this.normalizeComment(record);
      const descriptor = comment ? partnerByComment.get(this.normalizeCaseKey(comment)) : undefined;
      if (descriptor && descriptor.partnerMode === 'ZERO') {
        const guKey = this.normalizeTransGuKey(this.extractNumeroTransGu(record));
        if (guKey) {
          noDoubleCountGuKeys.add(guKey);
        }
      }
    }

    for (const record of response.partnerOnly ?? []) {
      const comment = this.normalizeComment(record);
      const guKey = this.normalizeTransGuKey(this.extractNumeroTransGu(record));
      const matched = comment ? partnerByComment.get(this.normalizeCaseKey(comment)) : undefined;

      if (matched && matched.partnerMode === 'ZERO') {
        buildPartnerZeroDetail(matched, comment, record);
        continue;
      }

      // Une compensation n'alimente jamais RGFRAIS, même si le backend l'a commentée « RGFRAIS » :
      // elle reste une opération partenaire hors périmètre (listée dans la section Compense).
      if (this.isCompenseRecord(record)) {
        this.buildPartnerEcartDetail(
          record,
          map,
          regularisationDetails,
          this.aggregationPartnerCode(ecartDescriptor),
          this.aggregationPartnerLabel(ecartDescriptor, comment),
          regularisationRules,
          boByTransGu,
          fraisConfigs,
          false
        );
        continue;
      }

      // RGFRAIS = toujours une ligne FRAIS_TRANSACTION.
      if (this.isRgfraisPartnerRecord(record, partnerByComment, rgfraisTokens)) {
        buildPartnerFraisDetail(matched ?? partnerFraisDescriptor ?? undefined, comment, record);
        continue;
      }

      if (guKey && noDoubleCountGuKeys.has(guKey)) {
        continue;
      }

      // Un commentaire « frais » porté par un type non-frais ne doit pas créer d'agrégat RGFRAIS.
      const descriptor = (matched && matched.partnerMode !== 'FRAIS' && matched.kind !== 'rgfrais'
        ? matched
        : undefined) ?? defaultPartnerDescriptor;
      if (!descriptor || descriptor.partnerMode === 'NONE') {
        continue;
      }
      const partnerCode = this.aggregationPartnerCode(descriptor);
      const partnerLabel = partnerCode === 'ECART_PARTNER'
        ? this.aggregationPartnerLabel(ecartDescriptor, comment)
        : this.aggregationPartnerLabel(descriptor, comment);
      this.buildPartnerEcartDetail(
        record,
        map,
        regularisationDetails,
        partnerCode,
        partnerLabel,
        regularisationRules,
        boByTransGu,
        fraisConfigs
      );
    }

    for (const record of response.mismatches ?? []) {
      upsertSimple('MISMATCH', 'Correspondances multiples (>2 OPPART)', this.parseAmount(record), 0, 'MISMATCH');
    }

    // Ordre d'affichage : correspondances, écarts BO (TSOP puis types dynamiques), RGFRAIS,
    // TRX SF, écarts partenaire (types dynamiques puis générique), correspondances multiples.
    const boDynamicCodes = Array.from(map.keys()).filter(code => code.startsWith('BO__')).sort();
    const partnerDynamicCodes = Array.from(map.keys()).filter(code => code.startsWith('PARTNER__')).sort();
    const order = [
      'MATCHES', 'TSOP', ...boDynamicCodes, 'ECART_BO', 'RGFRAIS',
      ...partnerDynamicCodes, 'ECART_PARTNER', 'MISMATCH'
    ];
    const aggregates = order.filter(code => map.has(code)).map(code => map.get(code)!);
    return { aggregates, regularisationDetails };
  }

  /** Types d'agrégats résolus depuis la configuration du modèle (repli : libellés par défaut). */
  private resolveAggregationDescriptors(response: ReconciliationResponse): AggregationTypeDescriptor[] {
    const configured = response.trxboOppartConfig?.aggregationTypes;
    const additionalTypes = response.trxboOppartConfig?.additionalOperationTypes ?? [];
    const baseDescriptors = (configured && configured.length)
      ? configured
          .map(raw => this.normalizeAggregationDescriptor(raw))
          .filter((d): d is AggregationTypeDescriptor => !!d)
      : this.defaultAggregationDescriptors(response.configComments);

    // Complète avec les types d'opérations supplémentaires s'ils sont absents des agrégats
    const existingKinds = new Set(baseDescriptors.map(d => d.kind));
    for (const add of additionalTypes) {
      const kind = `additional:${add.label}`;
      if (existingKinds.has(kind)) {
        continue;
      }
      const commentBo = String(add.commentBo ?? '').trim();
      const commentPartner = String(add.commentPartner ?? add.commentBo ?? '').trim();
      if (commentBo.length === 0 && commentPartner.length === 0) {
        continue;
      }
      baseDescriptors.push({
        kind,
        commentBo,
        commentPartner,
        boLabel: String(add.commentBo ?? '').trim() || add.label,
        partnerLabel: String(add.commentPartner ?? '').trim() || add.label,
        boMode: 'MONTANT_FRAIS',
        partnerMode: 'MONTANT'
      });
    }
    return baseDescriptors;
  }

  private normalizeAggregationDescriptor(raw: TrxboOppartAggregationTypeConfig): AggregationTypeDescriptor | null {
    if (!raw) {
      return null;
    }
    const commentBo = String(raw.commentBo ?? '').trim();
    const commentPartner = String(raw.commentPartner ?? raw.commentBo ?? '').trim();
    const kind = String(raw.kind ?? '').trim() || `type:${this.normalizeCaseKey(commentBo)}`;
    return {
      kind,
      commentBo,
      commentPartner,
      boLabel: String(raw.boLabel ?? '').trim() || commentBo,
      partnerLabel: String(raw.partnerLabel ?? '').trim() || commentPartner,
      boMode: this.normalizeBoMode(raw.boMode),
      partnerMode: this.normalizePartnerMode(raw.partnerMode)
    };
  }

  /** Types d'agrégats par défaut (modèle 1:2 / SPECIAL_RATIO), utilisés sans configuration explicite. */
  private defaultAggregationDescriptors(comments?: Record<string, string>): AggregationTypeDescriptor[] {
    const c = (key: string, fallback: string) => (comments?.[key]?.trim() || fallback);
    return [
      { kind: 'tsop', commentBo: c('tsop', 'TSOP'), commentPartner: c('tsop', 'TSOP'), boLabel: c('tsop', 'TSOP'), partnerLabel: c('tsop', 'TSOP'), boMode: 'MONTANT_FRAIS', partnerMode: 'MONTANT' },
      { kind: 'trxsf', commentBo: c('trxsf', 'TRXSF'), commentPartner: c('trxsf', 'TRXSF'), boLabel: c('trxsf', 'TRXSF'), partnerLabel: 'OP SANS FRAIS', boMode: 'FRAIS', partnerMode: 'ZERO' },
      { kind: 'rgfrais', commentBo: c('rgfrais', 'RGFRAIS'), commentPartner: c('rgfrais', 'RGFRAIS'), boLabel: c('rgfrais', 'RGFRAIS'), partnerLabel: c('rgfrais', 'RGFRAIS'), boMode: 'NONE', partnerMode: 'FRAIS' },
      { kind: 'ecart', commentBo: c('ecart', 'Ecart'), commentPartner: c('ecart', 'Ecart'), boLabel: 'Écart BO', partnerLabel: 'Écart Partenaire', boMode: 'SIMPLE', partnerMode: 'MONTANT' },
      { kind: 'partnerOnly', commentBo: c('partnerOnly', 'Ecart'), commentPartner: c('partnerOnly', 'Ecart'), boLabel: c('partnerOnly', 'Ecart'), partnerLabel: c('partnerOnly', 'Ecart'), boMode: 'NONE', partnerMode: 'MONTANT' },
      { kind: 'trxsvc', commentBo: c('trxsvc', 'TRXSVC'), commentPartner: c('trxsvc', 'TRXSVC'), boLabel: c('trxsvc', 'TRXSVC'), partnerLabel: c('trxsvc', 'TRXSVC'), boMode: 'MONTANT_FRAIS', partnerMode: 'MONTANT' },
      { kind: 'fraisSansCommission', commentBo: c('fraisSansCommission', 'TRXSC'), commentPartner: c('fraisSansCommission', 'TRXSC'), boLabel: c('fraisSansCommission', 'TRXSC'), partnerLabel: c('fraisSansCommission', 'TRXSC'), boMode: 'MONTANT_FRAIS', partnerMode: 'MONTANT' },
      { kind: 'regcom', commentBo: c('regcom', 'REGCOM'), commentPartner: c('regcom', 'REGCOM'), boLabel: c('regcom', 'REGCOM'), partnerLabel: c('regcom', 'REGCOM'), boMode: 'MONTANT_FRAIS', partnerMode: 'MONTANT' },
      { kind: 'fraisEtCommission', commentBo: c('fraisEtCommission', 'RGFRAIS & REGCOM'), commentPartner: c('fraisEtCommission', 'RGFRAIS & REGCOM'), boLabel: c('fraisEtCommission', 'RGFRAIS & REGCOM'), partnerLabel: c('fraisEtCommission', 'RGFRAIS & REGCOM'), boMode: 'MONTANT_FRAIS', partnerMode: 'MONTANT' },
      { kind: 'trxsfTrxsvc', commentBo: c('trxsfTrxsvc', 'TRXSF & TRXSVC'), commentPartner: c('trxsfTrxsvc', 'TRXSF & TRXSVC'), boLabel: c('trxsfTrxsvc', 'TRXSF & TRXSVC'), partnerLabel: c('trxsfTrxsvc', 'TRXSF & TRXSVC'), boMode: 'MONTANT_FRAIS', partnerMode: 'MONTANT' }
    ];
  }

  private findDescriptorByKind(
    descriptors: AggregationTypeDescriptor[],
    kind: string
  ): AggregationTypeDescriptor | undefined {
    return descriptors.find(descriptor => descriptor.kind === kind);
  }

  private normalizeBoMode(value: string | undefined): AggregationBoMode {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (normalized === 'MONTANT_FRAIS' || normalized === 'MONTANT' || normalized === 'FRAIS' || normalized === 'SIMPLE' || normalized === 'NONE') {
      return normalized as AggregationBoMode;
    }
    return 'MONTANT_FRAIS';
  }

  private normalizePartnerMode(value: string | undefined): AggregationPartnerMode {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (normalized === 'MONTANT' || normalized === 'FRAIS' || normalized === 'ZERO' || normalized === 'NONE') {
      return normalized as AggregationPartnerMode;
    }
    return 'MONTANT';
  }

  /** Code d'agrégat BO : codes historiques pour les types connus, code dynamique sinon. */
  private aggregationBoCode(descriptor: AggregationTypeDescriptor): string {
    switch (descriptor.kind) {
      case 'tsop':
        return 'TSOP';
      case 'ecart':
        return 'ECART_BO';
      case 'rgfrais':
        return 'RGFRAIS';
      default:
        return `BO__${this.aggregationSlug(descriptor.commentBo || descriptor.boLabel || descriptor.kind)}`;
    }
  }

  /** Code d'agrégat partenaire : codes historiques pour les types connus, code dynamique sinon. */
  private aggregationPartnerCode(descriptor: AggregationTypeDescriptor): string {
    switch (descriptor.kind) {
      case 'tsop':
      case 'ecart':
      case 'partnerOnly':
        return 'ECART_PARTNER';
      case 'rgfrais':
        return 'RGFRAIS';
      default:
        return `PARTNER__${this.aggregationSlug(descriptor.partnerLabel || descriptor.commentPartner || descriptor.kind)}`;
    }
  }

  private aggregationBoLabel(descriptor: AggregationTypeDescriptor, comment: string): string {
    return descriptor.boLabel?.trim() || descriptor.commentBo?.trim() || comment;
  }

  private aggregationPartnerLabel(descriptor: AggregationTypeDescriptor, comment: string): string {
    return descriptor.partnerLabel?.trim() || descriptor.commentPartner?.trim() || comment;
  }

  private aggregationSlug(value: string): string {
    return this.normalizeCaseKey(value).replace(/[^A-Z0-9]+/g, '') || 'TYPE';
  }

  private buildPartnerEcartDetail(
    record: Record<string, string>,
    map: Map<string, EcartAggregateRow>,
    regularisationDetails: EcartDetailLine[],
    code: string,
    label: string,
    regularisationRules: Map<string, NormalizedRegularisationRule>,
    boByTransGu: Map<string, Record<string, string>>,
    fraisConfigs: FraisTransaction[],
    applyRegularisationRules = true
  ): void {
    const montant = this.parseAmount(record);
    const service = this.extractField(record, ['Service', 'service', 'Type Opération', 'Type Operation']);
    const agence = this.extractField(record, ['Agence', 'agence', 'Code proprietaire']);
    const commentaire = this.normalizeComment(record) || 'Ecart';
    const additionalOperationType = this.extractField(record, ['AdditionalOperationType', 'additionalOperationType']);
    const numeroTransGu = this.extractNumeroTransGu(record);
    const typeOperation = this.getTypeValue(record);

    const rule = applyRegularisationRules ? this.findRegularisationRule(regularisationRules, commentaire) : null;
    let detailMontant = montant;
    let regularisationExclue = false;
    if (rule && rule.hasOppartComponents) {
      const component = rule.components.find(
        c => c.source === 'OPPART_TYPE' && c.type === this.normalizeOperationType(typeOperation)
      );
      if (component) {
        const boRecord = this.findBoRecord(boByTransGu, numeroTransGu);
        const boService = boRecord
          ? this.extractField(boRecord, ['Service', 'service'])
          : service;
        detailMontant = this.applyComponentSign(montant, component, boService || service);
      } else {
        regularisationExclue = true;
        detailMontant = 0;
      }
    }

    const detail: EcartDetailLine = {
      type: code,
      category: 'PARTNER',
      source: 'PARTNER',
      service,
      agence,
      montant: detailMontant,
      montantBo: null,
      frais: 0,
      montantARegulariser: detailMontant,
      date: this.extractField(record, ['Date opération', 'Date operation', 'Date', 'date']),
      idTransaction: this.extractField(record, ['ID Transaction', 'IDTransaction', 'idTransaction']),
      numeroTransGu,
      commentaire,
      typeOperation,
      additionalOperationType: additionalOperationType || undefined,
      regularisationExclue: regularisationExclue || undefined
    };

    regularisationDetails.push(detail);
    const row = map.get(code) ?? this.emptyAggregate(code, label, 'PARTNER');
    row.count += 1;
    row.volume += detailMontant;
    row.montantARegulariser += detailMontant;
    row.details.push(detail);
    map.set(code, row);
  }

  /**
   * Indexe les règles de régularisation par libellé de cas (commentaire normalisé).
   * Une règle sans composant exploitable est ignorée (comportement historique conservé).
   */
  private buildRegularisationRuleIndex(
    response: ReconciliationResponse
  ): Map<string, NormalizedRegularisationRule> {
    const index = new Map<string, NormalizedRegularisationRule>();
    for (const rule of response.regularisationRules ?? []) {
      const key = this.normalizeCaseKey(rule?.case);
      if (!key) {
        continue;
      }
      const components: NormalizedRegularisationComponent[] = [];
      for (const raw of rule?.components ?? []) {
        const source = String(raw?.source ?? '').trim().toUpperCase();
        if (!source) {
          continue;
        }
        components.push({
          source,
          type: this.normalizeOperationType(raw?.type),
          sign: String(raw?.sign ?? 'SOURCE').trim().toUpperCase() || 'SOURCE',
          negativeTokens: (raw?.negativeTokens ?? [])
            .map(token => String(token).trim().toUpperCase())
            .filter(Boolean),
          defaultSign: String(raw?.defaultSign ?? 'POSITIVE').trim().toUpperCase() || 'POSITIVE',
          coefficient: this.toFiniteNumber(raw?.coefficient, 1)
        });
      }
      if (components.length) {
        index.set(key, {
          components,
          hasOppartComponents: components.some(c => c.source === 'OPPART_TYPE')
        });
      }
    }
    return index;
  }

  /** Règle de régularisation applicable à un commentaire de ligne (ou null si aucune). */
  private findRegularisationRule(
    index: Map<string, NormalizedRegularisationRule>,
    commentaire: string
  ): NormalizedRegularisationRule | null {
    return index.get(this.normalizeCaseKey(commentaire)) ?? null;
  }

  /** Clé de cas normalisée (casse, accents, espaces multiples). */
  private normalizeCaseKey(value: string | null | undefined): string {
    return (value || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  /** Normalise un type d'OPPART (casse, accents, séparateurs) pour comparaison. */
  private normalizeOperationType(value: string | null | undefined): string {
    return (value || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s_\-]/g, '');
  }

  /**
   * Vrai si le texte normalisé (casse/accents/séparateurs déjà retirés)
   * contient l'un des jetons d'une règle LISTE (ex. CERTIF.TOKENS_TRXSF).
   */
  private containsAnyToken(haystackNoSeparator: string, tokens: string[]): boolean {
    return tokens.some(token => haystackNoSeparator.includes(token.replace(/[\s_\-]/g, '')));
  }

  /**
   * Détection « TRX SANS FRAIS » : jetons de la règle CERTIF.TOKENS_TRXSF
   * complétés par les heuristiques historiques (SANS FRAIS, OP SANS FRAIS…).
   */
  private isTrxSansFraisComment(commentKey: string, tokens: string[]): boolean {
    return this.containsAnyToken(commentKey, tokens)
      || commentKey.includes('SANSFRAIS')
      || commentKey.includes('OPSANDFRAIS')
      || commentKey.includes('TRXSANDFRAIS')
      || commentKey === 'TRXSC';
  }

  /** Applique le signe (et le coefficient) d'un composant à une valeur brute. */
  private applyComponentSign(
    rawValue: number,
    component: NormalizedRegularisationComponent,
    service: string | null | undefined
  ): number {
    const value = rawValue * (component.coefficient === 0 ? 1 : component.coefficient);
    switch (component.sign) {
      case 'POSITIVE':
        return Math.abs(value);
      case 'NEGATIVE':
        return -Math.abs(value);
      case 'SERVICE_BASED': {
        const svc = (service || '').toUpperCase();
        const inNegativeTokens = component.negativeTokens.some(token => svc.includes(token));
        const negative = inNegativeTokens || component.defaultSign === 'NEGATIVE';
        return negative ? -Math.abs(value) : Math.abs(value);
      }
      case 'SOURCE':
      default:
        return value;
    }
  }

  /**
   * Composition du montant à régulariser d'une ligne BO (TSOP) selon la règle :
   * montant BO et/ou frais calculés. Renvoie null si aucun composant n'est applicable.
   */
  private computeBoRegularisation(
    montant: number,
    frais: number,
    service: string,
    rule: NormalizedRegularisationRule,
    commentaire?: string,
    trxsfTokens: string[] = []
  ): number | null {
    // For TRX SANS FRAIS (TRXSF), montant à régulariser = uniquement les frais
    if (commentaire) {
      const commentKey = this.normalizeOperationType(commentaire);
      const isTrxSansFrais = this.isTrxSansFraisComment(commentKey, trxsfTokens);
      if (isTrxSansFrais) {
        for (const component of rule.components) {
          if (component.source === 'CALCULATED_FRAIS') {
            return this.applyComponentSign(frais, component, service);
          }
        }
        // Si règle définie mais pas de composant frais, forcer frais uniquement
        return frais;
      }
    }
    let total = 0;
    let applicable = false;
    for (const component of rule.components) {
      if (component.source === 'BO_AMOUNT') {
        applicable = true;
        total += this.applyComponentSign(montant, component, service);
      } else if (component.source === 'CALCULATED_FRAIS') {
        applicable = true;
        total += this.applyComponentSign(frais, component, service);
      }
    }
    return applicable ? total : null;
  }

  /** Montant principal (composant BO_AMOUNT) pour l'affichage de la colonne « Montant TRXBO ». */
  private computeBoPrimaryAmount(
    montant: number,
    frais: number,
    service: string,
    rule: NormalizedRegularisationRule
  ): number | null {
    const component = rule.components.find(c => c.source === 'BO_AMOUNT');
    if (component) {
      return this.applyComponentSign(montant, component, service);
    }
    const fraisComponent = rule.components.find(c => c.source === 'CALCULATED_FRAIS');
    return fraisComponent ? this.applyComponentSign(frais, fraisComponent, service) : null;
  }

  private toFiniteNumber(value: unknown, fallback: number): number {
    if (value == null || value === '') {
      return fallback;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  private buildBoIndex(
    response: ReconciliationResponse,
    boData: Record<string, string>[]
  ): Map<string, Record<string, string>> {
    const index = new Map<string, Record<string, string>>();
    const allBoRecords: Record<string, string>[] = [
      ...(response.boOnly ?? []),
      ...(response.mismatches ?? []),
      ...(response.matches ?? []).map(m => m.boData),
      ...(boData ?? [])
    ];

    for (const record of allBoRecords) {
      const key = this.normalizeTransGuKey(this.extractNumeroTransGu(record));
      if (key && !index.has(key)) {
        index.set(key, record);
      }
    }
    return index;
  }

  private findBoRecord(
    boByTransGu: Map<string, Record<string, string>>,
    numeroTransGu: string
  ): Record<string, string> | null {
    const key = this.normalizeTransGuKey(numeroTransGu);
    if (!key) return null;
    return boByTransGu.get(key) ?? null;
  }

  private extractNumeroTransGu(record: Record<string, string>): string {
    return this.extractField(record, [
      'Numéro Trans GU',
      'Numero Trans GU',
      'numeroTransGU',
      'numero_trans_gu',
      'NUMERO_TRANS_GU'
    ]);
  }

  private normalizeTransGuKey(value: string): string {
    return (value || '').trim().toUpperCase().replace(/\s/g, '');
  }

  private emptyAggregate(code: string, label: string, category: EcartCategory): EcartAggregateRow {
    return {
      code,
      label,
      category,
      count: 0,
      volume: 0,
      frais: 0,
      montantARegulariser: 0,
      details: []
    };
  }

  private calculateFrais(
    fraisConfigs: FraisTransaction[],
    service: string,
    agence: string,
    montant: number
  ): number {
    const config = this.resolveFraisConfig(fraisConfigs, service, agence);
    if (!config) {
      return 0;
    }

    // Règles de référence du backend (/frais), appliquées à une ligne = une transaction :
    //   pourcentage -> volume x taux / 100
    //   nominal     -> forfait x 1 transaction
    let value: number;
    if (config.typeCalcul === 'POURCENTAGE' && config.pourcentage) {
      value = Math.abs(montant) * (config.pourcentage / 100);
    } else {
      value = config.montantFrais || 0;
    }
    // Convention : les frais sont toujours une sortie de trésorerie (montant négatif).
    const sign = this.calcul.getNumber('CERTIF.FRAIS_SIGNE', -1) >= 0 ? 1 : -1;
    return value === 0 ? 0 : sign * Math.abs(value);
  }

  /**
   * Commission (versement de commission) applicable à une ligne, selon la configuration dédiée
   * service + agence. Convention : toujours une entrée de trésorerie (montant positif).
   */
  private calculateCommission(
    commissionConfigs: CommissionTransaction[],
    service: string,
    agence: string,
    montant: number
  ): number {
    const config = this.resolveCommissionConfig(commissionConfigs, service, agence);
    if (!config) {
      return 0;
    }

    // Mêmes règles de référence que les frais (/frais) :
    //   pourcentage -> |volume| x taux / 100
    //   nominal     -> forfait x 1 transaction
    let value: number;
    if (config.typeCalcul === 'POURCENTAGE' && config.pourcentage) {
      value = Math.abs(montant) * (config.pourcentage / 100);
    } else {
      value = config.montantCommission || 0;
    }
    // Convention : la commission est toujours une entrée de trésorerie (montant positif).
    const sign = this.calcul.getNumber('CERTIF.COMMISSION_SIGNE', 1) >= 0 ? 1 : -1;
    return value === 0 ? 0 : sign * Math.abs(value);
  }

  /** Résout la configuration de commission applicable (même logique que les frais). */
  private resolveCommissionConfig(
    commissionConfigs: CommissionTransaction[],
    service: string,
    agence: string
  ): CommissionTransaction | null {
    if (!commissionConfigs?.length) {
      return null;
    }

    const nService = normalizeFraisKey(service);
    const nAgence = normalizeFraisKey(agence);

    const matchExact = commissionConfigs.find(c =>
      normalizeFraisKey(c.service) === nService &&
      normalizeFraisKey(c.agence) === nAgence &&
      c.actif
    );
    const matchServiceOnly = commissionConfigs.find(c =>
      normalizeFraisKey(c.service) === nService && c.actif
    );
    const matchAgenceOnly = commissionConfigs.find(c =>
      normalizeFraisKey(c.agence) === nAgence && c.actif
    );
    const matchServiceContains = commissionConfigs.find(c =>
      nService.includes(normalizeFraisKey(c.service)) && c.actif
    );

    const scored = commissionConfigs
      .filter(c => c.actif)
      .map(c => {
        const ns = normalizeFraisKey(c.service);
        let score = 0;
        if (nService.includes(ns)) score = ns.length;
        else if (ns.includes(nService)) score = nService.length - 1;
        return { c, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);

    return matchExact || matchServiceOnly || matchAgenceOnly || matchServiceContains || scored[0]?.c || null;
  }

  /** Résout la configuration de frais applicable (même logique que le calcul du frais attendu). */
  private resolveFraisConfig(
    fraisConfigs: FraisTransaction[],
    service: string,
    agence: string
  ): FraisTransaction | null {
    if (!fraisConfigs?.length) {
      return null;
    }

    const nService = normalizeFraisKey(service);
    const nAgence = normalizeFraisKey(agence);

    const matchExact = fraisConfigs.find(f =>
      normalizeFraisKey(f.service) === nService &&
      normalizeFraisKey(f.agence) === nAgence &&
      f.actif
    );
    const matchServiceOnly = fraisConfigs.find(f =>
      normalizeFraisKey(f.service) === nService && f.actif
    );
    const matchAgenceOnly = fraisConfigs.find(f =>
      normalizeFraisKey(f.agence) === nAgence && f.actif
    );
    const matchServiceContains = fraisConfigs.find(f =>
      nService.includes(normalizeFraisKey(f.service)) && f.actif
    );

    const scored = fraisConfigs
      .filter(f => f.actif)
      .map(f => {
        const ns = normalizeFraisKey(f.service);
        let score = 0;
        if (nService.includes(ns)) score = ns.length;
        else if (ns.includes(nService)) score = nService.length - 1;
        return { f, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);

    return matchExact || matchServiceOnly || matchAgenceOnly || matchServiceContains || scored[0]?.f || null;
  }

  /**
   * Vrai si la configuration correspond exactement au couple service + agence.
   * Un repli (tarif d'un autre client) est signalé plutôt qu'appliqué silencieusement.
   */
  private isExactFraisMatch(config: FraisTransaction, service: string, agence: string): boolean {
    return normalizeFraisKey(config.service) === normalizeFraisKey(service)
      && normalizeFraisKey(config.agence) === normalizeFraisKey(agence);
  }

  private extractField(record: Record<string, string>, candidates: string[]): string {
    for (const candidate of candidates) {
      if (record[candidate] != null && String(record[candidate]).trim()) {
        return String(record[candidate]).trim();
      }
    }
    const keys = Object.keys(record);
    for (const candidate of candidates) {
      const normalized = candidate.toLowerCase().replace(/\s/g, '');
      const match = keys.find(k => k.toLowerCase().replace(/\s/g, '') === normalized);
      if (match && String(record[match]).trim()) {
        return String(record[match]).trim();
      }
    }
    return '';
  }

  private sumMatchVolumes(response: ReconciliationResponse): number {
    return (response.matches ?? []).reduce((sum, m) => sum + this.extractMatchVolumeAndFrais(m.partnerData).volume, 0);
  }

  /** Classe une ligne OPPART appariée : IMPACT_COMPTE_GENERAL → volume, FRAIS_TRANSACTION → frais (sommes signées, aucune valeur absolue). */
  private extractMatchVolumeAndFrais(record: Record<string, string> | undefined): { volume: number; frais: number } {
    if (!record) {
      return { volume: 0, frais: 0 };
    }

    let volume = 0;
    let frais = 0;
    let found = false;

    for (const sub of this.splitPartnerData(record)) {
      const montantKey = this.findColumn(sub, ['Montant', 'montant', 'Montant Transaction', 'montantTransaction']);
      if (!montantKey) {
        continue;
      }
      const montant = this.parseNumeric(sub[montantKey]) ?? 0;
      const typeKey = this.findColumn(sub, CertificationSoldeService.OPPART_TYPE_KEYS);
      const type = typeKey ? String(sub[typeKey] ?? '').trim().toUpperCase().replace(/[\s_\-]/g, '') : '';
      found = true;
      if (type === 'FRAISTRANSACTION') {
        frais += montant;
      } else {
        volume += montant;
      }
    }

    if (!found) {
      return { volume: this.parseAmount(record), frais: 0 };
    }
    return { volume, frais };
  }

  /** Splitte un partnerData fusionné (clés `Type_PARTNER_1`, `Montant_PARTNER_1`, ...) en sous-enregistrements OPPART distincts. */
  private splitPartnerData(record: Record<string, string>): Record<string, string>[] {
    const groups = new Map<string, Record<string, string>>();
    const suffixRegex = /_PARTNER_(\d+)$/i;

    for (const [key, value] of Object.entries(record)) {
      const match = key.match(suffixRegex);
      if (match) {
        const index = match[1];
        const baseKey = key.slice(0, key.length - match[0].length);
        const group = groups.get(index) ?? {};
        group[baseKey] = value;
        groups.set(index, group);
      } else {
        const group = groups.get('__raw__') ?? {};
        group[key] = value;
        groups.set('__raw__', group);
      }
    }

    return Array.from(groups.values());
  }

  private extractOppartMouvementNet(partnerData: Record<string, string>[]): number {
    if (!partnerData?.length) {
      return 0;
    }

    const montantKey = this.findColumn(partnerData[0], ['Montant', 'montant']);
    if (!montantKey) {
      return 0;
    }

    return partnerData.reduce((sum, row) => sum + (this.parseNumeric(row[montantKey]) ?? 0), 0);
  }

  private extractDebitCredit(partnerData: Record<string, string>[]): { debit: number; credit: number } {
    if (!partnerData?.length) {
      return { debit: 0, credit: 0 };
    }

    const montantKey = this.findColumn(partnerData[0], ['Montant', 'montant']);
    if (!montantKey) {
      return { debit: 0, credit: 0 };
    }

    let debit = 0;
    let credit = 0;
    for (const row of partnerData) {
      const montant = this.parseNumeric(row[montantKey]) ?? 0;
      if (montant < 0) {
        debit += montant;
      } else {
        credit += montant;
      }
    }
    return { debit, credit };
  }

  private extractOppartOperationBreakdown(partnerData: Record<string, string>[]): OppartOperationBreakdown {
    if (!partnerData?.length) {
      return { hasData: false, volume: 0, frais: 0, otherTypes: [] };
    }

    const typeKey = this.findColumn(partnerData[0], CertificationSoldeService.OPPART_TYPE_KEYS);
    const montantKey = this.findColumn(partnerData[0], ['Montant', 'montant']);
    if (!typeKey || !montantKey) {
      return { hasData: false, volume: 0, frais: 0, otherTypes: [] };
    }

    const grouped = new Map<string, number>();
    for (const row of partnerData) {
      const type = String(row[typeKey] ?? '').trim() || '(Non renseigné)';
      const montant = this.parseNumeric(row[montantKey]) ?? 0;
      grouped.set(type, (grouped.get(type) ?? 0) + montant);
    }

    const normalizeType = (type: string): string =>
      (type || '').toUpperCase().replace(/[\s_\-]/g, '');

    const entries = Array.from(grouped.entries())
      .map(([type, volume]) => ({ type, volume }));

    const volume = entries
      .filter(e => normalizeType(e.type) === 'IMPACTCOMPTEGENERAL')
      .reduce((sum, e) => sum + e.volume, 0);
    const frais = entries
      .filter(e => normalizeType(e.type) === 'FRAISTRANSACTION')
      .reduce((sum, e) => sum + e.volume, 0);

    const otherTypes = entries
      .filter(e => {
        const n = normalizeType(e.type);
        return n !== 'IMPACTCOMPTEGENERAL' && n !== 'FRAISTRANSACTION' && !n.includes('COMPENS');
      })
      .sort((a, b) => b.volume - a.volume);

    return { hasData: true, volume, frais, otherTypes };
  }

  private extractTrxboServiceBreakdown(
    boData: Record<string, string>[],
    fraisConfigs: FraisTransaction[] = []
  ): TrxboServiceBreakdown {
    if (!boData?.length) {
      return { hasData: false, rows: [], totalCount: 0, totalVolume: 0, totalMontantFrais: 0 };
    }

    // Regroupement par service ET client : la configuration /frais est indexée sur ce
    // couple, regrouper par service seul atribuait à un client le tarif d'un autre.
    const grouped = new Map<string, { service: string; agence: string; count: number; volume: number }>();
    for (const row of boData) {
      const service = this.extractField(row, ['Service', 'service']) || '(Non renseigné)';
      const agence = this.extractField(row, ['Agence', 'agence', 'Code proprietaire']) || '(Non renseigné)';
      const key = `${service} ${agence}`;
      const current = grouped.get(key) ?? { service, agence, count: 0, volume: 0 };
      current.count += 1;
      current.volume += this.parseAmount(row);
      grouped.set(key, current);
    }

    const rows = Array.from(grouped.values())
      .map(({ service, agence, count, volume }) => {
        const config = this.resolveFraisConfig(fraisConfigs, service, agence);
        const isPourcentage = config?.typeCalcul === 'POURCENTAGE' && !!config.pourcentage;
        const exact = !!config && this.isExactFraisMatch(config, service, agence);
        const rawFrais = !config
          ? 0
          : (isPourcentage ? (config.pourcentage ?? 0) : (config.montantFrais ?? 0));
        // Frais toujours sortants de trésorerie : convention de signe négative.
        const frais = rawFrais === 0 ? 0 : -Math.abs(rawFrais);
        // Règles de référence du backend (/frais) :
        //   pourcentage -> volume x taux / 100
        //   nominal     -> forfait x nombre de transactions
        const montantFrais = isPourcentage ? (volume * frais) / 100 : frais * count;
        return {
          service,
          agence,
          count,
          volume,
          frais,
          montantFrais: Math.round(montantFrais * 100) / 100,
          fraisConfigExact: exact
        };
      })
      .sort((a, b) => b.volume - a.volume);

    const totalCount = rows.reduce((sum, r) => sum + r.count, 0);
    const totalVolume = rows.reduce((sum, r) => sum + r.volume, 0);
    const totalMontantFrais = rows.reduce((sum, r) => sum + r.montantFrais, 0);

    return { hasData: rows.length > 0, rows, totalCount, totalVolume, totalMontantFrais };
  }

  extractPeriodeOppart(partnerData: Record<string, string>[]): { dateDe: string; dateAu: string } | null {
    if (!partnerData?.length) {
      return null;
    }
    const dateOpKey = this.findColumn(partnerData[0], ['Date opération', 'Date operation', 'Date', 'date']);
    if (!dateOpKey) {
      return null;
    }
    let dateDe: string | null = null;
    let dateAu: string | null = null;
    for (const row of partnerData) {
      const day = this.extractIsoDay(row[dateOpKey]);
      if (!day) {
        continue;
      }
      if (dateDe == null || day < dateDe) {
        dateDe = day;
      }
      if (dateAu == null || day > dateAu) {
        dateAu = day;
      }
    }
    return dateDe && dateAu ? { dateDe, dateAu } : null;
  }

  private extractOppartSoldesPeriode(
    partnerData: Record<string, string>[],
    dateDe?: string,
    dateAu?: string
  ): {
    ouverture: number | null;
    cloture: number | null;
    horsPeriode: boolean;
  } {
    if (!partnerData?.length) {
      return { ouverture: null, cloture: null, horsPeriode: false };
    }

    const avantKey = this.findColumn(partnerData[0], ['Solde avant', 'soldeAvant', 'Solde_avant']);
    const apresKey = this.findColumn(partnerData[0], ['Solde aprés', 'Solde apres', 'Solde après', 'soldeApres', 'Solde_apres']);
    const dateOpKey = this.findColumn(partnerData[0], ['Date opération', 'Date operation', 'Date', 'date']);

    const hasDateRange = !!(dateDe && dateAu && dateOpKey);
    const rowsInPeriod = hasDateRange
      ? partnerData.filter(row => this.isRowInDateRange(row, dateOpKey, dateDe!, dateAu!))
      : [];
    const horsPeriode = rowsInPeriod.length === 0;
    const rowsInRange = horsPeriode ? partnerData : rowsInPeriod;

    // Tri sur la date ET l'heure (minutes/secondes incluses) : la première ligne
    // correspond à l'opération la plus ancienne (ex. 00h00min00s) et la dernière
    // à l'opération la plus récente (ex. 23h59min59s) de la période.
    const ordered = rowsInRange
      .map((row, index) => ({ row, index, dateTime: dateOpKey ? this.extractIsoDateTime(row[dateOpKey]) : null }))
      .sort((a, b) => {
        if (a.dateTime && b.dateTime) {
          if (a.dateTime !== b.dateTime) {
            return a.dateTime < b.dateTime ? -1 : 1;
          }
        } else if (a.dateTime) {
          return -1;
        } else if (b.dateTime) {
          return 1;
        }
        return a.index - b.index;
      });

    const ouverture = avantKey ? this.parseNumeric(ordered[0].row[avantKey]) : null;
    const cloture = apresKey ? this.parseNumeric(ordered[ordered.length - 1].row[apresKey]) : null;

    return { ouverture, cloture, horsPeriode };
  }

  /**
   * Borne de période inclusive : la date « du » couvre tout le jour (00:00:00) et
   * la date « au » couvre toute la journée jusqu'à 23:59:59, minutes et secondes incluses.
   */
  private isRowInDateRange(
    row: Record<string, string>,
    dateOpKey: string,
    dateDe: string,
    dateAu: string
  ): boolean {
    const dateTime = this.extractIsoDateTime(row[dateOpKey]);
    if (!dateTime) {
      return false;
    }
    const from = `${this.extractIsoDay(dateDe) ?? dateDe}T00:00:00`;
    const to = `${this.extractIsoDay(dateAu) ?? dateAu}T23:59:59`;
    return dateTime >= from && dateTime <= to;
  }

  private extractIsoDay(value: string | undefined | null): string | null {
    const dateTime = this.extractIsoDateTime(value);
    return dateTime ? dateTime.slice(0, 10) : null;
  }

  /**
   * Parse une date OPPART en `YYYY-MM-DDTHH:mm:ss` (comparable lexicographiquement).
   * Gère les formats ISO (`yyyy-mm-dd`), français (`dd/mm/yyyy` ou `dd-mm-yyyy`) avec
   * ou sans heure, et en dernier recours `Date`. L'heure absente vaut 00:00:00.
   */
  private extractIsoDateTime(value: string | undefined | null): string | null {
    if (value == null || value === '') return null;
    const raw = String(value).trim();

    // ISO : yyyy-mm-dd [T| ]HH:mm[:ss[.SSS]]
    const isoMatch = raw.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
    );
    if (isoMatch) {
      const hh = (isoMatch[4] ?? '00').padStart(2, '0');
      const mi = (isoMatch[5] ?? '00');
      const ss = (isoMatch[6] ?? '00');
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T${hh}:${mi}:${ss}`;
    }

    // Français : dd/mm/yyyy (ou dd-mm-yyyy) [HH:mm[:ss]]
    const frMatch = raw.match(
      /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
    );
    if (frMatch) {
      const dd = frMatch[1].padStart(2, '0');
      const mm = frMatch[2].padStart(2, '0');
      const hh = (frMatch[4] ?? '00').padStart(2, '0');
      const mi = frMatch[5] ?? '00';
      const ss = frMatch[6] ?? '00';
      return `${frMatch[3]}-${mm}-${dd}T${hh}:${mi}:${ss}`;
    }

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return this.formatIsoDateTime(parsed);
    }

    return null;
  }

  private formatIsoDateTime(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d}T${hh}:${mi}:${ss}`;
  }

  private normalizeColumnName(value: string): string {
    let text = String(value ?? '');
    for (let i = 0; i < 3; i++) {
      try {
        const repaired = new TextDecoder('utf-8').decode(
          new Uint8Array(Array.from(text, c => c.charCodeAt(0) & 0xff))
        );
        if (!repaired || repaired.includes('\uFFFD') || repaired === text) {
          break;
        }
        text = repaired;
      } catch {
        break;
      }
    }
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  private findColumn(row: Record<string, string>, candidates: string[]): string | null {
    const keys = Object.keys(row);
    for (const candidate of candidates) {
      const exact = keys.find(k => k === candidate);
      if (exact) return exact;
    }
    for (const candidate of candidates) {
      const target = this.normalizeColumnName(candidate);
      const fuzzy = keys.find(k => this.normalizeColumnName(k) === target);
      if (fuzzy) return fuzzy;
    }
    return null;
  }

  private normalizeComment(record: Record<string, string>): string {
    return String(record['Commentaire'] || record['commentaire'] || '').trim().toUpperCase();
  }

  private getTypeValue(record: Record<string, string>): string {
    const typeKey = this.findColumn(record, CertificationSoldeService.OPPART_TYPE_KEYS);
    return typeKey ? String(record[typeKey] ?? '').trim() : '';
  }

  private parseAmount(record: Record<string, string> | undefined): number {
    if (!record) return 0;
    const keys = ['Montant', 'montant', 'Montant Transaction', 'montantTransaction'];
    for (const key of keys) {
      if (record[key] != null && record[key] !== '') {
        return this.parseNumeric(record[key]) ?? 0;
      }
    }
    for (const [key, value] of Object.entries(record)) {
      if (/montant/i.test(key) && value) {
        return this.parseNumeric(value) ?? 0;
      }
    }
    return 0;
  }

  private parseNumeric(value: string | number | undefined | null): number | null {
    if (value == null || value === '') return null;
    const normalized = String(value).replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(normalized);
    return Number.isNaN(n) ? null : n;
  }
}
