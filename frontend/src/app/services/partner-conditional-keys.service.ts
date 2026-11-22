import { Injectable } from '@angular/core';
import {
  AutoProcessingModel,
  BoConditionalKeysConfig,
  ENV_COLUMN_NAME,
  PartnerConditionalKeyRule,
  PartnerConditionalKeysConfig
} from './auto-processing.service';
import { fixCellEncoding } from '../utils/encoding-fixer';
import {
  BO_RECONCILIATION_KEY_ALIASES,
  PARTNER_REFERENCE_KEY_ALIASES,
  findColumnByCanonicalId,
  normalizeReconciliationKeyValue
} from '../utils/reconciliation-key.util';

/** Colonne synthétique injectée dans les données partenaire avant réconciliation. */
export const PARTNER_CONDITIONAL_KEY_COLUMN = '__PARTNER_RECON_KEY__';

/** Colonne synthétique injectée dans les données BO avant réconciliation. */
export const BO_CONDITIONAL_KEY_COLUMN = '__BO_RECON_KEY__';

type ConditionalKeysConfig = PartnerConditionalKeysConfig | BoConditionalKeysConfig;

/** Colonnes candidates pour la colonne « condition » (SERVICE, Type, etc.). */
const CONDITION_COLUMN_ALIASES = [
  'SERVICE',
  'Service',
  'service',
  'Type',
  'type',
  'TYPE'
];

export interface PreparedConditionalReconciliationData {
  boData: Record<string, string>[];
  partnerData: Record<string, string>[];
  boKeyColumn: string;
  partnerKeyColumn: string;
}

/** Modèle BO utilisé pour la réconciliation : id, ou modèle (id / modelId). */
export type BoModelHint = string | { id?: string; modelId?: string } | null | undefined;

@Injectable({ providedIn: 'root' })
export class PartnerConditionalKeysService {

  /**
   * Modèle partenaire rattaché à plusieurs modèles BO avec une configuration par modèle BO :
   * retourne une copie du modèle partenaire portant la configuration du modèle BO utilisé
   * (clés partenaire, clés conditionnelles, clés BO de ce seul modèle).
   * Le modèle BO est celui indiqué, sinon celui dont les colonnes clés figurent dans le fichier BO.
   * Sans configuration par modèle BO, le modèle est retourné tel quel.
   */
  specializeForBoModel(
    model: AutoProcessingModel,
    boData: Record<string, string>[],
    boModelHint?: BoModelHint
  ): AutoProcessingModel {
    const rk = model?.reconciliationKeys;
    const configs = rk?.boModelConfigs;
    if (!rk || !configs || !Object.keys(configs).length) {
      return model;
    }
    const boModelId = this.resolveUsedBoModelId(model, boData, boModelHint);
    const { boModelConfigs: _ignored, ...baseKeys } = rk;
    if (!boModelId) {
      return { ...model, reconciliationKeys: baseKeys };
    }
    const config = configs[boModelId] || {};
    return {
      ...model,
      reconciliationKeys: {
        ...baseKeys,
        partnerKeys: config.partnerKeys ?? rk.partnerKeys ?? [],
        partnerConditionalKeys: config.partnerConditionalKeys ?? rk.partnerConditionalKeys,
        boConditionalKeys: config.boConditionalKeys ?? rk.boConditionalKeys,
        boModels: [boModelId],
        boModelKeys: { [boModelId]: rk.boModelKeys?.[boModelId] || [] },
        boTreatments: rk.boTreatments?.[boModelId] !== undefined
          ? { [boModelId]: rk.boTreatments[boModelId] }
          : {}
      }
    };
  }

  /** Id (tel que stocké dans boModels) du modèle BO utilisé, ou null. */
  resolveUsedBoModelId(
    model: AutoProcessingModel,
    boData: Record<string, string>[],
    boModelHint?: BoModelHint
  ): string | null {
    const rk = model?.reconciliationKeys;
    const linked = rk?.boModels || [];
    if (!linked.length) {
      return null;
    }
    const hintIds = typeof boModelHint === 'string'
      ? [boModelHint]
      : [boModelHint?.id, boModelHint?.modelId];
    const hinted = linked.find(id => hintIds.some(h => !!h && String(h) === String(id)));
    if (hinted) {
      return hinted;
    }

    // Détection : modèle BO dont le plus de colonnes clés configurées figurent dans le fichier BO.
    let best: string | null = null;
    let bestScore = 0;
    for (const id of linked) {
      const config = rk?.boModelConfigs?.[id];
      const columns = [
        ...(rk?.boModelKeys?.[id] || []),
        ...(config?.boConditionalKeys?.enabled ? [
          config.boConditionalKeys.conditionColumn,
          config.boConditionalKeys.defaultKeyColumn || '',
          ...(config.boConditionalKeys.rules || []).map(r => r.keyColumn)
        ] : []),
        ...(config?.partnerConditionalKeys?.enabled
          ? (config.partnerConditionalKeys.rules || []).map(r => r.boKeyColumn || '')
          : [])
      ].filter(c => !!c?.trim());
      const score = new Set(columns.filter(c => !!this.findExistingColumn(boData, [c]))).size;
      if (score > bestScore) {
        best = id;
        bestScore = score;
      }
    }
    return best ?? linked[0];
  }

  isEnabled(config?: PartnerConditionalKeysConfig | null): boolean {
    return this.isConditionalConfigEnabled(config);
  }

  isBoConditionalEnabled(config?: BoConditionalKeysConfig | null): boolean {
    return this.isConditionalConfigEnabled(config);
  }

  isConfigValid(data: Record<string, string>[], config: PartnerConditionalKeysConfig): boolean {
    return this.isConditionalConfigValid(data, config);
  }

  isBoConditionalConfigValid(data: Record<string, string>[], config: BoConditionalKeysConfig): boolean {
    return this.isConditionalConfigValid(data, config);
  }

  resolveBoKeyFromModel(model: AutoProcessingModel, boData: Record<string, string>[]): string | null {
    return this.resolveDefaultBoKeyFromModel(model, boData);
  }

  /**
   * Clé BO par défaut : modèles BO sélectionnés (ex. Numéro Trans GU) avant CLE générique.
   */
  resolveDefaultBoKeyFromModel(model: AutoProcessingModel, boData: Record<string, string>[]): string | null {
    for (const boModelId of model.reconciliationKeys?.boModels || []) {
      const boModelKeys = model.reconciliationKeys?.boModelKeys?.[boModelId];
      if (boModelKeys?.length) {
        const found = this.findExistingColumn(boData, boModelKeys);
        if (found) {
          return found;
        }
      }
    }

    const boKeys = model.reconciliationKeys?.boKeys || [];
    if (boKeys.length) {
      const found = this.findExistingColumn(boData, boKeys);
      if (found) {
        return found;
      }
    }

    const numeroTransGu = this.findExistingColumn(boData, [
      'Numéro Trans GU',
      'Numero Trans GU',
      'numeroTransGU',
      'numtransactiongu',
      'NUMTRANSACTIONGU'
    ]);
    if (numeroTransGu) {
      return numeroTransGu;
    }

    return this.findExistingColumn(boData, BO_RECONCILIATION_KEY_ALIASES);
  }

  resolvePartnerKeyFromModel(model: AutoProcessingModel, partnerData: Record<string, string>[]): string | null {
    const partnerKeys = model.reconciliationKeys?.partnerKeys || [];
    if (partnerKeys.length) {
      const found = this.findExistingColumn(partnerData, partnerKeys);
      if (found) {
        return found;
      }
    }

    return this.findExistingColumn(partnerData, PARTNER_REFERENCE_KEY_ALIASES);
  }

  /**
   * Si le modèle définit des clés conditionnelles partenaire valides, retourne la colonne clé synthétique.
   * Les clés partenaire par défaut du modèle servent de repli ligne par ligne si les conditions optionnelles ne sont pas remplies.
   */
  tryResolveConditionalPartnerKey(
    model: AutoProcessingModel,
    boData: Record<string, string>[],
    partnerData: Record<string, string>[],
    boModelHint?: BoModelHint
  ): { boKeyColumn: string; partnerKeyColumn: string } | null {
    model = this.specializeForBoModel(model, boData, boModelHint);
    const keys = this.resolveReconciliationKeyColumns(model, boData, partnerData);
    if (!keys || keys.partnerKeyColumn !== PARTNER_CONDITIONAL_KEY_COLUMN) {
      return null;
    }
    return keys;
  }

  /**
   * Résout les colonnes clés à partir d'un modèle partenaire (tous les modèles).
   */
  resolveKeysFromPartnerModel(
    model: AutoProcessingModel,
    boData: Record<string, string>[],
    partnerData: Record<string, string>[],
    boModelHint?: BoModelHint
  ): { boKeyColumn: string; partnerKeyColumn: string } | null {
    model = this.specializeForBoModel(model, boData, boModelHint);
    if (!this.modelHasReconciliationKeyConfig(model)) {
      return null;
    }
    const resolved = this.resolveReconciliationKeyColumns(model, boData, partnerData);
    if (resolved) {
      return resolved;
    }
    return this.tryResolvePairedKeysFromModel(model, boData, partnerData);
  }

  /**
   * Point d'entrée unique : applique les colonnes synthétiques partenaire/BO selon la config du modèle.
   */
  applyModelConditionalKeys(
    boData: Record<string, string>[],
    partnerData: Record<string, string>[],
    model: AutoProcessingModel,
    boModelHint?: BoModelHint
  ): PreparedConditionalReconciliationData | null {
    model = this.specializeForBoModel(model, boData, boModelHint);
    const keys = this.resolveReconciliationKeyColumns(model, boData, partnerData);
    if (!keys) {
      return null;
    }

    let nextBo = boData;
    let nextPartner = partnerData;
    const partnerConfig = model.reconciliationKeys?.partnerConditionalKeys;

    if (
      keys.partnerKeyColumn === PARTNER_CONDITIONAL_KEY_COLUMN
      && partnerConfig
      && this.isConfigValid(partnerData, partnerConfig)
    ) {
      nextPartner = this.applyPartnerConditionalKeys(
        partnerData,
        partnerConfig,
        this.buildPartnerFallbackColumns(model, partnerConfig)
      );
      nextBo = this.applyPairedBoKeysForPartnerConditional(boData, partnerConfig, model, partnerData);
    } else if (keys.boKeyColumn === BO_CONDITIONAL_KEY_COLUMN) {
      const boConfig = model.reconciliationKeys?.boConditionalKeys;
      if (boConfig && this.isBoConditionalConfigValid(boData, boConfig)) {
        nextBo = this.applyBoConditionalKeys(
          boData,
          boConfig,
          this.buildBoFallbackColumns(model, boConfig)
        );
      }
    }

    return {
      boData: nextBo,
      partnerData: nextPartner,
      boKeyColumn: keys.boKeyColumn,
      partnerKeyColumn: keys.partnerKeyColumn
    };
  }

  buildPartnerFallbackColumns(
    model: AutoProcessingModel,
    config?: PartnerConditionalKeysConfig | null
  ): string[] {
    return this.buildFallbackKeyColumnList(
      config || { enabled: false, conditionColumn: '', rules: [] },
      model.reconciliationKeys?.partnerKeys
    );
  }

  /**
   * Résout les colonnes clés : les clés par défaut du modèle restent la base ;
   * la colonne synthétique conditionnelle ne remplace que les lignes dont les conditions optionnelles sont remplies.
   */
  resolveReconciliationKeyColumns(
    model: AutoProcessingModel,
    boData: Record<string, string>[],
    partnerData: Record<string, string>[]
  ): { boKeyColumn: string; partnerKeyColumn: string } | null {
    model = this.specializeForBoModel(model, boData);
    const partnerConditional = model.reconciliationKeys?.partnerConditionalKeys;
    const boConditional = model.reconciliationKeys?.boConditionalKeys;
    const defaultPartnerCol = this.resolvePartnerKeyFromModel(model, partnerData);

    let partnerKeyColumn = '';
    let boKeyColumn = '';
    const canUsePartnerConditional = this.isEnabled(partnerConditional)
      && this.isConfigValid(partnerData, partnerConditional!)
      && !!this.resolveDefaultBoKeyFromModel(model, boData);
    if (canUsePartnerConditional) {
      partnerKeyColumn = PARTNER_CONDITIONAL_KEY_COLUMN;
      boKeyColumn = BO_CONDITIONAL_KEY_COLUMN;
    } else {
      partnerKeyColumn = defaultPartnerCol || '';
      if (this.isBoConditionalEnabled(boConditional) && this.isBoConditionalConfigValid(boData, boConditional!)) {
        boKeyColumn = BO_CONDITIONAL_KEY_COLUMN;
      } else {
        boKeyColumn = this.resolveBoKeyColumnForModel(model, boData) || '';
      }
    }

    if (!boKeyColumn || !partnerKeyColumn) {
      return null;
    }
    return { boKeyColumn, partnerKeyColumn };
  }

  private modelHasReconciliationKeyConfig(model: AutoProcessingModel): boolean {
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
      this.isEnabled(rk.partnerConditionalKeys) ||
      this.isBoConditionalEnabled(rk.boConditionalKeys)
    );
  }

  /**
   * Résolution couplée BO/partenaire (boModelKeys + partnerKeys) en repli si la résolution unifiée échoue.
   */
  private tryResolvePairedKeysFromModel(
    model: AutoProcessingModel,
    boData: Record<string, string>[],
    partnerData: Record<string, string>[]
  ): { boKeyColumn: string; partnerKeyColumn: string } | null {
    const partnerKeys = model.reconciliationKeys?.partnerKeys || [];
    const boKeys = model.reconciliationKeys?.boKeys || [];

    if (partnerKeys.length && boKeys.length) {
      const foundBo = this.findExistingColumn(boData, boKeys);
      const foundPartner = this.findExistingColumn(partnerData, partnerKeys);
      if (foundBo && foundPartner) {
        return { boKeyColumn: foundBo, partnerKeyColumn: foundPartner };
      }
    }

    const foundPartner = this.resolvePartnerKeyFromModel(model, partnerData);
    if (!foundPartner) {
      return null;
    }

    for (const boModelId of model.reconciliationKeys?.boModels || []) {
      const boModelKeys = model.reconciliationKeys?.boModelKeys?.[boModelId];
      if (boModelKeys?.length) {
        const foundBo = this.findExistingColumn(boData, boModelKeys);
        if (foundBo) {
          return { boKeyColumn: foundBo, partnerKeyColumn: foundPartner };
        }
      }
    }

    const foundBo = this.resolveBoKeyFromModel(model, boData);
    if (foundBo) {
      return { boKeyColumn: foundBo, partnerKeyColumn: foundPartner };
    }

    return null;
  }

  private resolveBoKeyColumnForModel(model: AutoProcessingModel, boData: Record<string, string>[]): string | null {
    if (this.isBoConditionalEnabled(model.reconciliationKeys?.boConditionalKeys)
      && this.isBoConditionalConfigValid(boData, model.reconciliationKeys!.boConditionalKeys!)) {
      return BO_CONDITIONAL_KEY_COLUMN;
    }
    return this.resolveBoKeyFromModel(model, boData);
  }

  applyPartnerConditionalKeys(
    data: Record<string, string>[],
    config: PartnerConditionalKeysConfig,
    fallbackDefaultKeyColumns?: string[]
  ): Record<string, string>[] {
    return this.applyConditionalKeys(
      data,
      config,
      PARTNER_CONDITIONAL_KEY_COLUMN,
      this.buildFallbackKeyColumnList(config, fallbackDefaultKeyColumns)
    );
  }

  applyBoConditionalKeys(
    data: Record<string, string>[],
    config: BoConditionalKeysConfig,
    fallbackDefaultKeyColumns?: string[]
  ): Record<string, string>[] {
    return this.applyConditionalKeys(
      data,
      config,
      BO_CONDITIONAL_KEY_COLUMN,
      this.buildFallbackKeyColumnList(config, fallbackDefaultKeyColumns)
    );
  }

  /**
   * Construit la colonne BO synthétique en miroir des clés partenaire conditionnelles :
   * clé par défaut du modèle BO (ex. ID Partenaire / Numéro Trans GU), clé de la règle
   * (ex. Token GU, CLE) pour les lignes concernées par une règle optionnelle.
   *
   * Avec les données partenaire, la détection repose UNIQUEMENT sur le fichier partenaire
   * (sa nomenclature de service) : une ligne BO prend la clé de la règle quand sa valeur
   * dans la colonne BO de la règle est une clé produite par cette règle côté partenaire.
   * Le libellé service du BO n'est pas comparé (il diffère souvent : suffixe pays…).
   */
  applyPairedBoKeysForPartnerConditional(
    boData: Record<string, string>[],
    partnerConfig: PartnerConditionalKeysConfig,
    model: AutoProcessingModel,
    partnerData?: Record<string, string>[]
  ): Record<string, string>[] {
    if (!boData?.length || !this.isConditionalConfigEnabled(partnerConfig)) {
      return boData;
    }

    if (partnerData?.length) {
      const fromPartner = this.applyBoKeysFromPartnerRules(boData, partnerData, partnerConfig, model);
      if (fromPartner) {
        return fromPartner;
      }
    }

    const boConditional = model.reconciliationKeys?.boConditionalKeys;
    if (this.isBoConditionalEnabled(boConditional) && this.isBoConditionalConfigValid(boData, boConditional!)) {
      return this.applyBoConditionalKeys(
        boData,
        boConditional!,
        this.buildBoFallbackColumns(model, boConditional)
      );
    }

    const defaultBoKeyCol = this.resolveDefaultBoKeyFromModel(model, boData);
    if (!defaultBoKeyCol) {
      return boData;
    }

    return this.applyMirroredBoKeysFromPartnerConfig(
      boData,
      partnerConfig,
      model,
      defaultBoKeyCol
    );
  }

  buildBoFallbackColumns(
    model: AutoProcessingModel,
    config?: BoConditionalKeysConfig | null
  ): string[] {
    const columns: string[] = [];
    for (const boModelId of model.reconciliationKeys?.boModels || []) {
      for (const col of model.reconciliationKeys?.boModelKeys?.[boModelId] || []) {
        if (col?.trim()) {
          columns.push(col.trim());
        }
      }
    }
    for (const col of model.reconciliationKeys?.boKeys || []) {
      if (col?.trim()) {
        columns.push(col.trim());
      }
    }
    const conditionalDefault = config?.defaultKeyColumn?.trim();
    if (conditionalDefault) {
      columns.push(conditionalDefault);
    }
    return [...new Set(columns)];
  }

  private applyMirroredBoKeysFromPartnerConfig(
    boData: Record<string, string>[],
    partnerConfig: PartnerConditionalKeysConfig,
    model: AutoProcessingModel,
    defaultBoKeyCol: string
  ): Record<string, string>[] {
    const conditionCol = this.findConditionColumn(boData, partnerConfig.conditionColumn);

    if (!conditionCol) {
      return boData.map(row => ({
        ...row,
        [BO_CONDITIONAL_KEY_COLUMN]: String(row[defaultBoKeyCol] ?? '').trim()
      }));
    }

    const resolvedRules = partnerConfig.rules
      .filter(r => r.whenValue?.trim() && r.keyColumn?.trim())
      .map(rule => ({
        whenValue: rule.whenValue.trim(),
        boKeyCol: this.resolveBoKeyColumnForPartnerRule(rule, boData, model, defaultBoKeyCol)
      }))
      .filter((r): r is { whenValue: string; boKeyCol: string } => !!r.boKeyCol);

    const envConditionValue = this.getEnvConditionValue(partnerConfig);
    const envCol = envConditionValue
      ? this.findExistingColumn(boData, [ENV_COLUMN_NAME])
      : null;

    return boData.map(row => {
      const copy = { ...row };
      const resolveDefault = () => String(copy[defaultBoKeyCol] ?? '').trim();

      if (envConditionValue && envCol) {
        const envVal = (copy[envCol] || '').trim();
        if (envVal.toUpperCase() !== envConditionValue.toUpperCase()) {
          copy[BO_CONDITIONAL_KEY_COLUMN] = resolveDefault();
          return copy;
        }
      }

      const conditionVal = (copy[conditionCol] || '').trim();
      let optionalBoKeyCol: string | null = null;
      let optionalRuleMatched = false;

      for (const rule of resolvedRules) {
        if (this.matchesConditionalRuleValue(conditionVal, rule.whenValue)) {
          optionalRuleMatched = true;
          optionalBoKeyCol = rule.boKeyCol;
          break;
        }
      }

      if (optionalRuleMatched && optionalBoKeyCol) {
        const optionalVal = (copy[optionalBoKeyCol] || '').trim();
        copy[BO_CONDITIONAL_KEY_COLUMN] = optionalVal
          ? this.formatOptionalKeyValue(optionalVal)
          : resolveDefault();
      } else {
        copy[BO_CONDITIONAL_KEY_COLUMN] = resolveDefault();
      }
      return copy;
    });
  }

  /**
   * Clés BO pilotées par le fichier partenaire : pour chaque règle, on relève les clés que
   * la règle produit côté partenaire (ex. Token GU des lignes PAIEMENTMARCHAND_MOOV) ; une
   * ligne BO dont la colonne BO de la règle contient l'une de ces clés prend cette clé,
   * sinon la clé par défaut du modèle. Retourne null si rien n'est applicable (repli).
   */
  private applyBoKeysFromPartnerRules(
    boData: Record<string, string>[],
    partnerData: Record<string, string>[],
    partnerConfig: PartnerConditionalKeysConfig,
    model: AutoProcessingModel
  ): Record<string, string>[] | null {
    const defaultBoKeyCol = this.resolveDefaultBoKeyFromModel(model, boData);
    const partnerConditionCol = this.findConditionColumn(partnerData, partnerConfig.conditionColumn);
    if (!defaultBoKeyCol || !partnerConditionCol) {
      return null;
    }

    const envConditionValue = this.getEnvConditionValue(partnerConfig);
    const partnerEnvCol = envConditionValue ? this.findExistingColumn(partnerData, [ENV_COLUMN_NAME]) : null;

    const rules = partnerConfig.rules
      .filter(r => r.whenValue?.trim() && r.keyColumn?.trim())
      .map(rule => ({
        whenValue: rule.whenValue.trim(),
        partnerKeyCol: this.findExistingColumn(partnerData, [rule.keyColumn.trim()]),
        boKeyCol: this.resolveBoKeyColumnForPartnerRule(rule, boData, model, defaultBoKeyCol)
          ?? this.findExistingColumn(boData, [rule.keyColumn.trim()]),
        partnerKeys: new Set<string>()
      }))
      .filter(r => !!r.partnerKeyCol && !!r.boKeyCol);
    if (!rules.length) {
      return null;
    }

    // Clés produites par chaque règle côté partenaire (même ordre de priorité que applyConditionalKeys).
    for (const row of partnerData) {
      if (envConditionValue) {
        const envVal = partnerEnvCol ? (row[partnerEnvCol] || '').trim() : '';
        if (envVal.toUpperCase() !== envConditionValue.toUpperCase()) {
          continue;
        }
      }
      const conditionVal = (row[partnerConditionCol] || '').trim();
      const rule = rules.find(r => this.matchesConditionalRuleValue(conditionVal, r.whenValue));
      const value = rule ? (row[rule.partnerKeyCol!] || '').trim() : '';
      if (rule && value) {
        rule.partnerKeys.add(this.formatOptionalKeyValue(value));
      }
    }

    return boData.map(row => {
      const copy = { ...row };
      let key = '';
      for (const rule of rules) {
        const raw = (copy[rule.boKeyCol!] || '').trim();
        const value = raw ? this.formatOptionalKeyValue(raw) : '';
        if (value && rule.partnerKeys.has(value)) {
          key = value;
          break;
        }
      }
      copy[BO_CONDITIONAL_KEY_COLUMN] = key || String(copy[defaultBoKeyCol] ?? '').trim();
      return copy;
    });
  }

  private resolveBoKeyColumnForPartnerRule(
    rule: PartnerConditionalKeyRule,
    boData: Record<string, string>[],
    model: AutoProcessingModel,
    defaultBoKeyCol: string
  ): string | null {
    if (rule.boKeyColumn?.trim()) {
      return this.findExistingColumn(boData, [rule.boKeyColumn.trim()]);
    }
    return this.inferBoKeyColumnForPartnerRule(rule.keyColumn, boData, defaultBoKeyCol, model);
  }

  private inferBoKeyColumnForPartnerRule(
    partnerKeyColumn: string,
    boData: Record<string, string>[],
    defaultBoKeyCol: string,
    model?: AutoProcessingModel
  ): string | null {
    const normalized = partnerKeyColumn.replace(/\s+/g, '').toLowerCase();
    if (normalized.includes('cleci')) {
      const cleCol = this.findExistingColumn(boData, ['CLE', 'Cle', 'cle', 'Key', 'key']);
      if (cleCol) {
        return cleCol;
      }
    }

    if (model) {
      for (const candidate of this.collectAlternateBoKeyCandidates(model, defaultBoKeyCol)) {
        const found = this.findExistingColumn(boData, [candidate]);
        if (found && found !== defaultBoKeyCol) {
          return found;
        }
      }
    }

    const cleCol = this.findExistingColumn(boData, ['CLE', 'Cle', 'cle']);
    if (cleCol && cleCol !== defaultBoKeyCol) {
      return cleCol;
    }

    return null;
  }

  private collectAlternateBoKeyCandidates(
    model: AutoProcessingModel,
    defaultBoKeyCol: string
  ): string[] {
    const columns: string[] = [];
    for (const boModelId of model.reconciliationKeys?.boModels || []) {
      for (const col of model.reconciliationKeys?.boModelKeys?.[boModelId] || []) {
        if (col?.trim() && col !== defaultBoKeyCol) {
          columns.push(col.trim());
        }
      }
    }
    for (const col of model.reconciliationKeys?.boKeys || []) {
      if (col?.trim() && col !== defaultBoKeyCol) {
        columns.push(col.trim());
      }
    }
    return [...new Set(columns)];
  }

  private findConditionColumn(
    data: Record<string, string>[],
    configuredColumn?: string
  ): string | null {
    const candidates = [
      ...(configuredColumn?.trim() ? [configuredColumn.trim()] : []),
      ...CONDITION_COLUMN_ALIASES
    ];
    return this.findExistingColumn(data, candidates);
  }

  /**
   * Compare une valeur de colonne condition (ex. SERVICE / Service) à la valeur de la règle :
   * correspondance EXACTE de ce qui est configuré (casse et espaces autour ignorés).
   * Ex. règle BF_PAIEMENTMARCHAND_MOOV : ni PAIEMENTMARCHAND_MOOV, ni CI_PAIEMENTMARCHAND_MOOV.
   */
  private matchesConditionalRuleValue(cellValue: string, ruleWhenValue: string): boolean {
    const cell = (cellValue || '').trim();
    const rule = (ruleWhenValue || '').trim();
    return !!cell && !!rule && cell.toUpperCase() === rule.toUpperCase();
  }

  /** Normalise les clés optionnelles numériques (zéros initiaux, espaces) sans toucher aux clés par défaut. */
  private formatOptionalKeyValue(value: string): string {
    const trimmed = (value || '').trim();
    if (!trimmed) {
      return '';
    }
    const compact = trimmed.replace(/\s/g, '');
    if (/^-?\d+(\.\d+)?$/.test(compact)) {
      return normalizeReconciliationKeyValue(trimmed);
    }
    return trimmed;
  }

  private buildFallbackKeyColumnList(
    config: ConditionalKeysConfig,
    fallbackDefaultKeyColumns?: string[]
  ): string[] {
    const columns: string[] = [];
    for (const col of fallbackDefaultKeyColumns || []) {
      const trimmed = col?.trim();
      if (trimmed) {
        columns.push(trimmed);
      }
    }
    const conditionalDefault = config.defaultKeyColumn?.trim();
    if (conditionalDefault) {
      columns.push(conditionalDefault);
    }
    return [...new Set(columns)];
  }

  private applyConditionalKeys(
    data: Record<string, string>[],
    config: ConditionalKeysConfig,
    targetColumn: string,
    fallbackDefaultKeyColumns?: string[]
  ): Record<string, string>[] {
    if (!data?.length || !this.isConditionalConfigEnabled(config)) {
      return data;
    }

    const conditionCol = this.findConditionColumn(data, config.conditionColumn);
    if (!conditionCol) {
      const conditionalDefaultCol = config.defaultKeyColumn?.trim()
        ? this.findExistingColumn(data, [config.defaultKeyColumn])
        : null;
      const modelDefaultKeyCol = fallbackDefaultKeyColumns?.length
        ? this.findExistingColumn(data, fallbackDefaultKeyColumns)
        : null;
      return data.map(row => {
        const copy = { ...row };
        copy[targetColumn] = this.resolveDefaultKeyValue(copy, modelDefaultKeyCol, conditionalDefaultCol);
        return copy;
      });
    }

    const resolvedRules = config.rules
      .filter(r => r.whenValue?.trim() && r.keyColumn?.trim())
      .map(rule => ({
        whenValue: rule.whenValue.trim(),
        keyCol: this.findExistingColumn(data, [rule.keyColumn])
      }))
      .filter((r): r is { whenValue: string; keyCol: string } => !!r.keyCol);

    const conditionalDefaultCol = config.defaultKeyColumn?.trim()
      ? this.findExistingColumn(data, [config.defaultKeyColumn])
      : null;

    const modelDefaultKeyCol = fallbackDefaultKeyColumns?.length
      ? this.findExistingColumn(data, fallbackDefaultKeyColumns)
      : null;

    const envConditionValue = this.getEnvConditionValue(config);
    const envCol = envConditionValue
      ? this.findExistingColumn(data, [ENV_COLUMN_NAME])
      : null;

    return data.map(row => {
      const copy = { ...row };
      const resolveDefaultKey = () => this.resolveDefaultKeyValue(
        copy,
        modelDefaultKeyCol,
        conditionalDefaultCol
      );

      if (envConditionValue) {
        if (!envCol) {
          copy[targetColumn] = resolveDefaultKey();
          return copy;
        }
        const envVal = (copy[envCol] || '').trim();
        if (envVal.toUpperCase() !== envConditionValue.toUpperCase()) {
          copy[targetColumn] = resolveDefaultKey();
          return copy;
        }
      }

      const conditionVal = (copy[conditionCol] || '').trim();
      let optionalKeyValue = '';
      let optionalRuleMatched = false;

      for (const rule of resolvedRules) {
        if (this.matchesConditionalRuleValue(conditionVal, rule.whenValue)) {
          optionalRuleMatched = true;
          optionalKeyValue = (copy[rule.keyCol] || '').trim();
          break;
        }
      }

      if (optionalRuleMatched && optionalKeyValue) {
        copy[targetColumn] = this.formatOptionalKeyValue(optionalKeyValue);
      } else {
        copy[targetColumn] = resolveDefaultKey();
      }
      return copy;
    });
  }

  /** Priorité : clés par défaut du modèle, puis clé par défaut optionnelle de la config conditionnelle. */
  private resolveDefaultKeyValue(
    row: Record<string, string>,
    modelDefaultKeyCol: string | null,
    conditionalDefaultCol: string | null
  ): string {
    if (modelDefaultKeyCol) {
      const fromModel = (row[modelDefaultKeyCol] || '').trim();
      if (fromModel) {
        return fromModel;
      }
    }
    if (conditionalDefaultCol) {
      return (row[conditionalDefaultCol] || '').trim();
    }
    return '';
  }

  private getEnvConditionValue(config: ConditionalKeysConfig): string | null {
    const value = (config as PartnerConditionalKeysConfig).envConditionValue?.trim();
    return value || null;
  }

  private isConditionalConfigEnabled(config?: ConditionalKeysConfig | null): boolean {
    return !!(
      config?.enabled &&
      config.conditionColumn?.trim() &&
      config.rules?.length &&
      config.rules.some(r => r.whenValue?.trim() && r.keyColumn?.trim())
    );
  }

  private isConditionalConfigValid(data: Record<string, string>[], config: ConditionalKeysConfig): boolean {
    if (!this.isConditionalConfigEnabled(config)) {
      return false;
    }
    const conditionCol = this.findConditionColumn(data, config.conditionColumn);
    if (!conditionCol) {
      return false;
    }
    return config.rules.some(rule => {
      if (!rule.whenValue?.trim() || !rule.keyColumn?.trim()) {
        return false;
      }
      return !!this.findExistingColumn(data, [rule.keyColumn]);
    });
  }

  findExistingColumn(data: Record<string, string>[], candidateKeys: string[]): string | null {
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

    // Équivalence FR/EN (ex. clé modèle « Numéro Trans GU » ↔ export BO anglais « Num Trans GU »).
    return findColumnByCanonicalId(available, candidateKeys);
  }

  private normalizeColumnName(name: string): string {
    return fixCellEncoding(name).replace(/\s+/g, ' ').trim();
  }
}
