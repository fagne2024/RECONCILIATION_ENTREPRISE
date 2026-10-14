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
  normalizeReconciliationKeyValue
} from '../utils/reconciliation-key.util';
import { partnerServiceMatchesBo } from '../utils/service-match.util';

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

@Injectable({ providedIn: 'root' })
export class PartnerConditionalKeysService {

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
    partnerData: Record<string, string>[]
  ): { boKeyColumn: string; partnerKeyColumn: string } | null {
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
    partnerData: Record<string, string>[]
  ): { boKeyColumn: string; partnerKeyColumn: string } | null {
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
    model: AutoProcessingModel
  ): PreparedConditionalReconciliationData | null {
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
      nextBo = this.applyPairedBoKeysForPartnerConditional(boData, partnerConfig, model);
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
   * même logique SERVICE/ENV, clé par défaut du modèle BO (ex. Numéro Trans GU),
   * clé alternative (ex. CLE) pour les règles optionnelles (ex. CASHINMTNCM → CLECI).
   */
  applyPairedBoKeysForPartnerConditional(
    boData: Record<string, string>[],
    partnerConfig: PartnerConditionalKeysConfig,
    model: AutoProcessingModel
  ): Record<string, string>[] {
    if (!boData?.length || !this.isConditionalConfigEnabled(partnerConfig)) {
      return boData;
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
   * Compare une valeur de colonne condition (ex. SERVICE / Service) à la valeur de règle.
   * Utilise le même rapprochement souple que la réconciliation magique (CASHINMTNCM ↔ CASHINMTNCMPART).
   */
  private matchesConditionalRuleValue(cellValue: string, ruleWhenValue: string): boolean {
    const cell = (cellValue || '').trim();
    const rule = (ruleWhenValue || '').trim();
    if (!cell || !rule) {
      return false;
    }
    if (cell.toLowerCase() === rule.toLowerCase()) {
      return true;
    }
    return partnerServiceMatchesBo(rule, cell) || partnerServiceMatchesBo(cell, rule);
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

    return null;
  }

  private normalizeColumnName(name: string): string {
    return fixCellEncoding(name).replace(/\s+/g, ' ').trim();
  }
}
