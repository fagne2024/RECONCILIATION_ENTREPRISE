import { Injectable } from '@angular/core';

export interface KeySuggestion {
    boColumn: string;
    partnerColumn: string;
    confidence: number;
    reason: string;
    sampleValues: string[];
    transformation?: {
        type: 'remove_suffix' | 'remove_prefix' | 'remove_pattern' | 'case_transform' | 'format_transform' | 'multi_step';
        pattern: string;
        description: string;
    };
}

export interface KeyAnalysisResult {
    suggestions: KeySuggestion[];
    overallConfidence: number;
    recommendedKeys: string[];
}

@Injectable({
    providedIn: 'root'
})
export class KeySuggestionService {
    // Configuration des performances
    private readonly SAMPLE_SIZE = 200; // Taille maximale de l'échantillon
    private readonly SAMPLE_PERCENTAGE = 0.2; // 20% des valeurs uniques
    private readonly HIGH_CONFIDENCE_THRESHOLD = 0.8; // Seuil pour sortie précoce
    private readonly LOG_LEVEL = 'info'; // 'debug', 'info', 'warn', 'error'

    // Regex pré-compilées pour les performances
    private readonly numericRegex = /^\d+$/;
    private readonly dateRegex1 = /^\d{4}-\d{2}-\d{2}/;
    private readonly dateRegex2 = /^\d{2}\/\d{2}\/\d{4}/;
    private readonly dateRegex3 = /^\d{8}$/;
    private readonly alphanumericRegex = /^[a-zA-Z0-9]+$/;
    private readonly emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    private readonly amountRegex = /^[\d,.\s-]+$/;
    private readonly idPatternRegex = /^[A-Z]{2,4}_\d+_[A-Z]{3}$/;
    private readonly transactionPatternRegex = /^TRX_\d+_[A-Z]{3}$/;

    // Cache pour les transformations
    private transformationCache = new Map<string, any>();

    constructor() { }

    /**
     * Méthodes utilitaires pour l'optimisation des performances
     */
    private log(level: string, message: string, ...args: any[]): void {
        const levels = { debug: 0, info: 1, warn: 2, error: 3 };
        const currentLevel = levels[this.LOG_LEVEL as keyof typeof levels] || 1;
        const messageLevel = levels[level as keyof typeof levels] || 1;
        
        if (messageLevel >= currentLevel) {
        }
    }

    /**
     * Crée un échantillon représentatif des valeurs pour l'analyse
     */
    private createSample(values: Set<string>): string[] {
        if (values.size === 0) return [];
        
        const valuesArray = Array.from(values);
        
        // Calculer la taille de l'échantillon
        const sampleSize = Math.min(
            Math.max(
                Math.floor(values.size * this.SAMPLE_PERCENTAGE),
                50 // Minimum 50 valeurs
            ),
            this.SAMPLE_SIZE
        );
        
        // Si on a moins de valeurs que la taille d'échantillon, retourner tout
        if (valuesArray.length <= sampleSize) {
            return valuesArray;
        }
        
        // Créer un échantillon aléatoire avec priorisation des valeurs importantes
        const prioritizedValues: string[] = [];
        const regularValues: string[] = [];
        
        for (const value of valuesArray) {
            // Prioriser les valeurs qui ressemblent à des identifiants
            if (this.isLikelyIdentifier(value)) {
                prioritizedValues.push(value);
            } else {
                regularValues.push(value);
            }
        }
        
        // Mélanger les tableaux
        const shuffle = (arr: string[]) => arr.sort(() => 0.5 - Math.random());
        
        // Prendre d'abord les valeurs prioritaires, puis compléter avec les autres
        const finalSample = [
            ...shuffle(prioritizedValues).slice(0, Math.floor(sampleSize * 0.6)),
            ...shuffle(regularValues).slice(0, sampleSize - Math.floor(sampleSize * 0.6))
        ];
        
        return shuffle(finalSample);
    }

    /**
     * Détermine si une valeur ressemble à un identifiant
     */
    private isLikelyIdentifier(value: string): boolean {
        if (!value || value.length === 0) return false;
        
        // Valeurs numériques courtes
        if (this.numericRegex.test(value) && value.length <= 10) return true;
        
        // Valeurs alphanumériques courtes
        if (this.alphanumericRegex.test(value) && value.length <= 15) return true;
        
        // Patterns d'ID courants
        if (this.idPatternRegex.test(value) || this.transactionPatternRegex.test(value)) return true;
        
        // Valeurs avec des tirets ou underscores (format ID)
        if (/^[A-Z0-9_-]+$/.test(value) && value.length <= 20) return true;
        
        return false;
    }

    /**
     * Nettoie le cache des transformations
     */
    private clearCache(): void {
        this.transformationCache.clear();
    }

    /**
     * Teste le chevauchement après application d'une transformation
     */
    private testTransformationOverlap(boArray: string[], partnerArray: string[], transformation: any): number {
        if (!transformation) return 0;
        
        let matches = 0;
        const partnerSet = new Set(partnerArray);
        
        for (const boValue of boArray) {
            const transformedValue = this.applyTransformation(boValue, transformation);
            if (partnerSet.has(transformedValue)) {
                matches++;
            }
        }
        
        return boArray.length > 0 ? matches / boArray.length : 0;
    }

    /**
     * Applique une transformation à une valeur
     */
    private applyTransformation(value: string, transformation: any): string {
        if (!transformation || !value) return value;
        
        switch (transformation.type) {
            case 'case_transform':
                return value.toLowerCase();
            case 'format_transform':
                return value.replace(/\s/g, '').replace(/[-_]/g, '');
            default:
                return value;
        }
    }

    /**
     * Formate le résultat d'une transformation
     */
    private formatTransformationResult(type: string, result: any): any {
        if (Array.isArray(result)) {
            // Pour les suffixes/préfixes/patterns
            if (result.length > 0) {
                const pattern = result[0];
                return {
                    type: type === 'suffix' ? 'remove_suffix' : 
                          type === 'prefix' ? 'remove_prefix' : 'remove_pattern',
                    pattern: pattern,
                    description: `Supprimer le ${type} "${pattern}" des valeurs BO`
                };
            }
            return null;
        }
        
        // Pour les autres transformations qui retournent déjà un objet
        return result;
    }

    /**
     * Applique une transformation à un tableau de valeurs
     */
    private applyTransformationToArray(values: string[], transformation: any): string[] {
        return values.map(value => this.applyTransformation(value, transformation));
    }

    /**
     * Analyse la suppression de ponctuation
     */
    private analyzePunctuationRemoval(boArray: string[], partnerArray: string[]): {
        type: 'format_transform';
        pattern: string;
        description: string;
    } | null {
        let matchCount = 0;
        const partnerSet = new Set(partnerArray);
        
        for (const boValue of boArray) {
            const cleanedValue = boValue.replace(/[^a-zA-Z0-9]/g, '');
            if (partnerSet.has(cleanedValue)) {
                matchCount++;
            }
        }
        
        const score = matchCount / boArray.length;
        if (score > 0.1) {
            return {
                type: 'format_transform',
                pattern: 'remove_punctuation',
                description: `Supprimer toute la ponctuation et caractères spéciaux`
            };
        }
        
        return null;
    }

    /**
     * Analyse l'extraction de segments (ex: ABC-123-XYZ → 123)
     */
    private analyzeSegmentExtraction(boArray: string[], partnerArray: string[]): {
        type: 'format_transform';
        pattern: string;
        description: string;
    } | null {
        let matchCount = 0;
        const partnerSet = new Set(partnerArray);
        
        // Patterns d'extraction courants
        const extractionPatterns = [
            /[A-Z]+-(\d+)-[A-Z]+/, // ABC-123-XYZ → 123
            /[A-Z]+_(\d+)_[A-Z]+/, // ABC_123_XYZ → 123
            /(\d+)/, // Extraire tous les chiffres
            /[A-Z]+(\d+)/, // ABC123 → 123
            /(\d+)[A-Z]+/ // 123ABC → 123
        ];
        
        for (const boValue of boArray) {
            for (const pattern of extractionPatterns) {
                const match = boValue.match(pattern);
                if (match && match[1]) {
                    const extractedValue = match[1];
                    if (partnerSet.has(extractedValue)) {
                        matchCount++;
                        break; // Un seul match par valeur
                    }
                }
            }
        }
        
        const score = matchCount / boArray.length;
        if (score > 0.1) {
            return {
                type: 'format_transform',
                pattern: 'extract_segment',
                description: `Extraire des segments numériques ou alphanumériques`
            };
        }
        
        return null;
    }

    /**
     * Extrait le pattern d'une transformation
     */
    private getTransformationPattern(transformation: any): string {
        if (Array.isArray(transformation)) {
            return transformation.length > 0 ? transformation[0] : 'array';
        }
        if (typeof transformation === 'object' && transformation !== null) {
            if ('pattern' in transformation) return transformation.pattern;
            if ('type' in transformation) return transformation.type;
        }
        return 'unknown';
    }

    /**
     * Extrait la description d'une transformation
     */
    private getTransformationDescription(transformation: any): string {
        if (Array.isArray(transformation)) {
            return 'transformation array';
        }
        if (typeof transformation === 'object' && transformation !== null) {
            if ('description' in transformation) return transformation.description;
        }
        return 'transformation';
    }

    /**
     * Analyse les données et suggère les meilleures clés de réconciliation
     */
    analyzeAndSuggestKeys(boData: Record<string, string>[], partnerData: Record<string, string>[]): KeyAnalysisResult {
        this.log('info', '🔍 Début de l\'analyse des clés de réconciliation...');
        
        // Nettoyer le cache au début de chaque analyse
        this.clearCache();
        
        try {
            // Vérifications de sécurité
            if (!boData || !Array.isArray(boData) || boData.length === 0) {
                this.log('error', '❌ Données BO invalides ou vides');
                return {
                    suggestions: [],
                    overallConfidence: 0,
                    recommendedKeys: []
                };
            }
            
            if (!partnerData || !Array.isArray(partnerData) || partnerData.length === 0) {
                this.log('error', '❌ Données Partner invalides ou vides');
                return {
                    suggestions: [],
                    overallConfidence: 0,
                    recommendedKeys: []
                };
            }
            
            const suggestions: KeySuggestion[] = [];
            const boColumns = boData.length > 0 ? Object.keys(boData[0]) : [];
            const partnerColumns = partnerData.length > 0 ? Object.keys(partnerData[0]) : [];
            
            this.log('info', '📊 Colonnes BO:', boColumns);
            this.log('info', '📊 Colonnes Partner:', partnerColumns);
            
            // Vérifier que les colonnes sont valides
            if (boColumns.length === 0) {
                this.log('error', '❌ Aucune colonne trouvée dans les données BO');
                return {
                    suggestions: [],
                    overallConfidence: 0,
                    recommendedKeys: []
                };
            }
            
            if (partnerColumns.length === 0) {
                this.log('error', '❌ Aucune colonne trouvée dans les données Partner');
                return {
                    suggestions: [],
                    overallConfidence: 0,
                    recommendedKeys: []
                };
            }
            
            // Log des colonnes importantes
            const importantBoCols = boColumns.filter(col => 
                col.toLowerCase().includes('id') || 
                col.toLowerCase().includes('transaction') || 
                col.toLowerCase().includes('cle') ||
                col.toLowerCase().includes('montant')
            );
            const importantPartnerCols = partnerColumns.filter(col => 
                col.toLowerCase().includes('id') || 
                col.toLowerCase().includes('transaction') || 
                col.toLowerCase().includes('amount') ||
                col.toLowerCase().includes('external')
            );
            
            
            // Log détaillé de toutes les colonnes
            
            // Rechercher spécifiquement les colonnes IDTransaction et id
            const idTransactionCol = boColumns.find(col => col.toLowerCase().includes('idtransaction'));
            const idCol = partnerColumns.find(col => col.toLowerCase() === 'id');
            
            
            // Log des premières lignes de données pour debug
            if (boData.length > 0) {
            }
            if (partnerData.length > 0) {
            }
            
            // ANALYSE EXHAUSTIVE : Toutes les paires possibles de colonnes
            const allPairs: Array<[string, string]> = [];
            
            // Générer toutes les combinaisons possibles
            for (const boCol of boColumns) {
                for (const partnerCol of partnerColumns) {
                    allPairs.push([boCol, partnerCol]);
                }
            }
            
            this.log('info', `🔍 ANALYSE EXHAUSTIVE : ${allPairs.length} paires de colonnes à analyser`);
            this.log('info', `📊 Colonnes BO (${boColumns.length}):`, boColumns);
            this.log('info', `📊 Colonnes Partner (${partnerColumns.length}):`, partnerColumns);
            
            // Analyser TOUTES les paires sans discrimination
            let analyzedCount = 0;
            for (const [boCol, partnerCol] of allPairs) {
                try {
                    analyzedCount++;
                    this.log('info', `🔍 ANALYSE ${analyzedCount}/${allPairs.length}: "${boCol}" ↔ "${partnerCol}"`);
                    
                    const suggestion = this.analyzeColumnPair(boCol, partnerCol, boData, partnerData);
                    
                    // Seuil très permissif pour capturer toutes les correspondances potentielles
                    if (suggestion.confidence > 0.05) { // Seuil très bas pour l'analyse exhaustive
                        suggestions.push(suggestion);
                        this.log('info', `✅ Paire ajoutée: "${boCol}" ↔ "${partnerCol}" (confiance: ${suggestion.confidence.toFixed(3)})`);
                    } else {
                        this.log('debug', `❌ Paire rejetée: "${boCol}" ↔ "${partnerCol}" (confiance: ${suggestion.confidence.toFixed(3)})`);
                    }
                } catch (error) {
                    this.log('error', `❌ Erreur lors de l'analyse de la paire "${boCol}" ↔ "${partnerCol}":`, error);
                }
            }
            
            this.log('info', `✅ Analyse exhaustive terminée: ${suggestions.length} suggestions trouvées sur ${allPairs.length} paires analysées`);
            
            // Trier par confiance décroissante
            suggestions.sort((a, b) => b.confidence - a.confidence);
            
            // Prendre seulement les suggestions avec une confiance élevée (clés principales)
            const highConfidenceSuggestions = suggestions.filter(s => s.confidence > 0.5); // Seuil réduit pour debug
            const topSuggestions = highConfidenceSuggestions.slice(0, 5); // Plus de suggestions pour debug
            
            
            // Log détaillé des suggestions importantes
            const importantSuggestions = suggestions.filter(s => 
                s.boColumn.toLowerCase().includes('id') || s.partnerColumn.toLowerCase().includes('id') ||
                s.boColumn.toLowerCase().includes('transaction') || s.partnerColumn.toLowerCase().includes('transaction')
            );
            
            // Calculer la confiance globale
            const overallConfidence = topSuggestions.length > 0 
                ? topSuggestions.reduce((sum, s) => sum + s.confidence, 0) / topSuggestions.length 
                : 0;
            
            // Recommander les clés principales
            const recommendedKeys = topSuggestions
                .map(s => `${s.boColumn} ↔ ${s.partnerColumn}`);
            
            
            return {
                suggestions: topSuggestions,
                overallConfidence,
                recommendedKeys
            };
            
        } catch (error) {
            return {
                suggestions: [],
                overallConfidence: 0,
                recommendedKeys: []
            };
        }
    }

    /**
     * Analyse une paire de colonnes pour déterminer leur compatibilité
     */
    private analyzeColumnPair(
        boColumn: string, 
        partnerColumn: string, 
        boData: Record<string, string>[], 
        partnerData: Record<string, string>[]
    ): KeySuggestion {
        
        try {
            this.log('debug', `🔍 analyzeColumnPair: "${boColumn}" vs "${partnerColumn}"`);
            
            // Extraire les valeurs uniques des colonnes
            const boValues = this.getUniqueValues(boData, boColumn);
            const partnerValues = this.getUniqueValues(partnerData, partnerColumn);
            
            // Créer des échantillons optimisés pour l'analyse
            const boSample = this.createSample(boValues);
            const partnerSample = this.createSample(partnerValues);
            
            this.log('debug', `🔍 Échantillons optimisés "${boColumn}": ${boSample.length}/${boValues.size} valeurs`);
            this.log('debug', `🔍 Échantillons optimisés "${partnerColumn}": ${partnerSample.length}/${partnerValues.size} valeurs`);
            
            // Afficher plus d'échantillons pour le debug (10-20 valeurs)
            if (boSample.length > 0) {
                this.log('debug', `📊 Échantillon BO "${boColumn}":`, boSample.slice(0, 15));
            }
            if (partnerSample.length > 0) {
                this.log('debug', `📊 Échantillon Partner "${partnerColumn}":`, partnerSample.slice(0, 15));
            }
            
            // Log détaillé si les colonnes sont importantes
            if (boColumn.toLowerCase().includes('id') || partnerColumn.toLowerCase().includes('id') ||
                boColumn.toLowerCase().includes('transaction') || partnerColumn.toLowerCase().includes('transaction')) {
            }
            
            // Analyser les transformations possibles de manière exhaustive
            const transformation = this.analyzeTransformation(boValues, partnerValues);
            
            // Calculer différents scores de compatibilité
            const nameSimilarity = this.calculateNameSimilarity(boColumn, partnerColumn);
            const initialValueOverlap = this.calculateValueOverlap(boValues, partnerValues);
            const formatCompatibility = this.calculateFormatCompatibility(boValues, partnerValues);
            const uniquenessScore = this.calculateUniquenessScore(boValues, partnerValues, boData.length, partnerData.length);
            
            // Calculer le chevauchement final après transformation
            let finalValueOverlap = initialValueOverlap;
            let transformationImpact = 0;
            
            if (transformation && transformation.finalOverlap !== undefined) {
                finalValueOverlap = transformation.finalOverlap;
                transformationImpact = finalValueOverlap - initialValueOverlap;
                this.log('debug', `🔧 Impact de la transformation: ${(initialValueOverlap * 100).toFixed(1)}% → ${(finalValueOverlap * 100).toFixed(1)}% (+${(transformationImpact * 100).toFixed(1)}%)`);
            }
            
            // Calculer la confiance avec pondération du chevauchement post-transformation
            let confidence = (nameSimilarity * 0.25 + finalValueOverlap * 0.45 + formatCompatibility * 0.2 + uniquenessScore * 0.1);
            
            // Bonus dynamique pour les transformations basé sur leur impact
            if (transformation) {
                const transformationBonus = Math.min(0.5, transformationImpact * 2); // Bonus max 0.5, proportionnel à l'impact
                confidence += transformationBonus;
                
                // Bonus supplémentaire pour les transformations multi-étapes
                if (transformation.type === 'multi_step' && transformation.steps && transformation.steps.length > 1) {
                    confidence += 0.1 * transformation.steps.length; // 0.1 par étape
                }
                
                this.log('debug', `🔧 Transformation détectée: ${transformation.description} (bonus: +${transformationBonus.toFixed(3)})`);
            }
            
            // Bonus pour les colonnes importantes (ID, Transaction)
            if (this.isImportantColumn(boColumn) || this.isImportantColumn(partnerColumn)) {
                confidence += 0.1;
                this.log('debug', `🔧 Bonus pour colonne importante: "${boColumn}" ↔ "${partnerColumn}"`);
            }
            
            // Log détaillé pour debug
            this.log('debug', `📊 Scores pour "${boColumn}" ↔ "${partnerColumn}":`, {
                nameSimilarity: nameSimilarity.toFixed(2),
                initialValueOverlap: initialValueOverlap.toFixed(2),
                finalValueOverlap: finalValueOverlap.toFixed(2),
                formatCompatibility: formatCompatibility.toFixed(2),
                uniquenessScore: uniquenessScore.toFixed(2),
                transformation: transformation ? transformation.description : 'Aucune',
                confidence: confidence.toFixed(2)
            });
            
            // Générer la raison
            const reason = this.generateReason(nameSimilarity, finalValueOverlap, formatCompatibility, uniquenessScore, transformation);
            
            // Échantillon de valeurs communes
            const sampleValues = this.getSampleCommonValues(boValues, partnerValues);
            
            return {
                boColumn,
                partnerColumn,
                confidence,
                reason,
                sampleValues,
                transformation
            };
            
        } catch (error) {
            
            // Retourner une suggestion avec confiance minimale en cas d'erreur
            return {
                boColumn,
                partnerColumn,
                confidence: 0.1,
                reason: 'Erreur lors de l\'analyse',
                sampleValues: [],
                transformation: null
            };
        }
    }

    /**
     * Analyse les transformations possibles entre deux ensembles de valeurs avec chaînage multi-étapes
     */
    private analyzeTransformation(boValues: Set<string>, partnerValues: Set<string>): {
        type: 'remove_suffix' | 'remove_prefix' | 'remove_pattern' | 'case_transform' | 'format_transform' | 'multi_step';
        pattern: string;
        description: string;
        steps?: string[];
        finalOverlap?: number;
    } | null {
        if (boValues.size === 0 || partnerValues.size === 0) return null;
        
        // Utiliser l'échantillonnage optimisé
        const boArray = this.createSample(boValues);
        const partnerArray = this.createSample(partnerValues);
        
        this.log('debug', `🔧 ANALYSE EXHAUSTIVE des transformations pour ${boArray.length} valeurs BO vs ${partnerArray.length} valeurs Partner`);
        
        // Calculer le chevauchement initial
        const initialOverlap = this.calculateValueOverlap(boValues, partnerValues);
        this.log('debug', `📊 Chevauchement initial: ${(initialOverlap * 100).toFixed(1)}%`);
        
        let bestTransformation: any = null;
        let bestOverlap = initialOverlap;
        let bestSteps: string[] = [];
        
        // ANALYSE ITÉRATIVE : Tester toutes les transformations et leurs combinaisons
        const transformationTypes = [
            { name: 'case', fn: () => this.analyzeCaseTransformation(boArray, partnerArray) },
            { name: 'format', fn: () => this.analyzeFormatTransformation(boArray, partnerArray) },
            { name: 'numeric', fn: () => this.analyzeNumericTransformation(boArray, partnerArray) },
            { name: 'date', fn: () => this.analyzeDateTransformation(boArray, partnerArray) },
            { name: 'keyword', fn: () => this.analyzeKeywordTransformation(boArray, partnerArray) },
            { name: 'suffix', fn: () => this.findCommonSuffixes(boArray, partnerArray) },
            { name: 'prefix', fn: () => this.findCommonPrefixes(boArray, partnerArray) },
            { name: 'pattern', fn: () => this.findSpecificPatterns(boArray, partnerArray) },
            { name: 'punctuation', fn: () => this.analyzePunctuationRemoval(boArray, partnerArray) },
            { name: 'segment_extraction', fn: () => this.analyzeSegmentExtraction(boArray, partnerArray) },
            { name: 'multi_step', fn: () => this.analyzeMultiStepTransformation(boArray, partnerArray) }
        ];
        
        // Test de chaque transformation individuellement
        for (const transform of transformationTypes) {
            try {
                this.log('debug', `🔧 Test de transformation: ${transform.name}`);
                const result = transform.fn();
                
                if (result) {
                    const testOverlap = this.testTransformationOverlap(boArray, partnerArray, result);
                    this.log('debug', `📊 ${transform.name}: ${(testOverlap * 100).toFixed(1)}% (initial: ${(initialOverlap * 100).toFixed(1)}%)`);
                    
                    if (testOverlap > bestOverlap) {
                        bestOverlap = testOverlap;
                        bestTransformation = result;
                        bestSteps = [transform.name];
                        this.log('debug', `✅ ${transform.name} améliore le chevauchement: ${(bestOverlap * 100).toFixed(1)}%`);
                    }
                }
            } catch (error) {
                this.log('warn', `⚠️ Erreur lors du test ${transform.name}:`, error);
            }
        }
        
        // Test des combinaisons de transformations (approche itérative)
        if (bestTransformation) {
            this.log('debug', `🔄 Test des combinaisons à partir de: ${bestSteps.join(' → ')}`);
            
            // Appliquer la meilleure transformation et tester d'autres transformations
            const transformedBoArray = this.applyTransformationToArray(boArray, bestTransformation);
            const newPartnerArray = partnerArray; // Partner reste inchangé
            
            // Tester d'autres transformations sur les données déjà transformées
            for (const transform of transformationTypes) {
                if (!bestSteps.includes(transform.name)) { // Éviter les doublons
                    try {
                        const additionalResult = transform.fn();
                        if (additionalResult) {
                            const bestPattern = this.getTransformationPattern(bestTransformation);
                            const bestDesc = this.getTransformationDescription(bestTransformation);
                            const addPattern = this.getTransformationPattern(additionalResult);
                            const addDesc = this.getTransformationDescription(additionalResult);
                            
                            const combinedTransformation = {
                                type: 'multi_step' as const,
                                pattern: `${bestPattern} + ${addPattern}`,
                                description: `${bestDesc} puis ${addDesc}`,
                                steps: [...bestSteps, transform.name]
                            };
                            
                            const combinedOverlap = this.testTransformationOverlap(transformedBoArray, newPartnerArray, additionalResult);
                            this.log('debug', `📊 Combinaison ${bestSteps.join(' → ')} → ${transform.name}: ${(combinedOverlap * 100).toFixed(1)}%`);
                            
                            if (combinedOverlap > bestOverlap) {
                                bestOverlap = combinedOverlap;
                                bestTransformation = combinedTransformation;
                                bestSteps = [...bestSteps, transform.name];
                                this.log('debug', `✅ Combinaison améliore le chevauchement: ${(bestOverlap * 100).toFixed(1)}%`);
                            }
                        }
                    } catch (error) {
                        this.log('warn', `⚠️ Erreur lors du test de combinaison ${transform.name}:`, error);
                    }
                }
            }
        }
        
        // Retourner la meilleure transformation trouvée
        if (bestTransformation && bestOverlap > initialOverlap) {
            const finalResult = {
                ...bestTransformation,
                finalOverlap: bestOverlap,
                steps: bestSteps
            };
            
            this.log('debug', `🎯 Meilleure transformation: ${bestSteps.join(' → ')} (chevauchement: ${(bestOverlap * 100).toFixed(1)}%)`);
            return finalResult;
        }
        
        this.log('debug', `🔧 Aucune transformation améliorante détectée`);
        return null;
    }

    /**
     * Analyse les transformations par extraction de mots-clés
     */
    private analyzeKeywordTransformation(boArray: string[], partnerArray: string[]): {
        type: 'format_transform';
        pattern: string;
        description: string;
    } | null {
        let extractIdCount = 0;
        let extractTransactionCount = 0;
        let extractNumericCount = 0;
        
        for (const boValue of boArray) {
            // Extraire l'ID d'une valeur comme "IDTransaction123" → "123"
            const idMatch = boValue.match(/idtransaction(\d+)/i);
            if (idMatch && partnerArray.includes(idMatch[1])) {
                extractIdCount++;
            }
            
            // Extraire la transaction d'une valeur comme "TransactionABC" → "ABC"
            const transactionMatch = boValue.match(/transaction([a-zA-Z0-9]+)/i);
            if (transactionMatch && partnerArray.includes(transactionMatch[1])) {
                extractTransactionCount++;
            }
            
            // Extraire les chiffres d'une valeur
            const numericMatch = boValue.match(/(\d+)/);
            if (numericMatch && partnerArray.includes(numericMatch[1])) {
                extractNumericCount++;
            }
        }
        
        const total = boArray.length;
        const extractIdScore = extractIdCount / total;
        const extractTransactionScore = extractTransactionCount / total;
        const extractNumericScore = extractNumericCount / total;
        
        
        if (extractIdScore > 0.3) {
            return {
                type: 'format_transform',
                pattern: 'extract_id',
                description: `Extraire l'ID numérique (${(extractIdScore * 100).toFixed(0)}% des valeurs)`
            };
        }
        
        if (extractTransactionScore > 0.3) {
            return {
                type: 'format_transform',
                pattern: 'extract_transaction',
                description: `Extraire le code de transaction (${(extractTransactionScore * 100).toFixed(0)}% des valeurs)`
            };
        }
        
        if (extractNumericScore > 0.3) {
            return {
                type: 'format_transform',
                pattern: 'extract_numeric',
                description: `Extraire les chiffres (${(extractNumericScore * 100).toFixed(0)}% des valeurs)`
            };
        }
        
        return null;
    }

    /**
     * Analyse les transformations de casse (majuscules/minuscules)
     */
    private analyzeCaseTransformation(boArray: string[], partnerArray: string[]): {
        type: 'case_transform';
        pattern: string;
        description: string;
    } | null {
        let upperToLowerCount = 0;
        let lowerToUpperCount = 0;
        let normalizeCount = 0;
        
        for (const boValue of boArray) {
            const boUpper = boValue.toUpperCase();
            const boLower = boValue.toLowerCase();
            const boNormalized = boValue.toLowerCase().replace(/[^a-z0-9]/g, '');
            
            if (partnerArray.includes(boLower) && boValue !== boLower) {
                upperToLowerCount++;
            }
            if (partnerArray.includes(boUpper) && boValue !== boUpper) {
                lowerToUpperCount++;
            }
            if (partnerArray.some(p => p.toLowerCase().replace(/[^a-z0-9]/g, '') === boNormalized)) {
                normalizeCount++;
            }
        }
        
        const total = boArray.length;
        const upperToLowerScore = upperToLowerCount / total;
        const lowerToUpperScore = lowerToUpperCount / total;
        const normalizeScore = normalizeCount / total;
        
        
        if (upperToLowerScore > 0.3) {
            return {
                type: 'case_transform',
                pattern: 'to_lower',
                description: `Convertir en minuscules (${(upperToLowerScore * 100).toFixed(0)}% des valeurs)`
            };
        }
        
        if (lowerToUpperScore > 0.3) {
            return {
                type: 'case_transform',
                pattern: 'to_upper',
                description: `Convertir en majuscules (${(lowerToUpperScore * 100).toFixed(0)}% des valeurs)`
            };
        }
        
        if (normalizeScore > 0.3) {
            return {
                type: 'case_transform',
                pattern: 'normalize',
                description: `Normaliser (supprimer caractères spéciaux, ${(normalizeScore * 100).toFixed(0)}% des valeurs)`
            };
        }
        
        return null;
    }

    /**
     * Analyse les transformations de format (espaces, tirets, etc.)
     */
    private analyzeFormatTransformation(boArray: string[], partnerArray: string[]): {
        type: 'format_transform';
        pattern: string;
        description: string;
    } | null {
        let removeSpacesCount = 0;
        let addSpacesCount = 0;
        let removeDashesCount = 0;
        let addDashesCount = 0;
        let removeUnderscoresCount = 0;
        let addUnderscoresCount = 0;
        
        for (const boValue of boArray) {
            const withoutSpaces = boValue.replace(/\s+/g, '');
            const withSpaces = boValue.replace(/([A-Z])/g, ' $1').trim();
            const withoutDashes = boValue.replace(/-/g, '');
            const withDashes = boValue.replace(/([A-Z])/g, '-$1').replace(/^-/, '');
            const withoutUnderscores = boValue.replace(/_/g, '');
            const withUnderscores = boValue.replace(/([A-Z])/g, '_$1').replace(/^_/, '');
            
            if (partnerArray.includes(withoutSpaces) && boValue !== withoutSpaces) {
                removeSpacesCount++;
            }
            if (partnerArray.includes(withSpaces) && boValue !== withSpaces) {
                addSpacesCount++;
            }
            if (partnerArray.includes(withoutDashes) && boValue !== withoutDashes) {
                removeDashesCount++;
            }
            if (partnerArray.includes(withDashes) && boValue !== withDashes) {
                addDashesCount++;
            }
            if (partnerArray.includes(withoutUnderscores) && boValue !== withoutUnderscores) {
                removeUnderscoresCount++;
            }
            if (partnerArray.includes(withUnderscores) && boValue !== withUnderscores) {
                addUnderscoresCount++;
            }
        }
        
        const total = boArray.length;
        const scores = {
            removeSpaces: removeSpacesCount / total,
            addSpaces: addSpacesCount / total,
            removeDashes: removeDashesCount / total,
            addDashes: addDashesCount / total,
            removeUnderscores: removeUnderscoresCount / total,
            addUnderscores: addUnderscoresCount / total
        };
        
        
        // Trouver la meilleure transformation
        const bestTransform = Object.entries(scores).reduce((best, [key, score]) => 
            score > best.score ? { key, score } : best, { key: '', score: 0 }
        );
        
        if (bestTransform.score > 0.2) {
            const descriptions = {
                removeSpaces: 'Supprimer les espaces',
                addSpaces: 'Ajouter des espaces avant les majuscules',
                removeDashes: 'Supprimer les tirets',
                addDashes: 'Ajouter des tirets avant les majuscules',
                removeUnderscores: 'Supprimer les underscores',
                addUnderscores: 'Ajouter des underscores avant les majuscules'
            };
            
            return {
                type: 'format_transform',
                pattern: bestTransform.key,
                description: `${descriptions[bestTransform.key as keyof typeof descriptions]} (${(bestTransform.score * 100).toFixed(0)}% des valeurs)`
            };
        }
        
        return null;
    }

    /**
     * Trouve les suffixes communs qui améliorent la correspondance
     */
    private findCommonSuffixes(boArray: string[], partnerArray: string[]): string[] {
        const suffixes: { suffix: string; score: number }[] = [];
        const partnerSet = new Set(partnerArray); // Optimisation : Set pour lookup O(1)
        
        this.log('debug', `🔍 Recherche de suffixes dans ${boArray.length} valeurs BO`);
        
        // Analyser les suffixes de 1 à 10 caractères (réduit pour les performances)
        for (let length = 1; length <= 10; length++) {
            const suffixCount = new Map<string, number>();
            
            for (const boValue of boArray) {
                if (boValue.length > length) {
                    const suffix = boValue.slice(-length);
                    const withoutSuffix = boValue.slice(0, -length);
                    
                    // Vérifier si la valeur sans suffixe existe dans partner (optimisé avec Set)
                    if (partnerSet.has(withoutSuffix)) {
                        suffixCount.set(suffix, (suffixCount.get(suffix) || 0) + 1);
                    }
                }
            }
            
            // Calculer le score pour chaque suffixe
            for (const [suffix, count] of suffixCount) {
                const score = count / boArray.length;
                if (score > 0.1) { // Seuil plus élevé pour les performances
                    this.log('debug', `📊 Suffixe "${suffix}" (${length} chars): ${count}/${boArray.length} = ${(score * 100).toFixed(1)}%`);
                    suffixes.push({ suffix, score });
                }
            }
        }
        
        // Trier par score décroissant et retourner les meilleurs
        const sortedSuffixes = suffixes
            .sort((a, b) => b.score - a.score)
            .slice(0, 3); // Réduit pour les performances
        
        this.log('debug', `✅ Suffixes détectés:`, sortedSuffixes.map(s => `${s.suffix} (${(s.score * 100).toFixed(1)}%)`));
        
        return sortedSuffixes.map(s => s.suffix);
    }

    /**
     * Trouve les préfixes communs qui améliorent la correspondance
     */
    private findCommonPrefixes(boArray: string[], partnerArray: string[]): string[] {
        const prefixes: { prefix: string; score: number }[] = [];
        const partnerSet = new Set(partnerArray); // Optimisation : Set pour lookup O(1)
        
        this.log('debug', `🔍 Recherche de préfixes dans ${boArray.length} valeurs BO`);
        
        // Analyser les préfixes de 1 à 10 caractères (réduit pour les performances)
        for (let length = 1; length <= 10; length++) {
            const prefixCount = new Map<string, number>();
            
            for (const boValue of boArray) {
                if (boValue.length > length) {
                    const prefix = boValue.slice(0, length);
                    const withoutPrefix = boValue.slice(length);
                    
                    // Vérifier si la valeur sans préfixe existe dans partner (optimisé avec Set)
                    if (partnerSet.has(withoutPrefix)) {
                        prefixCount.set(prefix, (prefixCount.get(prefix) || 0) + 1);
                    }
                }
            }
            
            // Calculer le score pour chaque préfixe
            for (const [prefix, count] of prefixCount) {
                const score = count / boArray.length;
                if (score > 0.1) { // Seuil plus élevé pour les performances
                    this.log('debug', `📊 Préfixe "${prefix}" (${length} chars): ${count}/${boArray.length} = ${(score * 100).toFixed(1)}%`);
                    prefixes.push({ prefix, score });
                }
            }
        }
        
        // Trier par score décroissant et retourner les meilleurs
        const sortedPrefixes = prefixes
            .sort((a, b) => b.score - a.score)
            .slice(0, 3); // Réduit pour les performances
        
        this.log('debug', `✅ Préfixes détectés:`, sortedPrefixes.map(p => `${p.prefix} (${(p.score * 100).toFixed(1)}%)`));
        
        return sortedPrefixes.map(p => p.prefix);
    }

    /**
     * Trouve les patterns spécifiques (comme _CM, _FR, etc.)
     */
    private findSpecificPatterns(boArray: string[], partnerArray: string[]): string[] {
        const patterns: { pattern: string; score: number }[] = [];
        const partnerSet = new Set(partnerArray); // Optimisation : Set pour lookup O(1)
        
        // Patterns courants pré-compilés (optimisés pour les performances)
        const commonPatterns = [
            // Patterns de fin de chaîne (les plus courants en premier)
            /_[A-Z]{2}$/, // _CM, _FR, _US, etc.
            /_[A-Z]{3}$/, // _USA, _EUR, etc.
            /_[0-9]{2}$/, // _01, _02, etc.
            /_[A-Z0-9]{2,4}$/, // _CM1, _FR2, etc.
            
            // Patterns de début de chaîne
            /^[A-Z]{2}_/, // CM_, FR_, US_, etc.
            /^[A-Z]{3}_/, // USA_, EUR_, etc.
            /^[0-9]{2}_/, // 01_, 02_, etc.
            
            // Patterns de devise
            /_[A-Z]{3}$/, // _USD, _EUR, _XAF, etc.
            /^[A-Z]{3}_/, // USD_, EUR_, XAF_, etc.
        ];
        
        this.log('debug', `🔍 Recherche de patterns spécifiques dans ${boArray.length} valeurs BO`);
        
        for (const regex of commonPatterns) {
            const patternCount = new Map<string, number>();
            
            for (const boValue of boArray) {
                const match = boValue.match(regex);
                if (match) {
                    const pattern = match[0];
                    const withoutPattern = boValue.replace(regex, '');
                    
                    // Vérifier si la valeur sans pattern existe dans partner (optimisé avec Set)
                    if (partnerSet.has(withoutPattern)) {
                        patternCount.set(pattern, (patternCount.get(pattern) || 0) + 1);
                        this.log('debug', `🔍 Pattern trouvé: "${boValue}" → "${withoutPattern}" (pattern: "${pattern}")`);
                    }
                }
            }
            
            // Calculer le score pour chaque pattern
            for (const [pattern, count] of patternCount) {
                const score = count / boArray.length;
                if (score > 0.1) { // Seuil plus élevé pour les performances
                    this.log('debug', `📊 Pattern "${pattern}": ${count}/${boArray.length} = ${(score * 100).toFixed(1)}%`);
                    patterns.push({ pattern, score });
                }
            }
        }
        
        // Trier par score décroissant et retourner les meilleurs
        const sortedPatterns = patterns
            .sort((a, b) => b.score - a.score)
            .slice(0, 3); // Réduit pour les performances
        
        this.log('debug', `✅ Patterns détectés:`, sortedPatterns.map(p => `${p.pattern} (${(p.score * 100).toFixed(1)}%)`));
        
        return sortedPatterns.map(p => p.pattern);
    }

    /**
     * Calcule la similarité des noms de colonnes avec enrichissement sémantique
     */
    private calculateNameSimilarity(boColumn: string, partnerColumn: string): number {
        const boLower = boColumn.toLowerCase();
        const partnerLower = partnerColumn.toLowerCase();
        
        
        // Correspondances exactes ou très similaires
        if (boLower === partnerLower) return 1.0;
        
        // Correspondances exactes avec mots-clés importants
        if (boLower.includes('cle') && partnerLower.includes('cle')) return 0.95;
        if (boLower.includes('id') && partnerLower.includes('id')) return 0.9;
        if (boLower.includes('transaction') && partnerLower.includes('transaction')) return 0.9;
        if (boLower.includes('montant') && partnerLower.includes('montant')) return 0.9;
        if (boLower.includes('amount') && partnerLower.includes('amount')) return 0.9;
        if (boLower.includes('telephone') && partnerLower.includes('telephone')) return 0.9;
        if (boLower.includes('phone') && partnerLower.includes('phone')) return 0.9;
        if (boLower.includes('date') && partnerLower.includes('date')) return 0.8;
        if (boLower.includes('operation') && partnerLower.includes('operation')) return 0.8;
        if (boLower.includes('external') && partnerLower.includes('external')) return 0.8;
        if (boLower.includes('reference') && partnerLower.includes('reference')) return 0.8;
        if (boLower.includes('currency') && partnerLower.includes('currency')) return 0.8;
        if (boLower.includes('devise') && partnerLower.includes('devise')) return 0.8;
        if (boLower.includes('canal') && partnerLower.includes('canal')) return 0.8;
        if (boLower.includes('channel') && partnerLower.includes('channel')) return 0.8;
        
        // Correspondances partielles avec mots-clés (AMÉLIORÉ)
        if (boLower.includes('id') || partnerLower.includes('id')) {
            // Bonus si les deux contiennent 'id' ou si l'un contient 'id' et l'autre 'transaction'
            if ((boLower.includes('id') && partnerLower.includes('id')) ||
                (boLower.includes('id') && partnerLower.includes('transaction')) ||
                (boLower.includes('transaction') && partnerLower.includes('id'))) {
                return 0.85; // Score plus élevé pour IDTransaction ↔ id
            }
            return 0.7;
        }
        
        if (boLower.includes('ref') || partnerLower.includes('ref')) return 0.7;
        if (boLower.includes('num') || partnerLower.includes('num')) return 0.6;
        if (boLower.includes('code') || partnerLower.includes('code')) return 0.6;
        if (boLower.includes('key') || partnerLower.includes('key')) return 0.6;
        if (boLower.includes('cle') || partnerLower.includes('cle')) return 0.6;
        
        // Correspondances sémantiques
        if ((boLower.includes('montant') || boLower.includes('amount')) && 
            (partnerLower.includes('montant') || partnerLower.includes('amount'))) return 0.8;
        if ((boLower.includes('telephone') || boLower.includes('phone')) && 
            (partnerLower.includes('telephone') || partnerLower.includes('phone'))) return 0.8;
        if ((boLower.includes('devise') || boLower.includes('currency')) && 
            (partnerLower.includes('devise') || partnerLower.includes('currency'))) return 0.8;
        if ((boLower.includes('canal') || boLower.includes('channel')) && 
            (partnerLower.includes('canal') || partnerLower.includes('channel'))) return 0.8;
        
        // Correspondances par similarité de chaîne (distance de Levenshtein simplifiée)
        const similarity = this.calculateStringSimilarity(boLower, partnerLower);
        if (similarity > 0.7) return similarity;
        
        // Correspondances par mots-clés extraits avec enrichissement sémantique
        const boWords = this.extractKeywords(boLower);
        const partnerWords = this.extractKeywords(partnerLower);
        const commonWords = boWords.filter(word => partnerWords.includes(word));
        
        if (commonWords.length > 0) {
            return 0.6 + (commonWords.length * 0.1); // Score basé sur le nombre de mots communs
        }
        
        // Analyse sémantique avec synonymes
        const semanticScore = this.calculateSemanticSimilarity(boLower, partnerLower);
        if (semanticScore > 0.5) return semanticScore;
        
        return 0.1;
    }

    /**
     * Extrait les mots-clés d'un nom de colonne avec tokenisation avancée
     */
    private extractKeywords(columnName: string): string[] {
        // Diviser par espaces, tirets, underscores, et camelCase
        const words = columnName
            .split(/[\s\-_]+/) // Diviser par espaces, tirets, underscores
            .join(' ')
            .replace(/([A-Z])/g, ' $1') // Diviser camelCase
            .toLowerCase()
            .split(/\s+/)
            .filter(word => word.length > 1) // Filtrer les mots trop courts
            .filter(word => !['de', 'du', 'la', 'le', 'et', 'ou', 'avec', 'sans'].includes(word)); // Filtrer les mots vides
        
        return [...new Set(words)]; // Supprimer les doublons
    }

    /**
     * Calcule la similarité sémantique avec synonymes et lexique métier
     */
    private calculateSemanticSimilarity(boColumn: string, partnerColumn: string): number {
        // Map de synonymes métier
        const synonyms = {
            // Identifiants
            'id': ['identifiant', 'identifier', 'num', 'numero', 'number', 'ref', 'reference', 'cle', 'key'],
            'transaction': ['transaction', 'trx', 'operation', 'op', 'commande', 'order', 'paiement', 'payment'],
            'client': ['client', 'customer', 'utilisateur', 'user', 'beneficiaire', 'beneficiary'],
            
            // Montants
            'montant': ['montant', 'amount', 'valeur', 'value', 'somme', 'sum', 'prix', 'price'],
            'devise': ['devise', 'currency', 'monnaie', 'money'],
            
            // Dates
            'date': ['date', 'jour', 'day', 'heure', 'time', 'timestamp'],
            
            // Références
            'reference': ['reference', 'ref', 'numero', 'number', 'code', 'identifiant', 'id'],
            
            // Statuts
            'statut': ['statut', 'status', 'etat', 'state', 'situation'],
            
            // Canaux
            'canal': ['canal', 'channel', 'voie', 'way', 'methode', 'method'],
            
            // Téléphone
            'telephone': ['telephone', 'phone', 'tel', 'mobile', 'portable'],
            
            // Email
            'email': ['email', 'mail', 'courriel', 'adresse', 'address']
        };

        // Normaliser les colonnes
        const boNormalized = this.normalizeColumnName(boColumn);
        const partnerNormalized = this.normalizeColumnName(partnerColumn);

        // Vérifier les correspondances directes
        if (boNormalized === partnerNormalized) return 0.9;

        // Vérifier les correspondances par synonymes
        for (const [key, synonymList] of Object.entries(synonyms)) {
            const boHasKey = boNormalized.includes(key) || synonymList.some(syn => boNormalized.includes(syn));
            const partnerHasKey = partnerNormalized.includes(key) || synonymList.some(syn => partnerNormalized.includes(syn));
            
            if (boHasKey && partnerHasKey) {
                return 0.8;
            }
        }

        // Vérifier les correspondances partielles
        const boWords = this.extractKeywords(boNormalized);
        const partnerWords = this.extractKeywords(partnerNormalized);
        
        let semanticMatches = 0;
        for (const boWord of boWords) {
            for (const [key, synonymList] of Object.entries(synonyms)) {
                if (synonymList.includes(boWord) || boWord === key) {
                    if (partnerWords.some(pWord => synonymList.includes(pWord) || pWord === key)) {
                        semanticMatches++;
                        break;
                    }
                }
            }
        }

        if (semanticMatches > 0) {
            const score = Math.min(0.7, 0.5 + (semanticMatches * 0.1));
            return score;
        }

        return 0.0;
    }

    /**
     * Normalise un nom de colonne pour l'analyse sémantique
     */
    private normalizeColumnName(columnName: string): string {
        return columnName
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ') // Remplacer caractères spéciaux par espaces
            .replace(/\s+/g, ' ') // Normaliser les espaces
            .trim();
    }

    /**
     * Calcule la similarité entre deux chaînes (distance de Levenshtein simplifiée)
     */
    private calculateStringSimilarity(str1: string, str2: string): number {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const distance = this.levenshteinDistance(longer, shorter);
        return (longer.length - distance) / longer.length;
    }

    /**
     * Calcule la distance de Levenshtein entre deux chaînes
     */
    private levenshteinDistance(str1: string, str2: string): number {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    /**
     * Calcule le chevauchement des valeurs
     */
    private calculateValueOverlap(boValues: Set<string>, partnerValues: Set<string>): number {
        if (boValues.size === 0 || partnerValues.size === 0) return 0;
        
        const intersection = new Set([...boValues].filter(x => partnerValues.has(x)));
        const union = new Set([...boValues, ...partnerValues]);
        
        return intersection.size / union.size;
    }

    /**
     * Calcule la compatibilité des formats
     */
    private calculateFormatCompatibility(boValues: Set<string>, partnerValues: Set<string>): number {
        const boFormats = this.analyzeFormats(Array.from(boValues));
        const partnerFormats = this.analyzeFormats(Array.from(partnerValues));
        
        // Vérifier si les formats sont compatibles
        if (boFormats.isNumeric && partnerFormats.isNumeric) return 0.9;
        if (boFormats.isDate && partnerFormats.isDate) return 0.9;
        if (boFormats.isPhone && partnerFormats.isPhone) return 0.8;
        if (boFormats.isAlphanumeric && partnerFormats.isAlphanumeric) return 0.7;
        
        return 0.3;
    }

    /**
     * Calcule le score d'unicité
     */
    private calculateUniquenessScore(boValues: Set<string>, partnerValues: Set<string>, boTotal: number, partnerTotal: number): number {
        const boUniqueness = boValues.size / boTotal;
        const partnerUniqueness = partnerValues.size / partnerTotal;
        
        // Plus les valeurs sont uniques, mieux c'est pour une clé
        return (boUniqueness + partnerUniqueness) / 2;
    }

    /**
     * Analyse les formats des valeurs
     */
    private analyzeFormats(values: string[]): {
        isNumeric: boolean;
        isDate: boolean;
        isPhone: boolean;
        isAlphanumeric: boolean;
    } {
        const numericCount = values.filter(v => /^\d+$/.test(v)).length;
        const dateCount = values.filter(v => /^\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/.test(v)).length;
        const phoneCount = values.filter(v => /^\d{9,15}$/.test(v)).length;
        const alphanumericCount = values.filter(v => /^[a-zA-Z0-9]+$/.test(v)).length;
        
        const total = values.length;
        
        return {
            isNumeric: numericCount / total > 0.8,
            isDate: dateCount / total > 0.5,
            isPhone: phoneCount / total > 0.7,
            isAlphanumeric: alphanumericCount / total > 0.8
        };
    }

    /**
     * Génère une raison pour la suggestion
     */
    private generateReason(
        nameSimilarity: number, 
        valueOverlap: number, 
        formatCompatibility: number, 
        uniquenessScore: number,
        transformation?: { type: string; pattern: string; description: string; steps?: string[]; finalOverlap?: number } | null
    ): string {
        const reasons: string[] = [];
        
        if (nameSimilarity > 0.8) reasons.push('Noms de colonnes très similaires');
        if (valueOverlap > 0.3) reasons.push('Valeurs communes détectées');
        if (formatCompatibility > 0.7) reasons.push('Formats compatibles');
        if (uniquenessScore > 0.8) reasons.push('Valeurs très uniques');
        
        if (transformation) {
            if (transformation.type === 'multi_step' && transformation.steps && transformation.steps.length > 1) {
                reasons.push(`Transformation multi-étapes: ${transformation.steps.join(' → ')}`);
                if (transformation.finalOverlap !== undefined) {
                    reasons.push(`Chevauchement amélioré: ${(transformation.finalOverlap * 100).toFixed(1)}%`);
                }
            } else {
                reasons.push(transformation.description);
            }
        }
        
        if (reasons.length === 0) return 'Correspondance faible';
        
        return reasons.join(', ');
    }

    /**
     * Obtient les valeurs uniques d'une colonne
     */
    private getUniqueValues(data: Record<string, string>[], column: string): Set<string> {
        this.log('debug', `🔍 getUniqueValues appelé pour la colonne "${column}" avec ${data.length} enregistrements`);
        
        if (!data || data.length === 0) {
            this.log('warn', `⚠️ Données vides pour la colonne "${column}"`);
            return new Set<string>();
        }
        
        if (!column || column.trim() === '') {
            this.log('warn', `⚠️ Nom de colonne invalide: "${column}"`);
            return new Set<string>();
        }
        
        try {
            // Vérification rapide de la présence de la colonne
            const firstRow = data[0];
            if (!firstRow || !(column in firstRow)) {
                this.log('warn', `⚠️ Colonne "${column}" non trouvée dans les données`);
                return new Set<string>();
            }
            
            const uniqueValues = new Set<string>();
            
            // Optimisation : traitement direct sans tableau intermédiaire
            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                
                if (!row || typeof row !== 'object') {
                    continue;
                }
                
                const value = row[column];
                
                // Optimisation : éviter les conversions inutiles
                if (value !== undefined && value !== null) {
                    const trimmedValue = typeof value === 'string' ? value.trim() : String(value).trim();
                    if (trimmedValue !== '') {
                        uniqueValues.add(trimmedValue);
                    }
                }
            }
            
            this.log('debug', `✅ getUniqueValues terminé pour "${column}": ${uniqueValues.size} valeurs uniques`);
            
            return uniqueValues;
            
        } catch (error) {
            this.log('error', `❌ Erreur dans getUniqueValues pour la colonne "${column}":`, error);
            return new Set<string>();
        }
    }

    /**
     * Obtient un échantillon de valeurs communes
     */
    private getSampleCommonValues(boValues: Set<string>, partnerValues: Set<string>): string[] {
        const common = Array.from(boValues).filter(v => partnerValues.has(v));
        return common.slice(0, 3); // Retourner max 3 exemples
    }

    /**
     * Analyse les transformations numériques (zéros initiaux, formatage, etc.)
     */
    private analyzeNumericTransformation(boArray: string[], partnerArray: string[]): {
        type: 'format_transform';
        pattern: string;
        description: string;
    } | null {
        let removeLeadingZerosCount = 0;
        let removeThousandSeparatorsCount = 0;
        let normalizeDecimalsCount = 0;
        
        for (const boValue of boArray) {
            // Suppression des zéros initiaux
            const withoutLeadingZeros = boValue.replace(/^0+/, '');
            if (withoutLeadingZeros && partnerArray.includes(withoutLeadingZeros)) {
                removeLeadingZerosCount++;
            }
            
            // Suppression des séparateurs de milliers
            const withoutSeparators = boValue.replace(/[,.\s]/g, '');
            if (withoutSeparators !== boValue && partnerArray.includes(withoutSeparators)) {
                removeThousandSeparatorsCount++;
            }
            
            // Normalisation des décimales (virgule -> point)
            const normalizedDecimals = boValue.replace(',', '.');
            if (normalizedDecimals !== boValue && partnerArray.includes(normalizedDecimals)) {
                normalizeDecimalsCount++;
            }
        }
        
        const total = boArray.length;
        const scores = {
            removeLeadingZeros: removeLeadingZerosCount / total,
            removeThousandSeparators: removeThousandSeparatorsCount / total,
            normalizeDecimals: normalizeDecimalsCount / total
        };
        
        
        const bestTransform = Object.entries(scores).reduce((best, [key, score]) => 
            score > best.score ? { key, score } : best, { key: '', score: 0 }
        );
        
        if (bestTransform.score > 0.3) {
            const descriptions = {
                removeLeadingZeros: 'Supprimer les zéros initiaux',
                removeThousandSeparators: 'Supprimer les séparateurs de milliers',
                normalizeDecimals: 'Normaliser les décimales (virgule → point)'
            };
            
            return {
                type: 'format_transform',
                pattern: bestTransform.key,
                description: `${descriptions[bestTransform.key as keyof typeof descriptions]} (${(bestTransform.score * 100).toFixed(0)}% des valeurs)`
            };
        }
        
        return null;
    }

    /**
     * Analyse les transformations de dates
     */
    private analyzeDateTransformation(boArray: string[], partnerArray: string[]): {
        type: 'format_transform';
        pattern: string;
        description: string;
    } | null {
        let ddMMYYYYtoYYYYMMDDCount = 0;
        let YYYYMMDDtoDDMMYYYYCount = 0;
        let removeTimeCount = 0;
        
        for (const boValue of boArray) {
            // DD/MM/YYYY → YYYY-MM-DD
            const ddMMMatch = boValue.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
            if (ddMMMatch) {
                const yyyyMMDD = `${ddMMMatch[3]}-${ddMMMatch[2]}-${ddMMMatch[1]}`;
                if (partnerArray.includes(yyyyMMDD)) {
                    ddMMYYYYtoYYYYMMDDCount++;
                }
            }
            
            // YYYY-MM-DD → DD/MM/YYYY
            const yyyyMMMatch = boValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (yyyyMMMatch) {
                const ddMMYYYY = `${yyyyMMMatch[3]}/${yyyyMMMatch[2]}/${yyyyMMMatch[1]}`;
                if (partnerArray.includes(ddMMYYYY)) {
                    YYYYMMDDtoDDMMYYYYCount++;
                }
            }
            
            // Suppression de l'heure
            const withoutTime = boValue.replace(/\s+\d{2}:\d{2}:\d{2}/, '');
            if (withoutTime !== boValue && partnerArray.includes(withoutTime)) {
                removeTimeCount++;
            }
        }
        
        const total = boArray.length;
        const scores = {
            ddMMYYYYtoYYYYMMDD: ddMMYYYYtoYYYYMMDDCount / total,
            YYYYMMDDtoDDMMYYYY: YYYYMMDDtoDDMMYYYYCount / total,
            removeTime: removeTimeCount / total
        };
        
        
        const bestTransform = Object.entries(scores).reduce((best, [key, score]) => 
            score > best.score ? { key, score } : best, { key: '', score: 0 }
        );
        
        if (bestTransform.score > 0.3) {
            const descriptions = {
                ddMMYYYYtoYYYYMMDD: 'Convertir DD/MM/YYYY → YYYY-MM-DD',
                YYYYMMDDtoDDMMYYYY: 'Convertir YYYY-MM-DD → DD/MM/YYYY',
                removeTime: 'Supprimer l\'heure'
            };
            
            return {
                type: 'format_transform',
                pattern: bestTransform.key,
                description: `${descriptions[bestTransform.key as keyof typeof descriptions]} (${(bestTransform.score * 100).toFixed(0)}% des valeurs)`
            };
        }
        
        return null;
    }

    /**
     * Analyse les transformations multi-étapes complexes
     */
    private analyzeMultiStepTransformation(boArray: string[], partnerArray: string[]): {
        type: 'multi_step';
        pattern: string;
        description: string;
    } | null {
        // Test de combinaisons de transformations
        const transformations = [
            {
                name: 'lowercase_remove_special',
                transform: (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
            },
            {
                name: 'remove_prefix_lowercase',
                transform: (value: string) => {
                    // Essayer de supprimer des préfixes courants puis mettre en minuscules
                    const withoutPrefix = value.replace(/^(id|ref|num|code|trx|cmd|ord)_?/i, '');
                    return withoutPrefix.toLowerCase();
                }
            },
            {
                name: 'remove_suffix_lowercase',
                transform: (value: string) => {
                    // Essayer de supprimer des suffixes courants puis mettre en minuscules
                    const withoutSuffix = value.replace(/_?(eur|usd|cm|fr|us|uk|01|02|03)$/i, '');
                    return withoutSuffix.toLowerCase();
                }
            },
            {
                name: 'extract_numeric_clean',
                transform: (value: string) => {
                    // Extraire les chiffres et nettoyer
                    const numeric = value.replace(/[^0-9]/g, '');
                    return numeric.replace(/^0+/, ''); // Supprimer les zéros initiaux
                }
            }
        ];
        
        let bestTransform = null;
        let bestScore = 0;
        
        for (const transform of transformations) {
            let matchCount = 0;
            
            for (const boValue of boArray) {
                const transformed = transform.transform(boValue);
                if (transformed && partnerArray.includes(transformed)) {
                    matchCount++;
                }
            }
            
            const score = matchCount / boArray.length;
            if (score > bestScore && score > 0.3) {
                bestScore = score;
                bestTransform = transform;
            }
        }
        
        if (bestTransform) {
            return {
                type: 'multi_step',
                pattern: bestTransform.name,
                description: `Transformation multi-étapes: ${bestTransform.name} (${(bestScore * 100).toFixed(0)}% des valeurs)`
            };
        }
        
        return null;
    }

    /**
     * Calcule le chevauchement amélioré après application d'une transformation
     */
    private calculateImprovedValueOverlap(boValues: Set<string>, partnerValues: Set<string>, transformation: any): number {
        if (boValues.size === 0 || partnerValues.size === 0) return 0;
        
        const boArray = Array.from(boValues);
        const partnerArray = Array.from(partnerValues);
        
        let transformedMatches = 0;
        
        for (const boValue of boArray) {
            let transformedValue = boValue;
            
            // Appliquer la transformation selon le type
            switch (transformation.pattern) {
                case 'lowercase_remove_special':
                    transformedValue = boValue.toLowerCase().replace(/[^a-z0-9]/g, '');
                    break;
                case 'remove_prefix_lowercase':
                    transformedValue = boValue.replace(/^(id|ref|num|code|trx|cmd|ord)_?/i, '').toLowerCase();
                    break;
                case 'remove_suffix_lowercase':
                    transformedValue = boValue.replace(/_?(eur|usd|cm|fr|us|uk|01|02|03)$/i, '').toLowerCase();
                    break;
                case 'extract_numeric_clean':
                    transformedValue = boValue.replace(/[^0-9]/g, '').replace(/^0+/, '');
                    break;
                default:
                    transformedValue = boValue;
            }
            
            if (transformedValue && partnerArray.includes(transformedValue)) {
                transformedMatches++;
            }
        }
        
        const intersection = transformedMatches;
        const union = boArray.length + partnerArray.length - intersection;
        
        return union > 0 ? intersection / union : 0;
    }

    /**
     * Détermine si une colonne est importante (ID, Transaction, etc.)
     */
    private isImportantColumn(columnName: string): boolean {
        const lowerColumn = columnName.toLowerCase();
        const importantKeywords = ['id', 'transaction', 'cle', 'key', 'reference', 'ref', 'numero', 'number'];
        
        return importantKeywords.some(keyword => lowerColumn.includes(keyword));
    }
}
