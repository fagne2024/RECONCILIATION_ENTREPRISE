import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AutoProcessingService, AutoProcessingModel } from './auto-processing.service';
import { ReconciliationService } from './reconciliation.service';
import { AppStateService } from './app-state.service';
import { KeySuggestionService } from './key-suggestion.service';
import { PartnerConditionalKeysService } from './partner-conditional-keys.service';
import { ReconciliationResponse } from '../models/reconciliation-response.model';
import { fixCellEncoding } from '../utils/encoding-fixer';
import { AutoDiscoveryReconciliationService, ReconciliationPlan, ColumnProfile } from './auto-discovery-reconciliation.service';

export interface MagicServiceMatch {
  /** Libellé canonique côté partenaire (ex. CASHINOMCI). */
  partnerService: string;
  /** Valeurs distinctes côté BO rattachées à ce service (ex. CASHINOMCIPART2, MYTP_CASHINOMCI). */
  boServices: string[];
}

export interface MagicServiceSummary {
  service: string;
  partnerFileName?: string;
  partnerService?: string;
  boServices?: string;
  boServiceColumn?: string;
  partnerServiceColumn?: string;
  totalMatches: number;
  totalBoOnly: number;
  totalPartnerOnly: number;
  totalBoRecords: number;
  totalPartnerRecords: number;
  jobId?: string;
}

export interface MagicPartnerInput {
  fileName: string;
  data: Record<string, string>[];
}

export interface MatchedServiceColumns {
  boColumn: string;
  partnerColumn: string;
  overlapScore: number;
}

export interface MagicReconciliationResult {
  response: ReconciliationResponse;
  mode: 'pattern' | 'discovery' | 'mixed';
  serviceSummaries: MagicServiceSummary[];
  boKeyColumn: string;
  partnerKeyColumn: string;
  boModelName?: string;
  partnerModelName?: string;
  partnerFileNames?: string[];
  warnings?: string[];
}

export interface MagicReconciliationProgress {
  step: string;
  current?: number;
  total?: number;
  percentage?: number;
}

/** Concurrence max pour les réconciliations par service / partenaire. */
const MAGIC_SERVICE_CONCURRENCY = 3;
const MAGIC_PARTNER_CONCURRENCY = 2;

/** Suivi de progression globale quand plusieurs services sont réconciliés en parallèle. */
class MagicMultiServiceProgressTracker {
  private readonly finished = new Set<number>();
  private readonly running = new Map<number, number>();

  constructor(
    private readonly totalServices: number,
    private readonly onProgress?: (p: MagicReconciliationProgress) => void
  ) {}

  report(serviceIndex: number, service: string, step: string, percentage?: number): void {
    const normalizedStep = step.trim();
    const isCompleteStep = percentage === 100 || /termin/i.test(normalizedStep);

    if (isCompleteStep) {
      this.running.delete(serviceIndex);
      this.finished.add(serviceIndex);
    } else if (typeof percentage === 'number') {
      this.running.set(serviceIndex, percentage);
    }

    const slice = this.totalServices > 0 ? 100 / this.totalServices : 100;
    let overall = this.finished.size * slice;
    for (const pct of this.running.values()) {
      overall += (pct / 100) * slice;
    }

    const allDone = this.finished.size >= this.totalServices;
    const rounded = allDone ? 100 : Math.min(99, Math.round(overall));
    const activeCount = this.finished.size + this.running.size;

    this.onProgress?.({
      step: `Service ${serviceIndex}/${this.totalServices} « ${service} » — ${normalizedStep || 'En cours...'}`,
      current: Math.min(Math.max(activeCount, this.finished.size), this.totalServices),
      total: this.totalServices,
      percentage: rounded
    });
  }

  reportFinalization(step: string, percentage: number): void {
    this.onProgress?.({
      step,
      current: this.totalServices,
      total: this.totalServices,
      percentage
    });
  }
}
/** Longueur minimale pour un rapprochement par sous-chaîne (évite les faux positifs courts). */
const MIN_SERVICE_PARTIAL_TOKEN_LENGTH = 5;

@Injectable({ providedIn: 'root' })
export class MagicReconciliationService {

  constructor(
    private autoProcessingService: AutoProcessingService,
    private reconciliationService: ReconciliationService,
    private keySuggestionService: KeySuggestionService,
    private partnerConditionalKeysService: PartnerConditionalKeysService,
    private autoDiscoveryService: AutoDiscoveryReconciliationService,
    private appStateService: AppStateService
  ) {}

  async runMultiPartner(
    boFileName: string,
    boData: Record<string, string>[],
    partners: MagicPartnerInput[],
    onProgress?: (p: MagicReconciliationProgress) => void
  ): Promise<MagicReconciliationResult> {
    if (!partners.length) {
      throw new Error('Aucun fichier partenaire sélectionné.');
    }
    if (partners.length === 1) {
      const models = await this.loadTraitementModels();
      const single = await this.run(
        boFileName,
        partners[0].fileName,
        boData,
        partners[0].data,
        onProgress,
        models
      );
      return {
        ...single,
        partnerFileNames: [partners[0].fileName],
        serviceSummaries: single.serviceSummaries.map(s => ({
          ...s,
          partnerFileName: partners[0].fileName
        }))
      };
    }

    const models = await this.loadTraitementModels();
    const merged = this.emptyResponse();
    const allSummaries: MagicServiceSummary[] = [];
    const warnings: string[] = [];
    let lastBoKey = '';
    let lastPartnerKey = '';
    let lastBoModel: string | undefined;
    let lastPartnerModel: string | undefined;
    let usedPattern = false;
    let usedDiscovery = false;

    const partnerResults = await this.runPool(
      partners,
      MAGIC_PARTNER_CONCURRENCY,
      async (partner, i) => {
        onProgress?.({
          step: `Partenaire ${i + 1}/${partners.length} : ${partner.fileName} — En cours`,
          current: i + 1,
          total: partners.length
        });

        try {
          const result = await this.run(
            boFileName,
            partner.fileName,
            boData,
            partner.data,
            sub => onProgress?.({
              step: `[${partner.fileName}] ${sub.step}`,
              percentage: sub.percentage
            }),
            models
          );
          return { partner, result, error: null as string | null };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return { partner, result: null, error: msg };
        }
      }
    );

    if (partners.length > 1) {
      onProgress?.({
        step: 'Finalisation multi-partenaire...',
        current: partners.length,
        total: partners.length,
        percentage: 99
      });
    }

    for (const entry of partnerResults) {
      if (entry.error || !entry.result) {
        warnings.push(`${entry.partner.fileName} : ${entry.error ?? 'erreur inconnue'}`);
        continue;
      }

      const result = entry.result;
      if (result.mode === 'pattern') {
        usedPattern = true;
      } else {
        usedDiscovery = true;
      }

      this.mergeResponses(
        merged,
        this.tagResponseWithPartnerFile(result.response, entry.partner.fileName)
      );
      allSummaries.push(
        ...result.serviceSummaries.map(s => ({
          ...s,
          partnerFileName: entry.partner.fileName
        }))
      );
      lastBoKey = result.boKeyColumn;
      lastPartnerKey = result.partnerKeyColumn;
      lastBoModel = result.boModelName;
      lastPartnerModel = result.partnerModelName;
    }

    if (!allSummaries.length) {
      throw new Error(
        warnings.length
          ? `Aucune réconciliation réussie.\n${warnings.join('\n')}`
          : 'Aucune réconciliation réussie.'
      );
    }

    onProgress?.({
      step: 'Réconciliation terminée',
      current: partners.length,
      total: partners.length,
      percentage: 100
    });

    return {
      response: merged,
      mode: usedPattern && usedDiscovery ? 'mixed' : usedPattern ? 'pattern' : 'discovery',
      serviceSummaries: allSummaries,
      boKeyColumn: lastBoKey,
      partnerKeyColumn: lastPartnerKey,
      boModelName: lastBoModel,
      partnerModelName: lastPartnerModel,
      partnerFileNames: partners.map(p => p.fileName),
      warnings: warnings.length ? warnings : undefined
    };
  }

  async run(
    boFileName: string,
    partnerFileName: string,
    boData: Record<string, string>[],
    partnerData: Record<string, string>[],
    onProgress?: (p: MagicReconciliationProgress) => void,
    preloadedModels?: AutoProcessingModel[]
  ): Promise<MagicReconciliationResult> {
    onProgress?.({ step: `Analyse de ${partnerFileName}...` });

    const models = preloadedModels ?? await this.loadTraitementModels();
    const boModel = this.findModelForFile(models, boFileName, 'bo');
    const partnerModel = this.findModelForFile(models, partnerFileName, 'partner');

    let keyResult: { boKeyColumn: string; partnerKeyColumn: string; modelId?: string; model?: AutoProcessingModel; discoveryPlan?: any } | null = null;
    let mode: 'pattern' | 'discovery' = 'discovery';

    onProgress?.({ step: `Recherche des clés pour ${partnerFileName}...` });
    keyResult = this.resolveKeysFromModels(models, boFileName, partnerFileName, boData, partnerData);
    if (keyResult) {
      mode = 'pattern';
    }

    if (!keyResult) {
      onProgress?.({ step: `Détection automatique des clés pour ${partnerFileName}...` });
      keyResult = this.discoverKeysFromColumns(boData, partnerData);
      mode = 'discovery';
    }

    if (!keyResult) {
      throw new Error(
        'Impossible de déterminer les colonnes clés entre les fichiers BO et Partenaire. ' +
        'Utilisez le mode Assisté pour configurer manuellement les clés.'
      );
    }

    let processedBo: Record<string, string>[];
    let processedPartner: Record<string, string>[];

    if (keyResult.discoveryPlan) {
      const plan = keyResult.discoveryPlan;
      console.log('[MagicReconciliation] Plan de réconciliation auto-découvert:', {
        mappings: plan.columnMappings.map((m: any) => `${m.a} ↔ ${m.b} (${m.nature}, ${(m.confidence * 100).toFixed(0)}%)`),
        passes: plan.passes.map((p: any) => `${p.name}: ${(p.estimatedMatchRate * 100).toFixed(0)}% estimé`),
        risks: plan.risks,
        estimatedGlobalMatchRate: (plan.estimatedGlobalMatchRate * 100).toFixed(1) + '%',
      });
      if (plan.openQuestions.length) {
        console.warn('[MagicReconciliation] Questions ouvertes:', plan.openQuestions);
      }
      // Appliquer les normalisations du plan découvert aux données
      processedBo = this.applyDiscoveryNormalizations(boData, plan.normalizations, 'A');
      processedPartner = this.applyDiscoveryNormalizations(partnerData, plan.normalizations, 'B');
    } else {
      processedBo = boData;
      processedPartner = partnerData;
    }

    let boKeyColumn = keyResult.boKeyColumn;
    let partnerKeyColumn = keyResult.partnerKeyColumn;
    const usedModel = keyResult.model ?? partnerModel ?? boModel;
    if (usedModel?.reconciliationKeys?.boTreatments) {
      processedBo = this.applyBoTreatments(processedBo, usedModel.reconciliationKeys.boTreatments);
    }

    if (usedModel) {
      const prepared = this.partnerConditionalKeysService.applyModelConditionalKeys(
        processedBo,
        processedPartner,
        usedModel
      );
      if (prepared) {
        processedBo = prepared.boData;
        processedPartner = prepared.partnerData;
        boKeyColumn = prepared.boKeyColumn;
        partnerKeyColumn = prepared.partnerKeyColumn;
      }
    }

    const serviceColumns =
      this.findServiceColumnsByHeader(processedBo, processedPartner)
      ?? this.findServiceColumnsByContent(processedBo, processedPartner);
    const serviceMatches = serviceColumns
      ? this.findServiceMatches(processedBo, processedPartner, serviceColumns.boColumn, serviceColumns.partnerColumn)
      : [];

    console.log('[MagicReconciliation] Clés finales:', { boKeyColumn, partnerKeyColumn });
    console.log('[MagicReconciliation] Colonnes service:', { bo: serviceColumns?.boColumn, partner: serviceColumns?.partnerColumn });
    console.log('[MagicReconciliation] Services matchés:', serviceMatches.map(m => m.partnerService));
    console.log('[MagicReconciliation] Échantillon clés BO (5):', processedBo.slice(0,5).map(r => r[boKeyColumn]));
    console.log('[MagicReconciliation] Échantillon clés Partner (5):', processedPartner.slice(0,5).map(r => r[partnerKeyColumn]));

    onProgress?.({
      step: serviceMatches.length > 1
        ? `Réconciliation par service (${serviceMatches.length} communs) — En cours`
        : serviceMatches.length === 1
          ? `Réconciliation du service « ${serviceMatches[0].partnerService} » — En cours`
          : 'Lancement de la réconciliation — En cours',
      current: 0,
      total: Math.max(serviceMatches.length, 1)
    });

    if (serviceMatches.length >= 1 && serviceColumns) {
      const merged = await this.reconcilePerService(
        processedBo,
        processedPartner,
        serviceMatches,
        serviceColumns.boColumn,
        serviceColumns.partnerColumn,
        boKeyColumn,
        partnerKeyColumn,
        partnerFileName,
        onProgress
      );
      return {
        response: merged.response,
        mode,
        serviceSummaries: merged.summaries.map(s => ({ ...s, partnerFileName })),
        boKeyColumn,
        partnerKeyColumn,
        boModelName: boModel?.name,
        partnerModelName: partnerModel?.name
      };
    }

    if (serviceColumns && serviceMatches.length === 0) {
      throw new Error(
        'Aucun service commun trouvé entre les fichiers BO et Partenaire. ' +
        'Vérifiez que les colonnes de service/type se correspondent (égalité ou inclusion, ex. CASHINOMCIPART2 ↔ CASHINOMCI).'
      );
    }

    const response = this.tagResponseWithPartnerFile(
      await this.reconcileOnce(
        processedBo,
        processedPartner,
        boKeyColumn,
        partnerKeyColumn,
        (step, percentage) => onProgress?.({
          step,
          current: 1,
          total: 1,
          percentage
        })
      ),
      partnerFileName
    );

    onProgress?.({
      step: 'Réconciliation terminée',
      current: 1,
      total: 1,
      percentage: 100
    });

    return {
      response,
      mode,
      serviceSummaries: [{
        service: 'Tous',
        partnerFileName,
        totalMatches: response.totalMatches,
        totalBoOnly: response.totalBoOnly,
        totalPartnerOnly: response.totalPartnerOnly,
        totalBoRecords: response.totalBoRecords,
        totalPartnerRecords: response.totalPartnerRecords
      }],
      boKeyColumn,
      partnerKeyColumn,
      boModelName: boModel?.name,
      partnerModelName: partnerModel?.name
    };
  }

  private async reconcilePerService(
    boData: Record<string, string>[],
    partnerData: Record<string, string>[],
    serviceMatches: MagicServiceMatch[],
    boServiceCol: string,
    partnerServiceCol: string,
    boKeyColumn: string,
    partnerKeyColumn: string,
    partnerFileName: string,
    onProgress?: (p: MagicReconciliationProgress) => void
  ): Promise<{ response: ReconciliationResponse; summaries: MagicServiceSummary[] }> {
    const summaries: MagicServiceSummary[] = [];
    const merged: ReconciliationResponse = {
      matches: [],
      boOnly: [],
      partnerOnly: [],
      mismatches: [],
      totalBoRecords: 0,
      totalPartnerRecords: 0,
      totalMatches: 0,
      totalMismatches: 0,
      totalBoOnly: 0,
      totalPartnerOnly: 0
    };

    const totalServices = serviceMatches.length;
    const serviceProgress = new MagicMultiServiceProgressTracker(totalServices, onProgress);

    const serviceResults = await this.runPool(
      serviceMatches,
      MAGIC_SERVICE_CONCURRENCY,
      async (match, i) => {
        const service = match.partnerService;
        const serviceIndex = i + 1;
        serviceProgress.report(serviceIndex, service, 'En cours');

        const boServiceSet = new Set(match.boServices);
        const boSlice = boData.filter(row => boServiceSet.has((row[boServiceCol] || '').trim()));
        const partnerSlice = partnerData.filter(row =>
          this.serviceValuesMatch((row[partnerServiceCol] || '').trim(), match.partnerService)
        );
        if (!boSlice.length && !partnerSlice.length) {
          serviceProgress.report(serviceIndex, service, 'Aucune donnée', 100);
          return null;
        }

        const taggedBo = this.tagRowsForMagic(boSlice, service, partnerFileName);
        const taggedPartner = this.tagRowsForMagic(partnerSlice, service, partnerFileName);

        const result = await this.reconcileOnce(
          taggedBo,
          taggedPartner,
          boKeyColumn,
          partnerKeyColumn,
          (step, percentage) => serviceProgress.report(serviceIndex, service, step, percentage)
        );

        serviceProgress.report(serviceIndex, service, 'Réconciliation terminée', 100);
        return { match, result };
      }
    );

    serviceProgress.reportFinalization('Agrégation des résultats...', 99);

    for (const entry of serviceResults) {
      if (!entry) {
        continue;
      }
      const { match, result } = entry;
      const service = match.partnerService;
      summaries.push({
        service,
        partnerFileName,
        partnerService: service,
        boServices: match.boServices.join(', '),
        boServiceColumn: boServiceCol,
        partnerServiceColumn: partnerServiceCol,
        totalMatches: result.totalMatches,
        totalBoOnly: result.totalBoOnly,
        totalPartnerOnly: result.totalPartnerOnly,
        totalBoRecords: result.totalBoRecords,
        totalPartnerRecords: result.totalPartnerRecords,
        jobId: result.progressSessionId
      });
      this.appendReconcileResult(merged, result, service, partnerFileName);
    }

    serviceProgress.reportFinalization('Réconciliation terminée', 100);

    return { response: merged, summaries };
  }

  private appendReconcileResult(
    merged: ReconciliationResponse,
    result: ReconciliationResponse,
    service: string,
    partnerFileName: string
  ): void {
    if (result.matches.length) {
      merged.matches.push(
        ...result.matches.map(match => ({
          ...match,
          boData: { ...match.boData, _magicService: service, _magicPartnerFile: partnerFileName },
          partnerData: { ...match.partnerData, _magicService: service, _magicPartnerFile: partnerFileName }
        }))
      );
    }
    if (result.boOnly.length) {
      merged.boOnly.push(
        ...result.boOnly.map(row => ({ ...row, _magicService: service, _magicPartnerFile: partnerFileName }))
      );
    }
    if (result.partnerOnly.length) {
      merged.partnerOnly.push(
        ...result.partnerOnly.map(row => ({ ...row, _magicService: service, _magicPartnerFile: partnerFileName }))
      );
    }
    const mismatches = result.mismatches ?? [];
    if (mismatches.length) {
      merged.mismatches.push(
        ...mismatches.map(row => ({ ...row, _magicService: service, _magicPartnerFile: partnerFileName }))
      );
    }
    merged.totalBoRecords += result.totalBoRecords;
    merged.totalPartnerRecords += result.totalPartnerRecords;
    merged.totalMatches += result.totalMatches;
    merged.totalMismatches += result.totalMismatches;
    merged.totalBoOnly += result.totalBoOnly;
    merged.totalPartnerOnly += result.totalPartnerOnly;
  }

  private async reconcileOnce(
    boData: Record<string, string>[],
    partnerData: Record<string, string>[],
    boKeyColumn: string,
    partnerKeyColumn: string,
    onStep?: (step: string, percentage?: number) => void
  ): Promise<ReconciliationResponse> {
    const modelId = this.appStateService.getLastEditedModelId();
    const request: any = {
      boFileContent: boData,
      partnerFileContent: partnerData,
      boKeyColumn,
      partnerKeyColumn,
      comparisonColumns: [{ boColumn: boKeyColumn, partnerColumn: partnerKeyColumn }],
      boColumnFilters: []
    };
    if (modelId) {
      request.modelId = modelId;
    }
    return firstValueFrom(
      this.reconciliationService.reconcileWithLiveProgress(request, onStep)
    );
  }

  private loadTraitementModels(): Promise<AutoProcessingModel[]> {
    return this.autoProcessingService.getAllModels(AutoProcessingService.RECONCILIATION_MODULE);
  }

  private async runPool<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<R>
  ): Promise<R[]> {
    if (!items.length) {
      return [];
    }

    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const poolSize = Math.max(1, Math.min(concurrency, items.length));

    const runWorker = async (): Promise<void> => {
      while (true) {
        const index = nextIndex++;
        if (index >= items.length) {
          break;
        }
        results[index] = await worker(items[index], index);
      }
    };

    await Promise.all(Array.from({ length: poolSize }, () => runWorker()));
    return results;
  }

  private indexRowsByColumn(
    data: Record<string, string>[],
    column: string
  ): Map<string, Record<string, string>[]> {
    const map = new Map<string, Record<string, string>[]>();
    for (const row of data) {
      const key = (row[column] || '').trim();
      if (!key) {
        continue;
      }
      let bucket = map.get(key);
      if (!bucket) {
        bucket = [];
        map.set(key, bucket);
      }
      bucket.push(row);
    }
    return map;
  }

  private tagRowsForMagic(
    rows: Record<string, string>[],
    service: string,
    partnerFileName: string
  ): Record<string, string>[] {
    if (!rows.length) {
      return rows;
    }
    const tagged = new Array<Record<string, string>>(rows.length);
    for (let i = 0; i < rows.length; i++) {
      tagged[i] = {
        ...rows[i],
        _magicService: service,
        _magicPartnerFile: partnerFileName
      };
    }
    return tagged;
  }

  private sanitizeProgressDetail(detail?: string): string {
    const trimmed = (detail ?? '').trim();
    if (!trimmed || /^en attente$/i.test(trimmed)) {
      return 'En cours...';
    }
    return trimmed.replace(/en attente/gi, 'En cours');
  }

  private buildServiceProgress(
    service: string,
    index: number,
    total: number,
    detail?: string,
    percentage?: number
  ): MagicReconciliationProgress {
    const safeDetail = this.sanitizeProgressDetail(detail);
    return {
      step: `Service ${index}/${total} « ${service} » — ${safeDetail}`,
      current: index,
      total,
      percentage
    };
  }

  /**
   * Détection rapide via en-têtes « service » / « type » identiques ou compatibles.
   */
  private findServiceColumnsByHeader(
    boData: Record<string, string>[],
    partnerData: Record<string, string>[]
  ): MatchedServiceColumns | null {
    const boCol = this.findServiceColumn(boData);
    const partnerCol = this.findServiceColumn(partnerData);
    if (!boCol || !partnerCol) {
      return null;
    }
    const matches = this.findServiceMatches(boData, partnerData, boCol, partnerCol);
    if (!matches.length) {
      return null;
    }
    return { boColumn: boCol, partnerColumn: partnerCol, overlapScore: 1 };
  }

  private modelHasPartnerKeyConfig(model: AutoProcessingModel): boolean {
    const rk = model.reconciliationKeys;
    if (!rk) {
      return false;
    }
    const hasBoModelKeys = (rk.boModels || []).some(
      id => (rk.boModelKeys?.[id] || []).length > 0
    );
    return !!(
      rk.partnerKeys?.length ||
      rk.boKeys?.length ||
      hasBoModelKeys ||
      this.partnerConditionalKeysService.isEnabled(rk.partnerConditionalKeys) ||
      this.partnerConditionalKeysService.isBoConditionalEnabled(rk.boConditionalKeys)
    );
  }

  private findModelForFile(
    models: AutoProcessingModel[],
    fileName: string,
    side: 'bo' | 'partner'
  ): AutoProcessingModel | undefined {
    return models.find(m =>
      (m.fileType === side || m.fileType === 'both') &&
      this.matchesFilePattern(fileName, m.filePattern)
    );
  }

  private resolveKeysFromModels(
    models: AutoProcessingModel[],
    boFileName: string,
    partnerFileName: string,
    boData: Record<string, string>[],
    partnerData: Record<string, string>[]
  ): { boKeyColumn: string; partnerKeyColumn: string; modelId?: string; model?: AutoProcessingModel } | null {
    let candidates = models.filter(m =>
      (m.fileType === 'partner' || m.fileType === 'both') &&
      partnerFileName &&
      this.matchesFilePattern(partnerFileName, m.filePattern)
    );

    if (!candidates.length && boFileName) {
      candidates = models.filter(m =>
        (m.fileType === 'partner' || m.fileType === 'both') &&
        this.matchesFilePattern(boFileName, m.filePattern)
      );
    }

    if (!candidates.length) {
      candidates = models.filter(m =>
        (m.fileType === 'partner' || m.fileType === 'both') &&
        this.modelHasPartnerKeyConfig(m)
      );
    }

    for (const model of candidates) {
      const resolved = this.resolveKeysFromPartnerModel(model, boData, partnerData);
      if (resolved) {
        return { ...resolved, model };
      }
    }
    return null;
  }

  private resolveKeysFromPartnerModel(
    model: AutoProcessingModel,
    boData: Record<string, string>[],
    partnerData: Record<string, string>[]
  ): { boKeyColumn: string; partnerKeyColumn: string; modelId?: string } | null {
    const resolved = this.partnerConditionalKeysService.resolveKeysFromPartnerModel(
      model,
      boData,
      partnerData
    );
    if (!resolved) {
      return null;
    }
    return {
      ...resolved,
      modelId: model.modelId || model.id
    };
  }

  private discoverKeysFromColumns(
    boData: Record<string, string>[],
    partnerData: Record<string, string>[]
  ): { boKeyColumn: string; partnerKeyColumn: string; discoveryPlan?: any } | null {
    const boCols = Object.keys(boData[0] || {});
    const partnerCols = Object.keys(partnerData[0] || {});

    console.log('[MagicReconciliation] Colonnes BO:', boCols);
    console.log('[MagicReconciliation] Colonnes Partenaire:', partnerCols);

    const cleBo = boCols.find(c => c.toUpperCase() === 'CLE');
    const clePartner = partnerCols.find(c => c.toUpperCase() === 'CLE');
    if (cleBo && clePartner) {
      console.log('[MagicReconciliation] Clé CLE trouvée:', cleBo, '↔', clePartner);
      return { boKeyColumn: cleBo, partnerKeyColumn: clePartner };
    }

    const analysis = this.keySuggestionService.analyzeAndSuggestKeys(boData, partnerData);
    console.log('[MagicReconciliation] Suggestions key-suggestion:', analysis.suggestions?.slice(0, 5).map(s => `${s.boColumn}↔${s.partnerColumn} (${(s.confidence*100).toFixed(0)}%)`));
    const best = analysis.suggestions?.[0];
    if (best && best.confidence >= 0.5) {
      console.log('[MagicReconciliation] Meilleure suggestion:', best.boColumn, '↔', best.partnerColumn, 'conf=', best.confidence);
      return { boKeyColumn: best.boColumn, partnerKeyColumn: best.partnerColumn };
    }

    const bruteForce = this.bruteForceKeyMatch(boData, partnerData);
    if (bruteForce) {
      console.log('[MagicReconciliation] Brute force:', bruteForce.boKeyColumn, '↔', bruteForce.partnerKeyColumn);
      return { boKeyColumn: bruteForce.boKeyColumn, partnerKeyColumn: bruteForce.partnerKeyColumn };
    }

    console.log('[MagicReconciliation] Tentative auto-discovery...');
    const sampleA = boData.slice(0, 30);
    const sampleB = partnerData.slice(0, 30);
    const profilesA = this.autoDiscoveryService.profile(boData);
    const profilesB = this.autoDiscoveryService.profile(partnerData);
    
    console.log('[MagicReconciliation] Profils BO:', profilesA.map(p => `${p.name}:${p.type}(fill=${(p.fillRate*100).toFixed(0)}%, uniq=${(p.uniqueness*100).toFixed(0)}%)`));
    console.log('[MagicReconciliation] Profils Partenaire:', profilesB.map(p => `${p.name}:${p.type}(fill=${(p.fillRate*100).toFixed(0)}%, uniq=${(p.uniqueness*100).toFixed(0)}%)`));

    const plan = this.autoDiscoveryService.buildPlan(
      'BO',
      'Partenaire',
      profilesA,
      profilesB,
      sampleA,
      sampleB
    );

    console.log('[MagicReconciliation] Mappings découverts:', plan.columnMappings.map(m => `${m.a}↔${m.b} (${m.nature}, ${(m.confidence*100).toFixed(0)}%, justif: ${m.justification})`));
    console.log('[MagicReconciliation] Normalisations:', plan.normalizations.map(n => `${n.file}|${n.column}: ${n.operations.join(', ')}`));
    console.log('[MagicReconciliation] Passes:', plan.passes.map(p => `${p.name} (${(p.estimatedMatchRate*100).toFixed(0)}%), keys: ${p.keys.map(k => `${k.a}↔${k.b}`).join(', ')}, tol: amount=${p.tolerances.amount}, date=${p.tolerances.dateMinutes}min`));
    console.log('[MagicReconciliation] Risques:', plan.risks);
    console.log('[MagicReconciliation] Questions:', plan.openQuestions);
    console.log('[MagicReconciliation] Taux global estimé:', (plan.estimatedGlobalMatchRate*100).toFixed(1)+'%');

    const idMapping = plan.columnMappings.find(m => m.nature === 'id' && m.confidence >= 0.3);
    if (idMapping) {
      console.log('[MagicReconciliation] ID mapping retenu:', idMapping.a, '↔', idMapping.b, 'conf=', idMapping.confidence);
      return { boKeyColumn: idMapping.a, partnerKeyColumn: idMapping.b, discoveryPlan: plan };
    }

    const anyMapping = plan.columnMappings.find(m => m.confidence >= 0.25);
    if (anyMapping) {
      console.log('[MagicReconciliation] Mapping quelconque retenu:', anyMapping.a, '↔', anyMapping.b, 'nature=', anyMapping.nature, 'conf=', anyMapping.confidence);
      return { boKeyColumn: anyMapping.a, partnerKeyColumn: anyMapping.b, discoveryPlan: plan };
    }

    console.warn('[MagicReconciliation] Aucun mapping trouvé, fallback sur première colonne non-vide');
    const fallbackBo = boCols.find(c => {
      // Skip binary garbage columns (XLSX header, control chars, etc.)
      if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(c)) return false;
      if (c.startsWith('PK\x03\x04')) return false; // ZIP/XLSX signature
      if (c.length > 50) return false; // Likely corrupted
      const vals = new Set(boData.slice(0, 100).map(r => (r[c] || '').trim()).filter(Boolean));
      return vals.size > 1;
    });
    const fallbackPartner = partnerCols.find(c => {
      if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(c)) return false;
      if (c.length > 50) return false;
      const vals = new Set(partnerData.slice(0, 100).map(r => (r[c] || '').trim()).filter(Boolean));
      return vals.size > 1;
    });
    console.log('[MagicReconciliation] Fallback keys:', { fallbackBo, fallbackPartner });
    if (fallbackBo && fallbackPartner) {
      return { boKeyColumn: fallbackBo, partnerKeyColumn: fallbackPartner, discoveryPlan: plan };
    }

    // Last resort: use first available columns
    const lastResortBo = boCols.find(c => !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(c) && c.length <= 50);
    const lastResortPartner = partnerCols.find(c => !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(c) && c.length <= 50);
    console.log('[MagicReconciliation] Last resort keys:', { lastResortBo, lastResortPartner });
    if (lastResortBo && lastResortPartner) {
      return { boKeyColumn: lastResortBo, partnerKeyColumn: lastResortPartner, discoveryPlan: plan };
    }

    return null;
  }

  private bruteForceKeyMatch(
    boData: Record<string, string>[],
    partnerData: Record<string, string>[]
  ): { boKeyColumn: string; partnerKeyColumn: string } | null {
    const boCols = Object.keys(boData[0] || {});
    const partnerCols = Object.keys(partnerData[0] || {});
    let best: { bo: string; partner: string; score: number } | null = null;

    for (const boCol of boCols) {
      const boValues = new Set(
        boData.slice(0, 200).map(r => (r[boCol] || '').trim()).filter(Boolean)
      );
      if (boValues.size < 2) {
        continue;
      }
      for (const partnerCol of partnerCols) {
        const partnerValues = new Set(
          partnerData.slice(0, 200).map(r => (r[partnerCol] || '').trim()).filter(Boolean)
        );
        if (partnerValues.size < 2) {
          continue;
        }
        let overlap = 0;
        for (const v of boValues) {
          if (partnerValues.has(v)) {
            overlap++;
          }
        }
        const score = overlap / Math.max(boValues.size, partnerValues.size);
        if (!best || score > best.score) {
          best = { bo: boCol, partner: partnerCol, score };
        }
      }
    }

    if (best && best.score >= 0.15) {
      return { boKeyColumn: best.bo, partnerKeyColumn: best.partner };
    }
    return null;
  }

  private findExistingColumn(data: Record<string, string>[], candidateKeys: string[]): string | null {
    if (!data?.length || !candidateKeys?.length) {
      return null;
    }
    const available = Object.keys(data[0]);
    const normAvailable = available.map(c => this.normalizeColumnName(c));
    const normCandidates = candidateKeys.map(k => this.normalizeColumnName(k));

    for (let i = 0; i < normCandidates.length; i++) {
      const idx = normAvailable.indexOf(normCandidates[i]);
      if (idx !== -1) {
        return available[idx];
      }
    }

    for (let i = 0; i < normCandidates.length; i++) {
      const candidate = normCandidates[i].toLowerCase();
      for (let j = 0; j < normAvailable.length; j++) {
        if (normAvailable[j].toLowerCase() === candidate) {
          return available[j];
        }
      }
    }

    for (let i = 0; i < normCandidates.length; i++) {
      const candidate = normCandidates[i].replace(/\s+/g, '').toLowerCase();
      for (let j = 0; j < normAvailable.length; j++) {
        const column = normAvailable[j].replace(/\s+/g, '').toLowerCase();
        if (candidate === column) {
          return available[j];
        }
      }
    }

    return null;
  }

  private normalizeColumnName(name: string): string {
    return fixCellEncoding(name).replace(/\s+/g, ' ').trim();
  }

  /**
   * Repère les colonnes « service » en comparant le contenu entre BO et Partenaire
   * (les en-têtes peuvent différer).
   */
  findServiceColumnsByContent(
    boData: Record<string, string>[],
    partnerData: Record<string, string>[]
  ): MatchedServiceColumns | null {
    if (!boData?.length || !partnerData?.length) {
      return null;
    }

    const boCols = Object.keys(boData[0]);
    const partnerCols = Object.keys(partnerData[0]);
    const boDistinct = this.buildDistinctValueCache(boData, boCols);
    const partnerDistinct = this.buildDistinctValueCache(partnerData, partnerCols);
    let best: MatchedServiceColumns | null = null;

    const scorePair = (boCol: string, partnerCol: string): number => {
      const boValues = boDistinct.get(boCol) ?? [];
      const partnerValues = partnerDistinct.get(partnerCol) ?? [];
      if (boValues.length < 1 || partnerValues.length < 1 || boValues.length > 40 || partnerValues.length > 40) {
        return 0;
      }
      const overlap = this.countServiceOverlap(boValues, partnerValues);
      if (overlap === 0) {
        return 0;
      }
      return overlap / Math.min(boValues.length, partnerValues.length);
    };

    const isServiceLikeHeader = (col: string): boolean => {
      const l = col.toLowerCase();
      return l.includes('service') || l.includes('serv') || l.includes('type') || l.includes('produit');
    };

    const boColsOrdered = [...boCols].sort(
      (a, b) => Number(isServiceLikeHeader(b)) - Number(isServiceLikeHeader(a))
    );
    const partnerColsOrdered = [...partnerCols].sort(
      (a, b) => Number(isServiceLikeHeader(b)) - Number(isServiceLikeHeader(a))
    );

    for (const boCol of boColsOrdered) {
      for (const partnerCol of partnerColsOrdered) {
        const overlapScore = scorePair(boCol, partnerCol);
        if (overlapScore <= 0) {
          continue;
        }
        const headerBonus =
          (isServiceLikeHeader(boCol) ? 0.15 : 0) + (isServiceLikeHeader(partnerCol) ? 0.15 : 0);
        const totalScore = overlapScore + headerBonus;
        if (!best || totalScore > best.overlapScore) {
          best = { boColumn: boCol, partnerColumn: partnerCol, overlapScore: totalScore };
        }
        if (totalScore >= 0.95) {
          return best;
        }
      }
    }

    return best;
  }

  /**
   * Associe chaque service partenaire aux variantes BO correspondantes (égalité ou inclusion).
   * Ex. partenaire CASHINOMCI ↔ BO CASHINOMCIPART2, MYTP_CASHINOMCI, GU2_CASHINOMCIPART_CI.
   */
  findServiceMatches(
    boData: Record<string, string>[],
    partnerData: Record<string, string>[],
    boColumn: string,
    partnerColumn: string
  ): MagicServiceMatch[] {
    const boValues = this.extractDistinctValues(boData, boColumn);
    const partnerValues = this.extractDistinctValues(partnerData, partnerColumn);
    const sortedPartners = [...partnerValues].sort(
      (a, b) => this.normalizeServiceValue(b).length - this.normalizeServiceValue(a).length
    );
    const assignedBo = new Set<string>();
    const matches: MagicServiceMatch[] = [];

    for (const partnerSvc of sortedPartners) {
      const boMatches: string[] = [];
      for (const boSvc of boValues) {
        if (assignedBo.has(boSvc)) {
          continue;
        }
        if (this.serviceValuesMatch(boSvc, partnerSvc)) {
          boMatches.push(boSvc);
          assignedBo.add(boSvc);
        }
      }
      if (boMatches.length) {
        matches.push({ partnerService: partnerSvc, boServices: boMatches.sort() });
      }
    }

    return matches.sort((a, b) => a.partnerService.localeCompare(b.partnerService));
  }

  /** @deprecated Préférer findServiceMatches ; retourne les libellés partenaire reconnus. */
  findCommonServices(
    boData: Record<string, string>[],
    partnerData: Record<string, string>[],
    boColumn: string,
    partnerColumn: string
  ): string[] {
    return this.findServiceMatches(boData, partnerData, boColumn, partnerColumn)
      .map(m => m.partnerService);
  }

  private normalizeServiceValue(value: string): string {
    return (value || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  private serviceValuesMatch(boValue: string, partnerValue: string): boolean {
    const bo = this.normalizeServiceValue(boValue);
    const partner = this.normalizeServiceValue(partnerValue);
    if (!bo || !partner) {
      return false;
    }
    if (bo === partner) {
      return true;
    }
    if (partner.length >= MIN_SERVICE_PARTIAL_TOKEN_LENGTH && bo.includes(partner)) {
      return true;
    }
    if (bo.length >= MIN_SERVICE_PARTIAL_TOKEN_LENGTH && partner.includes(bo)) {
      return true;
    }
    return false;
  }

  private countServiceOverlap(boValues: string[], partnerValues: string[]): number {
    let overlap = 0;
    for (const bo of boValues) {
      for (const partner of partnerValues) {
        if (this.serviceValuesMatch(bo, partner)) {
          overlap++;
          break;
        }
      }
    }
    return overlap;
  }

  private findServiceColumn(data: Record<string, string>[]): string | null {
    if (!data?.length) {
      return null;
    }
    return Object.keys(data[0]).find(c => {
      const l = c.toLowerCase();
      return l.includes('service') || l.includes('serv') || l.includes('type') || l.includes('produit');
    }) || null;
  }

  private buildDistinctValueCache(
    data: Record<string, string>[],
    columns: string[]
  ): Map<string, string[]> {
    const cache = new Map<string, string[]>();
    for (const column of columns) {
      cache.set(column, this.extractDistinctValues(data, column));
    }
    return cache;
  }

  private extractDistinctValues(data: Record<string, string>[], column: string): string[] {
    return [...new Set(data.map(r => (r[column] || '').trim()).filter(Boolean))].sort();
  }

  private applyBoTreatments(
    boData: Record<string, string>[],
    boTreatments: Record<string, unknown>
  ): Record<string, string>[] {
    let processed = [...boData];
    for (const treatments of Object.values(boTreatments)) {
      if (!Array.isArray(treatments)) {
        continue;
      }
      for (const treatment of treatments as Array<{ type?: string; column?: string; suffix?: string }>) {
        if (treatment?.type === 'removeSuffix' && treatment.column && treatment.suffix) {
          processed = processed.map(row => {
            const copy = { ...row };
            const val = copy[treatment.column!];
            if (typeof val === 'string' && val.endsWith(treatment.suffix!)) {
              copy[treatment.column!] = val.slice(0, -treatment.suffix!.length);
            }
            return copy;
          });
        }
      }
    }
    return processed;
  }

  /**
   * Applique les normalisations du plan d'auto-découverte aux données.
   * Les normalisations sont définies par fichier (A=BO, B=Partenaire) et colonne.
   */
  private applyDiscoveryNormalizations(
    data: Record<string, string>[],
    normalizations: Array<{ file: 'A' | 'B'; column: string; operations: string[] }>,
    fileSide: 'A' | 'B'
  ): Record<string, string>[] {
    if (!normalizations || normalizations.length === 0) return data;

    // Filtrer les normalisations pour ce côté (A=BO, B=Partenaire)
    const relevantNorms = normalizations.filter(n => n.file === fileSide);
    if (relevantNorms.length === 0) return data;

    return data.map(row => {
      const copy = { ...row };
      for (const norm of relevantNorms) {
        const value = copy[norm.column];
        if (value === undefined || value === null) continue;
        let normalized = String(value).trim();
        for (const op of norm.operations) {
          if (!normalized) break;
          if (op === 'trim') normalized = normalized.trim();
          else if (op === 'upper') normalized = normalized.toUpperCase();
          else if (op === 'lower') normalized = normalized.toLowerCase();
          else if (op === 'strip_leading_zeros') normalized = normalized.replace(/^0+(?=.)/, '');
          else if (op === 'remove_non_alnum') normalized = normalized.replace(/[^A-Za-z0-9]/g, '');
          else if (op.startsWith('remove_prefix:')) {
            const prefix = op.slice('remove_prefix:'.length);
            if (normalized.startsWith(prefix)) normalized = normalized.slice(prefix.length);
          }
          else if (op.startsWith('remove_suffix:')) {
            const suffix = op.slice('remove_suffix:'.length);
            if (normalized.endsWith(suffix)) normalized = normalized.slice(0, -suffix.length);
          }
          else if (op === 'to_amount') {
            const num = this.parseAmount(normalized);
            normalized = num != null ? num.toString() : '';
          }
          else if (op === 'abs') {
            if (normalized.startsWith('-')) normalized = normalized.slice(1);
          }
          else if (op === 'decimal_sep_dot') {
            normalized = normalized.replace(/,/g, '.');
          }
          else if (op === 'decimal_sep_comma') {
            normalized = normalized.replace(/\./g, ',');
          }
          else if (op === 'remove_spaces') {
            normalized = normalized.replace(/\s+/g, '');
          }
          // parse_date is handled by backend, skip here
        }
        copy[norm.column] = normalized;
      }
      return copy;
    });
  }

  private parseAmount(value: string): number | null {
    const s = value.replace(/\u00A0/g, '').replace(/\s/g, '');
    if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return parseFloat(s.replace(/,/g, ''));
    const clean = s.replace(/,/g, '.');
    return /^-?\d+(\.\d+)?$/.test(clean) ? parseFloat(clean) : null;
  }

  matchesFilePattern(fileName: string, pattern: string): boolean {
    if (!pattern || !fileName) {
      return false;
    }
    const lowerName = fileName.toLowerCase();
    const lowerPattern = pattern.toLowerCase();
    const acceptedExtensions = ['.csv', '.xls', '.xlsx'];
    const getExtension = (name: string): string => {
      const match = name.match(/\.[^/.]+$/);
      return match ? match[0] : '';
    };
    const fileNameExt = getExtension(lowerName);
    const patternExt = getExtension(lowerPattern);
    const nameNoExt = lowerName.replace(/\.[^/.]+$/, '');
    const patternNoExt = lowerPattern.replace(/\.[^/.]+$/, '');

    if (patternNoExt.includes('*') || patternNoExt.includes('?')) {
      const regexPattern = patternNoExt.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.');
      try {
        if (new RegExp(`^${regexPattern}$`, 'i').test(nameNoExt)) {
          return !patternExt || acceptedExtensions.includes(patternExt) && acceptedExtensions.includes(fileNameExt);
        }
      } catch { /* ignore */ }
      return false;
    }

    if (patternExt && acceptedExtensions.includes(patternExt)) {
      return nameNoExt === patternNoExt && acceptedExtensions.includes(fileNameExt);
    }

    if (nameNoExt === patternNoExt) {
      return true;
    }
    if (nameNoExt.includes(patternNoExt) || patternNoExt.includes(nameNoExt)) {
      return true;
    }
    return nameNoExt.startsWith(patternNoExt);
  }

  private emptyResponse(): ReconciliationResponse {
    return {
      matches: [],
      boOnly: [],
      partnerOnly: [],
      mismatches: [],
      totalBoRecords: 0,
      totalPartnerRecords: 0,
      totalMatches: 0,
      totalMismatches: 0,
      totalBoOnly: 0,
      totalPartnerOnly: 0
    };
  }

  private mergeResponses(target: ReconciliationResponse, source: ReconciliationResponse): void {
    target.matches.push(...source.matches);
    target.boOnly.push(...source.boOnly);
    target.partnerOnly.push(...source.partnerOnly);
    target.mismatches.push(...(source.mismatches || []));
    target.totalBoRecords += source.totalBoRecords;
    target.totalPartnerRecords += source.totalPartnerRecords;
    target.totalMatches += source.totalMatches;
    target.totalMismatches += source.totalMismatches;
    target.totalBoOnly += source.totalBoOnly;
    target.totalPartnerOnly += source.totalPartnerOnly;
    if (!target.regularisationRules && source.regularisationRules) {
      target.regularisationRules = source.regularisationRules;
    }
    if (!target.configComments && source.configComments) {
      target.configComments = source.configComments;
    }
    if (!target.trxboOppartConfig && source.trxboOppartConfig) {
      target.trxboOppartConfig = source.trxboOppartConfig;
    }
  }

  private tagResponseWithPartnerFile(
    response: ReconciliationResponse,
    partnerFileName: string
  ): ReconciliationResponse {
    const tagRow = (row: Record<string, string>) => ({ ...row, _magicPartnerFile: partnerFileName });
    return {
      ...response,
      matches: response.matches.map(m => ({
        ...m,
        boData: tagRow(m.boData),
        partnerData: tagRow(m.partnerData),
        partnerDataList: m.partnerDataList?.map(tagRow)
      })),
      boOnly: response.boOnly.map(tagRow),
      partnerOnly: response.partnerOnly.map(tagRow),
      mismatches: (response.mismatches || []).map(tagRow)
    };
  }
}
