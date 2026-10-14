package com.reconciliation.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class KeyDiscoveryService {

    // Pondération des scores (adaptée du mode assisté)
    private static final double CONTENT_SCORE_WEIGHT = 0.40; // 40% - Score basé sur le contenu
    private static final double UNIQUENESS_SCORE_WEIGHT = 0.10; // 10% - Ratio d'unicité
    private static final double NAME_SIMILARITY_WEIGHT = 0.30; // 30% - Similarité du nom
    private static final double FORMAT_COMPATIBILITY_WEIGHT = 0.20; // 20% - Compatibilité des formats

    /**
     * Découvre automatiquement les meilleures clés de réconciliation entre deux ensembles de données
     */
    public KeyDiscoveryResult discoverKeys(List<Map<String, String>> boData, List<Map<String, String>> partnerData) {
        log.info("🔍 Début de la découverte automatique des clés de réconciliation");
        log.info("📊 Données BO: {} enregistrements", boData.size());
        log.info("📊 Données Partenaire: {} enregistrements", partnerData.size());

        // Extraire les colonnes des deux ensembles de données
        Set<String> boColumns = boData.isEmpty() ? new HashSet<>() : boData.get(0).keySet();
        Set<String> partnerColumns = partnerData.isEmpty() ? new HashSet<>() : partnerData.get(0).keySet();

        log.info("🔑 Colonnes BO: {}", boColumns);
        log.info("🔑 Colonnes Partenaire: {}", partnerColumns);

        // Analyser les correspondances avec analyse de contenu
        List<ColumnMatch> columnMatches = analyzeColumnMatchesWithContent(boData, partnerData);
        
        // Analyser la qualité des données pour chaque correspondance
        List<KeyCandidate> keyCandidates = analyzeDataQuality(boData, partnerData, columnMatches);
        
        // Sélectionner les meilleures clés
        KeyDiscoveryResult result = selectBestKeys(keyCandidates);
        
        log.info("✅ Découverte terminée - Meilleures clés: {}", result);
        return result;
    }

    /**
     * Découvre la meilleure colonne clé pour un seul côté (BO ou partenaire).
     * Retourne la colonne BO si `side` vaut "bo", sinon la colonne partenaire,
     * en utilisant le meilleur candidat détecté entre les deux datasets.
     */
    public String discoverBestKey(
        List<Map<String, String>> boData,
        List<Map<String, String>> partnerData,
        String side
    ) {
        KeyDiscoveryResult result = discoverKeys(boData, partnerData);
        if (result.candidates == null || result.candidates.isEmpty()) {
            return null;
        }
        KeyCandidate top = result.candidates.get(0);
        boolean isBo = "bo".equalsIgnoreCase(side) || "boOnly".equalsIgnoreCase(side);
        return isBo ? top.boColumn : top.partnerColumn;
    }

    /**
     * Analyse les correspondances potentielles avec analyse de contenu
     */
    private List<ColumnMatch> analyzeColumnMatchesWithContent(List<Map<String, String>> boData, List<Map<String, String>> partnerData) {
        List<ColumnMatch> matches = new ArrayList<>();
        
        Set<String> boColumns = boData.isEmpty() ? new HashSet<>() : boData.get(0).keySet();
        Set<String> partnerColumns = partnerData.isEmpty() ? new HashSet<>() : partnerData.get(0).keySet();
        
        for (String boColumn : boColumns) {
            for (String partnerColumn : partnerColumns) {
                // Score de similarité du nom (15% du score final)
                double nameSimilarity = calculateColumnSimilarity(boColumn, partnerColumn);
                
                // Score de contenu (60% du score final)
                ContentAnalysisResult contentAnalysis = analyzeContentMatch(boData, partnerData, boColumn, partnerColumn);
                
                // Score d'unicité (25% du score final)
                double uniquenessScore = calculateUniquenessScore(boData, partnerData, boColumn, partnerColumn);
                
                // Score de compatibilité des formats
                double formatCompatibility = calculateFormatCompatibility(boData, partnerData, boColumn, partnerColumn);
                
                // Score global pondéré (adapté du mode assisté)
                double overallScore = (nameSimilarity * NAME_SIMILARITY_WEIGHT) +
                                    (contentAnalysis.confidence * CONTENT_SCORE_WEIGHT) +
                                    (uniquenessScore * UNIQUENESS_SCORE_WEIGHT) +
                                    (formatCompatibility * FORMAT_COMPATIBILITY_WEIGHT);
                
                // Log détaillé pour toutes les colonnes
                log.info("🔍 Analyse: {} ↔ {} (nom: {}, contenu: {}, unicité: {}, global: {})", 
                    boColumn, partnerColumn, String.format("%.3f", nameSimilarity), String.format("%.3f", contentAnalysis.confidence), String.format("%.3f", uniquenessScore), String.format("%.3f", overallScore));
                
                if (overallScore > 0.05) { // Seuil minimum de score global (très réduit pour debug)
                    matches.add(new ColumnMatch(boColumn, partnerColumn, overallScore, contentAnalysis));
                    log.info("✅ Correspondance trouvée: {} ↔ {} (score: {})", boColumn, partnerColumn, String.format("%.3f", overallScore));
                }
            }
        }
        
        // Trier par score global décroissant
        matches.sort((a, b) -> Double.compare(b.similarity, a.similarity));
        
        log.info("🔍 Correspondances trouvées: {}", matches);
        
        // Log détaillé des meilleures correspondances
        if (!matches.isEmpty()) {
            log.info("🏆 Top 3 correspondances:");
            for (int i = 0; i < Math.min(3, matches.size()); i++) {
                ColumnMatch match = matches.get(i);
                log.info("  {}. {} ↔ {} (score: {}, confiance: {})", 
                    i + 1, match.boColumn, match.partnerColumn, String.format("%.2f", match.similarity), String.format("%.2f", match.contentAnalysis.confidence));
                log.info("     Traitements: {}", match.contentAnalysis.appliedTreatments);
                log.info("     Raison: {}", match.contentAnalysis.reason);
            }
        }
        
        return matches;
    }

    /**
     * Analyse la correspondance de contenu entre deux colonnes avec tests de traitements
     */
    private ContentAnalysisResult analyzeContentMatch(List<Map<String, String>> boData, List<Map<String, String>> partnerData, 
                                                    String boColumn, String partnerColumn) {
        if (boData.isEmpty() || partnerData.isEmpty()) {
            return new ContentAnalysisResult(0.0, new ArrayList<>(), "Données vides");
        }

        // Extraire les valeurs des colonnes
        List<String> boValues = boData.stream()
                .map(row -> row.get(boColumn))
                .filter(Objects::nonNull)
                .filter(val -> !val.trim().isEmpty())
                .collect(Collectors.toList());
                
        List<String> partnerValues = partnerData.stream()
                .map(row -> row.get(partnerColumn))
                .filter(Objects::nonNull)
                .filter(val -> !val.trim().isEmpty())
                .collect(Collectors.toList());

        if (boValues.isEmpty() || partnerValues.isEmpty()) {
            return new ContentAnalysisResult(0.0, new ArrayList<>(), "Colonnes vides");
        }

        // Prendre un échantillon de 100 valeurs uniques de la colonne BO
        Set<String> boSample = boValues.stream()
                .distinct()
                .limit(100)
                .collect(Collectors.toSet());

        // Tester différents traitements
        List<DataTreatment> treatments = Arrays.asList(
            new DataTreatment("none", val -> val),
            new DataTreatment("trim", String::trim),
            new DataTreatment("toLowerCase", String::toLowerCase),
            new DataTreatment("trim+toLowerCase", val -> val.trim().toLowerCase()),
            new DataTreatment("removeSpecialChars", this::removeSpecialChars),
            new DataTreatment("normalizeNumbers", this::normalizeNumbers),
            new DataTreatment("removeSuffix_CM", val -> removeSuffix(val, "_CM")),
            new DataTreatment("removeSuffix_FR", val -> removeSuffix(val, "_FR")),
            new DataTreatment("removeSuffix_US", val -> removeSuffix(val, "_US")),
            new DataTreatment("removeSuffixPattern", this::removeSuffixPattern),
            new DataTreatment("trim+toLowerCase+removeSpecialChars", 
                val -> removeSpecialChars(val.trim().toLowerCase())),
            new DataTreatment("trim+toLowerCase+normalizeNumbers", 
                val -> normalizeNumbers(val.trim().toLowerCase())),
            new DataTreatment("trim+removeSuffixPattern", 
                val -> removeSuffixPattern(val.trim()))
        );

        double bestConfidence = 0.0;
        List<String> bestTreatments = new ArrayList<>();
        String bestReason = "";

        for (DataTreatment treatment : treatments) {
            // Appliquer le traitement à l'échantillon BO
            Set<String> treatedBoSample = boSample.stream()
                    .map(treatment::apply)
                    .collect(Collectors.toSet());

            // Appliquer le traitement à toutes les valeurs partenaire
            Set<String> treatedPartnerValues = partnerValues.stream()
                    .map(treatment::apply)
                    .collect(Collectors.toSet());

            // Calculer le pourcentage de correspondances
            long matches = treatedBoSample.stream()
                    .filter(treatedPartnerValues::contains)
                    .count();

            double confidence = treatedBoSample.isEmpty() ? 0.0 : (double) matches / treatedBoSample.size();

            // Log détaillé pour les colonnes importantes
            if (boColumn.toLowerCase().contains("id") || boColumn.toLowerCase().contains("transaction") ||
                partnerColumn.toLowerCase().contains("id") || partnerColumn.toLowerCase().contains("transaction")) {
                log.info("🔍 Test traitement '{}' pour {} ↔ {}: {}% ({}/{})", 
                    treatment.name, boColumn, partnerColumn, String.format("%.1f", confidence * 100), matches, treatedBoSample.size());
                
                if (confidence > 0.1) { // Log des échantillons si confiance > 10%
                    log.info("   Échantillons BO traités: {}", treatedBoSample.stream().limit(5).collect(Collectors.toList()));
                    log.info("   Échantillons Partner traités: {}", treatedPartnerValues.stream().limit(5).collect(Collectors.toList()));
                }
            }

            if (confidence > bestConfidence) {
                bestConfidence = confidence;
                bestTreatments = new ArrayList<>();
                bestTreatments.add(treatment.name);
                bestReason = String.format("Confiance de %.1f%% sur le contenu avec traitement '%s'. %d correspondances trouvées sur %d échantillons.", 
                    confidence * 100, treatment.name, matches, treatedBoSample.size());
            }
        }

        return new ContentAnalysisResult(bestConfidence, bestTreatments, bestReason);
    }

    /**
     * Calcule la compatibilité des formats entre deux colonnes
     */
    private double calculateFormatCompatibility(List<Map<String, String>> boData, List<Map<String, String>> partnerData, 
                                              String boColumn, String partnerColumn) {
        if (boData.isEmpty() || partnerData.isEmpty()) {
            return 0.0;
        }
        
        // Extraire les valeurs des colonnes
        List<String> boValues = boData.stream()
                .map(row -> row.get(boColumn))
                .filter(Objects::nonNull)
                .filter(val -> !val.trim().isEmpty())
                .limit(100) // Limiter pour les performances
                .collect(Collectors.toList());
                
        List<String> partnerValues = partnerData.stream()
                .map(row -> row.get(partnerColumn))
                .filter(Objects::nonNull)
                .filter(val -> !val.trim().isEmpty())
                .limit(100) // Limiter pour les performances
                .collect(Collectors.toList());
        
        if (boValues.isEmpty() || partnerValues.isEmpty()) {
            return 0.0;
        }
        
        // Analyser les patterns de format
        boolean boHasNumbers = boValues.stream().anyMatch(val -> val.matches(".*\\d+.*"));
        boolean partnerHasNumbers = partnerValues.stream().anyMatch(val -> val.matches(".*\\d+.*"));
        
        boolean boHasLetters = boValues.stream().anyMatch(val -> val.matches(".*[a-zA-Z]+.*"));
        boolean partnerHasLetters = partnerValues.stream().anyMatch(val -> val.matches(".*[a-zA-Z]+.*"));
        
        boolean boHasSpecialChars = boValues.stream().anyMatch(val -> val.matches(".*[^a-zA-Z0-9\\s]+.*"));
        boolean partnerHasSpecialChars = partnerValues.stream().anyMatch(val -> val.matches(".*[^a-zA-Z0-9\\s]+.*"));
        
        // Calculer la compatibilité
        double compatibility = 0.0;
        
        if (boHasNumbers == partnerHasNumbers) compatibility += 0.4;
        if (boHasLetters == partnerHasLetters) compatibility += 0.3;
        if (boHasSpecialChars == partnerHasSpecialChars) compatibility += 0.3;
        
        return compatibility;
    }
    
    /**
     * Calcule le score d'unicité pour une paire de colonnes
     */
    private double calculateUniquenessScore(List<Map<String, String>> boData, List<Map<String, String>> partnerData, 
                                          String boColumn, String partnerColumn) {
        if (boData.isEmpty() || partnerData.isEmpty()) {
            return 0.0;
        }

        // Extraire les valeurs uniques
        Set<String> boUniqueValues = boData.stream()
                .map(row -> row.get(boColumn))
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
                
        Set<String> partnerUniqueValues = partnerData.stream()
                .map(row -> row.get(partnerColumn))
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        // Calculer le ratio d'unicité
        double boUniqueness = boData.isEmpty() ? 0.0 : (double) boUniqueValues.size() / boData.size();
        double partnerUniqueness = partnerData.isEmpty() ? 0.0 : (double) partnerUniqueValues.size() / partnerData.size();

        // Score moyen pondéré (une clé partagée doit avoir une forte unicité dans les deux fichiers)
        return (boUniqueness + partnerUniqueness) / 2.0;
    }

    /**
     * Calcule la similarité entre deux noms de colonnes
     */
    private double calculateColumnSimilarity(String col1, String col2) {
        String normalized1 = normalizeColumnName(col1);
        String normalized2 = normalizeColumnName(col2);
        
        // Similarité exacte
        if (normalized1.equals(normalized2)) {
            return 1.0;
        }
        
        // Similarité partielle
        if (normalized1.contains(normalized2) || normalized2.contains(normalized1)) {
            return 0.8;
        }
        
        // Similarité par mots-clés
        double keywordSimilarity = calculateKeywordSimilarity(normalized1, normalized2);
        
        return keywordSimilarity;
    }

    /**
     * Normalise le nom d'une colonne pour la comparaison
     */
    private String normalizeColumnName(String columnName) {
        return columnName.toLowerCase()
                .replaceAll("[^a-z0-9]", "")
                .trim();
    }

    /**
     * Calcule la similarité par mots-clés (adaptée du mode assisté)
     */
    private double calculateKeywordSimilarity(String col1, String col2) {
        // Mots-clés communs pour les identifiants (plus étendus)
        Set<String> idKeywords = Set.of("id", "identifiant", "reference", "code", "numero", "number", "cle", "key");
        Set<String> amountKeywords = Set.of("montant", "amount", "somme", "total", "prix", "price", "value", "sum");
        Set<String> dateKeywords = Set.of("date", "jour", "day", "time", "heure", "hour", "timestamp");
        Set<String> phoneKeywords = Set.of("telephone", "phone", "mobile", "portable", "tel");
        Set<String> transactionKeywords = Set.of("transaction", "trans", "trx", "operation", "op");
        Set<String> serviceKeywords = Set.of("service", "serv", "type", "categorie", "category");
        Set<String> statusKeywords = Set.of("statut", "status", "etat", "state");
        Set<String> clientKeywords = Set.of("client", "customer");
        
        // Vérifier les correspondances par catégorie (priorité élevée pour les identifiants)
        if (containsAny(col1, idKeywords) && containsAny(col2, idKeywords)) {
            return 0.95; // Très haute priorité pour les identifiants
        }
        if (containsAny(col1, transactionKeywords) && containsAny(col2, transactionKeywords)) {
            return 0.90; // Haute priorité pour les transactions
        }
        if (containsAny(col1, amountKeywords) && containsAny(col2, amountKeywords)) {
            return 0.85;
        }
        if (containsAny(col1, dateKeywords) && containsAny(col2, dateKeywords)) {
            return 0.80;
        }
        if (containsAny(col1, serviceKeywords) && containsAny(col2, serviceKeywords)) {
            return 0.80;
        }
        if (containsAny(col1, statusKeywords) && containsAny(col2, statusKeywords)) {
            return 0.75;
        }
        if (containsAny(col1, phoneKeywords) && containsAny(col2, phoneKeywords)) {
            return 0.75;
        }
        if (containsAny(col1, clientKeywords) && containsAny(col2, clientKeywords)) {
            return 0.70;
        }
        
        // Correspondance partielle par caractères communs (plus permissive)
        int commonChars = 0;
        for (char c : col1.toCharArray()) {
            if (col2.contains(String.valueOf(c))) {
                commonChars++;
            }
        }
        
        double charSimilarity = (double) commonChars / Math.max(col1.length(), col2.length());
        if (charSimilarity > 0.2) { // Seuil réduit
            return 0.3 + charSimilarity * 0.4; // Entre 0.3 et 0.7
        }
        
        return 0.0;
    }

    private boolean containsAny(String text, Set<String> keywords) {
        return keywords.stream().anyMatch(text::contains);
    }

    /**
     * Analyse la qualité des données pour chaque correspondance
     */
    private List<KeyCandidate> analyzeDataQuality(List<Map<String, String>> boData, List<Map<String, String>> partnerData, List<ColumnMatch> matches) {
        List<KeyCandidate> candidates = new ArrayList<>();
        
        for (ColumnMatch match : matches) {
            double dataQuality = calculateDataQuality(boData, partnerData, match);
            candidates.add(new KeyCandidate(match.boColumn, match.partnerColumn, match.similarity, dataQuality, match.contentAnalysis));
        }
        
        // Trier par score global décroissant
        candidates.sort((a, b) -> Double.compare(b.getOverallScore(), a.getOverallScore()));
        
        log.info("📊 Candidats analysés: {}", candidates);
        return candidates;
    }

    /**
     * Calcule la qualité des données pour une correspondance
     */
    private double calculateDataQuality(List<Map<String, String>> boData, List<Map<String, String>> partnerData, ColumnMatch match) {
        if (boData.isEmpty() || partnerData.isEmpty()) {
            return 0.0;
        }
        
        // Extraire les valeurs uniques
        Set<String> boValues = boData.stream()
                .map(row -> row.get(match.boColumn))
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
                
        Set<String> partnerValues = partnerData.stream()
                .map(row -> row.get(match.partnerColumn))
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        
        // Calculer le taux de correspondance
        long commonValues = boValues.stream()
                .filter(partnerValues::contains)
                .count();
        
        double boCoverage = boValues.isEmpty() ? 0 : (double) commonValues / boValues.size();
        double partnerCoverage = partnerValues.isEmpty() ? 0 : (double) commonValues / partnerValues.size();
        
        // Score moyen pondéré
        return (boCoverage + partnerCoverage) / 2.0;
    }

    /**
     * Sélectionne les meilleures clés
     */
    private KeyDiscoveryResult selectBestKeys(List<KeyCandidate> candidates) {
        List<KeyCandidate> bestCandidates = candidates.stream()
                .filter(candidate -> candidate.getOverallScore() > 0.1) // Seuil pour clé primaire (très réduit pour debug)
                .limit(3) // Top 3 candidats
                .collect(Collectors.toList());

        double confidence = bestCandidates.isEmpty() ? 0.0 : bestCandidates.get(0).getOverallScore();
        
        return new KeyDiscoveryResult(bestCandidates, confidence);
    }

    // Fonctions de traitement des données
    private String removeSpecialChars(String value) {
        return value.replaceAll("[^a-zA-Z0-9]", "");
    }

    private String normalizeNumbers(String value) {
        return value.replaceAll("^0+", ""); // Supprime les zéros non significatifs au début
    }
    
    private String removeSuffix(String value, String suffix) {
        if (value != null && value.endsWith(suffix)) {
            return value.substring(0, value.length() - suffix.length());
        }
        return value;
    }
    
    private String removeSuffixPattern(String value) {
        if (value == null) return value;
        
        // Patterns courants pour les suffixes
        String[] patterns = {
            "_CM", "_FR", "_US", "_UK", "_DE", "_IT", "_ES", "_CA", "_AU", "_BR",
            "_01", "_02", "_03", "_04", "_05", "_06", "_07", "_08", "_09", "_10",
            "_CM1", "_FR1", "_US1", "_UK1", "_DE1", "_IT1", "_ES1", "_CA1", "_AU1", "_BR1"
        };
        
        for (String pattern : patterns) {
            if (value.endsWith(pattern)) {
                return value.substring(0, value.length() - pattern.length());
            }
        }
        
        // Pattern générique pour les suffixes de 2-5 caractères commençant par _
        if (value.matches(".*_[A-Z0-9]{2,5}$")) {
            return value.replaceAll("_[A-Z0-9]{2,5}$", "");
        }
        
        return value;
    }

    // Classes internes
    public static class ColumnMatch {
        public final String boColumn;
        public final String partnerColumn;
        public final double similarity;
        public final ContentAnalysisResult contentAnalysis;

        public ColumnMatch(String boColumn, String partnerColumn, double similarity, ContentAnalysisResult contentAnalysis) {
            this.boColumn = boColumn;
            this.partnerColumn = partnerColumn;
            this.similarity = similarity;
            this.contentAnalysis = contentAnalysis;
        }

        @Override
        public String toString() {
            return String.format("ColumnMatch{bo=%s, partner=%s, score=%.2f, content=%.2f}", 
                boColumn, partnerColumn, similarity, contentAnalysis.confidence);
        }
    }

    public static class ContentAnalysisResult {
        public final double confidence;
        public final List<String> appliedTreatments;
        public final String reason;

        public ContentAnalysisResult(double confidence, List<String> appliedTreatments, String reason) {
            this.confidence = confidence;
            this.appliedTreatments = appliedTreatments;
            this.reason = reason;
        }
    }

    public static class DataTreatment {
        public final String name;
        public final java.util.function.Function<String, String> function;

        public DataTreatment(String name, java.util.function.Function<String, String> function) {
            this.name = name;
            this.function = function;
        }

        public String apply(String value) {
            return function.apply(value);
        }
    }

    public static class KeyCandidate {
        public final String boColumn;
        public final String partnerColumn;
        public final double nameSimilarity;
        public final double dataQuality;
        public final ContentAnalysisResult contentAnalysis;

        public KeyCandidate(String boColumn, String partnerColumn, double nameSimilarity, double dataQuality, ContentAnalysisResult contentAnalysis) {
            this.boColumn = boColumn;
            this.partnerColumn = partnerColumn;
            this.nameSimilarity = nameSimilarity;
            this.dataQuality = dataQuality;
            this.contentAnalysis = contentAnalysis;
        }

        public double getOverallScore() {
            return (nameSimilarity * NAME_SIMILARITY_WEIGHT) +
                   (contentAnalysis.confidence * CONTENT_SCORE_WEIGHT) +
                   (dataQuality * UNIQUENESS_SCORE_WEIGHT);
        }

        @Override
        public String toString() {
            return String.format("KeyCandidate{bo=%s, partner=%s, name=%.2f, content=%.2f, quality=%.2f, overall=%.2f}", 
                boColumn, partnerColumn, nameSimilarity, contentAnalysis.confidence, dataQuality, getOverallScore());
        }
    }

    public static class KeyDiscoveryResult {
        public final List<KeyCandidate> candidates;
        public final double confidence;

        public KeyDiscoveryResult(List<KeyCandidate> candidates, double confidence) {
            this.candidates = candidates;
            this.confidence = confidence;
        }

        @Override
        public String toString() {
            return String.format("KeyDiscoveryResult{candidates=%d, confidence=%.2f}", candidates.size(), confidence);
        }
    }
}
