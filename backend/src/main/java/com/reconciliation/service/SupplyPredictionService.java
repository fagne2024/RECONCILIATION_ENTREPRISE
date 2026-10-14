package com.reconciliation.service;

import com.reconciliation.dto.*;
import com.reconciliation.entity.OperationEntity;
import com.reconciliation.entity.CompteEntity;
import com.reconciliation.entity.AgencyThresholdEntity;
import com.reconciliation.repository.OperationRepository;
import com.reconciliation.repository.CompteRepository;
import com.reconciliation.repository.AgencyThresholdRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Service de prédiction d'approvisionnement
 * Inspiré du modèle de prédiction d'approvisionnement
 * Adapté au contexte bancaire (agences = produits, solde = stock)
 */
@Service
public class SupplyPredictionService {
    private static final Logger logger = LoggerFactory.getLogger(SupplyPredictionService.class);

    @Autowired
    private OperationRepository operationRepository;
    
    @Autowired
    private CompteRepository compteRepository;
    
    @Autowired
    private AgencyThresholdRepository agencyThresholdRepository;
    
    private SupplyPredictionConfig config = new SupplyPredictionConfig();
    private static final List<String> ELIGIBLE_CATEGORIES = Arrays.asList("client", "service");

    /**
     * Configure les paramètres du système
     */
    public void configure(SupplyPredictionConfig config) {
        this.config = config != null ? config : new SupplyPredictionConfig();
        logger.info("⚙️ Configuration mise à jour: leadTime={}, safetyFactor={}, minStock={}, maxStock={}",
            config.getLeadTimeDays(), config.getSafetyFactor(), config.getMinStockDays(), config.getMaxStockDays());
    }

    /**
     * Obtient les recommandations d'approvisionnement pour toutes les agences
     */
    @Transactional(readOnly = true)
    public List<SupplyRecommendation> getSupplyRecommendations(String typeOperation, String pays, Integer periodeAnalyseJours) {
        logger.info("📊 Génération des recommandations d'approvisionnement pour type: {}", typeOperation);
        
        LocalDate aujourdhui = LocalDate.now();
        LocalDateTime dateDebut = aujourdhui.minusDays(periodeAnalyseJours != null ? periodeAnalyseJours : 90).atStartOfDay();
        LocalDateTime dateFin = aujourdhui.atTime(23, 59, 59);
        
        Map<String, CompteEntity> eligibleAccounts = getEligibleAccountsByIdentifier(pays);
        List<SupplyRecommendation> recommendations = new ArrayList<>();
        
        for (Map.Entry<String, CompteEntity> entry : eligibleAccounts.entrySet()) {
            String primaryIdentifier = entry.getKey();
            CompteEntity compte = entry.getValue();
            String fallbackIdentifier = getCompteFallbackIdentifier(compte, primaryIdentifier);
            try {
                // Récupérer les opérations historiques pour cette agence
                List<OperationEntity> operations = findOperationsByIdentifiers(primaryIdentifier, fallbackIdentifier);
                operations = operations.stream()
                    .filter(op -> op != null && typeOperation.equals(op.getTypeOperation()))
                    .filter(op -> op.getDateOperation().isAfter(dateDebut) && op.getDateOperation().isBefore(dateFin))
                    .filter(op -> op.getStatut() == null || !"Annulée".equals(op.getStatut()))
                    .filter(op -> pays == null || pays.isEmpty() || (op.getPays() != null && op.getPays().equalsIgnoreCase(pays)))
                    .sorted(Comparator.comparing(OperationEntity::getDateOperation))
                    .collect(Collectors.toList());
                
                if (operations.isEmpty()) {
                    continue;
                }
                
                Double currentStock = compte.getSolde() != null ? compte.getSolde() : 0.0;
                
                // Calculer les recommandations
                SupplyRecommendation recommendation = calculateRecommendation(
                    primaryIdentifier,
                    fallbackIdentifier,
                    typeOperation,
                    operations,
                    currentStock,
                    periodeAnalyseJours,
                    pays,
                    compte);
                
                if (recommendation != null) {
                    recommendations.add(recommendation);
                }
            } catch (Exception e) {
                logger.error("❌ Erreur lors du calcul pour l'agence {}: {}", primaryIdentifier, e.getMessage());
            }
        }
        
        // Trier par niveau d'alerte (urgent > normal > low)
        recommendations.sort((a, b) -> {
            int priorityA = getAlertPriority(a.getAlertLevel());
            int priorityB = getAlertPriority(b.getAlertLevel());
            return Integer.compare(priorityB, priorityA);
        });
        
        logger.info("✅ {} recommandations générées", recommendations.size());
        return recommendations;
    }

    /**
     * Calcule une recommandation pour une agence
     */
    private SupplyRecommendation calculateRecommendation(
            String primaryIdentifier,
            String fallbackIdentifier,
            String typeOperation,
            List<OperationEntity> operations,
            Double currentStock,
            Integer periodeAnalyseJours,
            String pays,
            CompteEntity compte) {
        
        if (operations.isEmpty()) {
            return null;
        }
        
        SupplyRecommendation recommendation = new SupplyRecommendation(primaryIdentifier, typeOperation);
        
        // Récupérer le nom de l'agence
        String agenceName = compte != null && compte.getAgence() != null && !compte.getAgence().isEmpty()
            ? compte.getAgence()
            : primaryIdentifier;
        recommendation.setAgence(agenceName);
        
        // Calculer la consommation
        // Récupérer toutes les opérations de l'agence pour calculer la variation moyenne
        LocalDate aujourdhui = LocalDate.now();
        LocalDateTime dateDebutOp = aujourdhui.minusDays(periodeAnalyseJours != null ? periodeAnalyseJours : 90).atStartOfDay();
        LocalDateTime dateFinOp = aujourdhui.atTime(23, 59, 59);
        List<OperationEntity> allOperations = findOperationsByIdentifiers(primaryIdentifier, fallbackIdentifier);
        allOperations = allOperations.stream()
            .filter(op -> op.getDateOperation().isAfter(dateDebutOp) && op.getDateOperation().isBefore(dateFinOp))
            .filter(op -> op.getStatut() == null || !"Annulée".equals(op.getStatut()))
            .filter(op -> pays == null || pays.isEmpty() || (op.getPays() != null && op.getPays().equalsIgnoreCase(pays)))
            .sorted(Comparator.comparing(OperationEntity::getDateOperation))
            .collect(Collectors.toList());
        
        ConsumptionAnalysis consumption = calculateConsumption(allOperations);
        
        // Nouveaux champs selon les nouvelles règles
        recommendation.setAverageConsumptionDaily(consumption.dailyAverage);
        // Garder les anciens pour compatibilité
        recommendation.setAverageConsumption(consumption.dailyAverage);
        recommendation.setConsumptionStdDev(consumption.stdDev);
        recommendation.setTrend(consumption.trend);
        
        // Calculer le solde recommandé = moyenne des soldes après chaque compensation sur la période
        // Utiliser toutes les opérations pour trouver les compensations
        Double recommendedBalance = calculateAverageBalanceAfterCompensations(allOperations);
        recommendation.setRecommendedBalance(recommendedBalance);
        
        // Solde actuel
        recommendation.setCurrentBalance(currentStock);
        recommendation.setCurrentStock(currentStock); // Pour compatibilité
        
        // Stock de sécurité = solde actuel + 10% de la consommation journalière
        Double safetyStock = currentStock + (consumption.dailyAverage * 0.10);
        recommendation.setSafetyStock(safetyStock);
        
        // Jours avant rupture = calcul du surplus de consommation journalière
        // Nombre de jours avant que le solde soit épuisé ou atteigne un niveau critique
        // Calcul = solde actuel / consommation journalière (si consommation > 0)
        Integer daysUntilStockout;
        if (consumption.dailyAverage > 0 && currentStock > 0) {
            // Calculer combien de jours avant que le solde soit épuisé
            daysUntilStockout = (int) Math.round(currentStock / consumption.dailyAverage);
        } else if (consumption.dailyAverage <= 0) {
            // Pas de consommation, pas de rupture prévisible
            daysUntilStockout = Integer.MAX_VALUE;
        } else {
            // Solde déjà à zéro ou négatif
            daysUntilStockout = 0;
        }
        recommendation.setDaysUntilStockout(daysUntilStockout);
        
        // Déterminer le niveau d'alerte basé sur les jours avant rupture
        String alertLevel = determineAlertLevel(daysUntilStockout);
        recommendation.setAlertLevel(alertLevel);
        
        // Date recommandée = J ou J+1 (analyse à J)
        LocalDate predictedDate = LocalDate.now();
        if (daysUntilStockout != null && daysUntilStockout <= 1) {
            // Urgent : aujourd'hui (J)
            predictedDate = LocalDate.now();
        } else {
            // Normal : demain (J+1)
            predictedDate = LocalDate.now().plusDays(1);
        }
        recommendation.setPredictedDate(predictedDate);
        
        // Pour compatibilité, garder les anciens champs mais ne pas les utiliser
        recommendation.setRecommendedQuantity(recommendedBalance); // Utiliser le solde recommandé
        recommendation.setLeadTimeDays(config.getLeadTimeDays());
        recommendation.setReorderPoint(null); // Plus utilisé
        recommendation.setEconomicOrderQuantity(null); // Plus utilisé
        recommendation.setStockDays(null); // Plus utilisé
        
        // Calculer la confiance basée sur le stock de sécurité
        Double confidence = calculateConfidenceBasedOnSafetyStock(
            currentStock, safetyStock, consumption.dailyAverage, consumption.stdDev, operations.size());
        recommendation.setConfidenceLevel(confidence);
        
        return recommendation;
    }

    /**
     * Analyse la consommation historique
     * Calcule la variation moyenne par jour selon la formule :
     * total paiement + total cashout - total cashin - total frais de transaction
     */
    private ConsumptionAnalysis calculateConsumption(List<OperationEntity> operations) {
        ConsumptionAnalysis analysis = new ConsumptionAnalysis();
        
        if (operations.isEmpty()) {
            analysis.dailyAverage = 0.0;
            analysis.weeklyAverage = 0.0;
            analysis.monthlyAverage = 0.0;
            analysis.dailySupplyAverage = 0.0;
            analysis.stdDev = 0.0;
            analysis.trend = 0.0;
            analysis.trendDirection = "no_activity";
            return analysis;
        }
        
        // Grouper les opérations par date (jour)
        Map<LocalDate, List<OperationEntity>> operationsByDate = operations.stream()
            .collect(Collectors.groupingBy(op -> op.getDateOperation().toLocalDate()));
        
        // Calculer la variation pour chaque jour
        List<Double> dailyVariations = new ArrayList<>();
        List<Double> supplies = new ArrayList<>(); // Pour les approvisionnements
        
        for (Map.Entry<LocalDate, List<OperationEntity>> entry : operationsByDate.entrySet()) {
            LocalDate date = entry.getKey();
            List<OperationEntity> dayOperations = entry.getValue();
            
            // Calculer les totaux pour ce jour
            double totalPaiement = 0.0;
            double totalCashout = 0.0;
            double totalCashin = 0.0;
            double totalFraisTransaction = 0.0;
            
            for (OperationEntity op : dayOperations) {
                String typeOp = op.getTypeOperation() != null ? op.getTypeOperation() : "";
                Double montant = op.getMontant() != null ? op.getMontant() : 0.0;
                
                if ("total_paiement".equals(typeOp)) {
                    totalPaiement += montant;
                } else if ("total_cashout".equals(typeOp)) {
                    totalCashout += montant;
                } else if ("total_cashin".equals(typeOp)) {
                    totalCashin += montant;
                } else if ("FRAIS_TRANSACTION".equals(typeOp)) {
                    totalFraisTransaction += montant;
                } else if (typeOp.toLowerCase().contains("appro")) {
                    // Approvisionnements (crédits)
                    supplies.add(montant);
                }
            }
            
            // Calculer la variation selon la formule : total paiement + total cashout - total cashin - total frais de transaction
            double variation = totalPaiement + totalCashout - totalCashin - totalFraisTransaction;
            dailyVariations.add(variation);
        }
        
        if (dailyVariations.isEmpty()) {
            analysis.dailyAverage = 0.0;
            analysis.weeklyAverage = 0.0;
            analysis.monthlyAverage = 0.0;
            analysis.dailySupplyAverage = 0.0;
            analysis.stdDev = 0.0;
            analysis.trend = 0.0;
            analysis.trendDirection = "no_activity";
            return analysis;
        }
        
        // Calculer la période totale couverte
        LocalDateTime firstDate = operations.get(0).getDateOperation();
        LocalDateTime lastDate = operations.get(operations.size() - 1).getDateOperation();
        long totalDays = ChronoUnit.DAYS.between(firstDate.toLocalDate(), lastDate.toLocalDate()) + 1;
        
        // Calculer la moyenne journalière de variation
        double totalVariation = dailyVariations.stream().mapToDouble(Double::doubleValue).sum();
        analysis.dailyAverage = totalDays > 0 ? totalVariation / totalDays : 0.0;
        analysis.weeklyAverage = analysis.dailyAverage * 7;
        analysis.monthlyAverage = analysis.dailyAverage * 30;
        
        // Stocker aussi le taux d'approvisionnement pour les calculs de compensation
        double totalSupply = supplies.stream().mapToDouble(Double::doubleValue).sum();
        analysis.dailySupplyAverage = totalDays > 0 ? totalSupply / totalDays : 0.0;
        
        // Calculer l'écart-type des variations journalières
        double variance = dailyVariations.stream()
            .mapToDouble(v -> Math.pow(v - analysis.dailyAverage, 2))
            .average()
            .orElse(0.0);
        analysis.stdDev = Math.sqrt(variance);
        
        // Détecter la tendance directionnelle
        if (dailyVariations.size() >= 3) {
            int midPoint = dailyVariations.size() / 2;
            double firstHalfAvg = dailyVariations.subList(0, midPoint).stream()
                .mapToDouble(Double::doubleValue).average().orElse(0.0);
            double secondHalfAvg = dailyVariations.subList(midPoint, dailyVariations.size()).stream()
                .mapToDouble(Double::doubleValue).average().orElse(0.0);
            
            // Calculer aussi la pente pour la tendance numérique
            double[] trendData = calculateTrend(dailyVariations);
            analysis.trend = trendData[0]; // Pente
            
            // Déterminer la direction de tendance
            if (secondHalfAvg > firstHalfAvg * 1.2) {
                analysis.trendDirection = "increasing";
            } else if (secondHalfAvg < firstHalfAvg * 0.8) {
                analysis.trendDirection = "decreasing";
            } else {
                analysis.trendDirection = "stable";
            }
        } else if (dailyVariations.size() >= 2) {
            double[] trendData = calculateTrend(dailyVariations);
            analysis.trend = trendData[0];
            analysis.trendDirection = "insufficient_data";
        } else {
            analysis.trend = 0.0;
            analysis.trendDirection = "insufficient_data";
        }
        
        // Si aucune variation, marquer comme inactif
        if (totalVariation == 0) {
            analysis.trendDirection = "no_activity";
        }
        
        return analysis;
    }

    /**
     * Calcule la tendance linéaire
     */
    private double[] calculateTrend(List<Double> values) {
        int n = values.size();
        double sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        
        for (int i = 0; i < n; i++) {
            double x = i;
            double y = values.get(i);
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
        }
        
        double slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        double intercept = (sumY - slope * sumX) / n;
        
        return new double[]{slope, intercept};
    }

    /**
     * Calcule le stock de sécurité
     * SS = Consommation journalière × Délai × Facteur de sécurité
     */
    private Double calculateSafetyStock(Double dailyConsumption, Double stdDev) {
        if (dailyConsumption == null || dailyConsumption <= 0) {
            return 0.0;
        }
        
        // Stock de sécurité = (Consommation × Délai) + (Écart-type × Facteur de sécurité)
        double baseSafetyStock = dailyConsumption * config.getLeadTimeDays();
        double variabilityFactor = stdDev != null && stdDev > 0 ? stdDev * config.getSafetyFactor() : 0;
        
        return baseSafetyStock + variabilityFactor;
    }

    /**
     * Calcule le point de réapprovisionnement (ROP)
     * ROP = (Consommation × Délai) + Stock de sécurité
     */
    private Double calculateReorderPoint(Double dailyConsumption, Double safetyStock) {
        if (dailyConsumption == null || dailyConsumption <= 0) {
            return 0.0;
        }
        
        double demandDuringLeadTime = dailyConsumption * config.getLeadTimeDays();
        return demandDuringLeadTime + (safetyStock != null ? safetyStock : 0.0);
    }

    /**
     * Calcule la quantité économique (EOQ simplifiée)
     * EOQ = Consommation journalière × Jours de stock cible
     * Inspiré du modèle Python : target_stock_days = (min_stock_days + max_stock_days) / 2
     */
    private Double calculateEOQ(Double dailyConsumption) {
        if (dailyConsumption == null || dailyConsumption <= 0) {
            return 0.0;
        }
        
        // Utiliser la moyenne entre min et max comme dans le modèle Python
        double targetStockDays = (config.getMinStockDays() + config.getMaxStockDays()) / 2.0;
        return dailyConsumption * targetStockDays;
    }

    /**
     * Détermine le niveau d'alerte
     */
    private String determineAlertLevel(Integer stockDays) {
        if (stockDays == null || stockDays <= 0) {
            return "urgent";
        }
        
        if (stockDays < config.getUrgentThresholdDays()) {
            return "urgent";
        } else if (stockDays < config.getNormalThresholdDays()) {
            return "normal";
        } else {
            return "low";
        }
    }

    /**
     * Prédit la date du prochain approvisionnement
     */
    private LocalDate predictNextOrderDate(Double currentStock, Double reorderPoint, Double dailyConsumption) {
        if (currentStock == null || reorderPoint == null || dailyConsumption == null || dailyConsumption <= 0) {
            return LocalDate.now().plusDays(config.getLeadTimeDays());
        }
        
        if (currentStock <= reorderPoint) {
            // Urgent : commander maintenant
            return LocalDate.now();
        }
        
        // Calculer quand le stock atteindra le ROP
        double daysUntilROP = (currentStock - reorderPoint) / dailyConsumption;
        LocalDate orderDate = LocalDate.now().plusDays((long) Math.max(0, Math.floor(daysUntilROP)));
        
        // S'assurer que la commande arrive avant la rupture
        return orderDate.minusDays(config.getLeadTimeDays());
    }

    /**
     * Calcule la moyenne des soldes après chaque compensation sur la période d'analyse
     * Filtre les opérations pour ne garder que les compensations et prend leur soldeAprès
     */
    private Double calculateAverageBalanceAfterCompensations(List<OperationEntity> operations) {
        if (operations.isEmpty()) {
            return 0.0;
        }
        
        // Filtrer uniquement les opérations de compensation
        List<Double> balancesAfterCompensations = operations.stream()
            .filter(op -> {
                String typeOp = op.getTypeOperation() != null ? op.getTypeOperation().toLowerCase() : "";
                // Identifier les compensations : typeOperation contient "compens" ou "compense"
                return typeOp.contains("compens") || typeOp.contains("compense");
            })
            .filter(op -> op.getSoldeApres() != null) // Ne garder que celles avec un soldeAprès
            .map(OperationEntity::getSoldeApres)
            .collect(Collectors.toList());
        
        if (balancesAfterCompensations.isEmpty()) {
            // Si aucune compensation trouvée, retourner 0.0 ou une valeur par défaut
            logger.warn("⚠️ Aucune compensation trouvée pour calculer le solde recommandé");
            return 0.0;
        }
        
        // Calculer la moyenne des soldes après compensation
        double average = balancesAfterCompensations.stream()
            .mapToDouble(Double::doubleValue)
            .average()
            .orElse(0.0);
        
        logger.debug("📊 Solde recommandé calculé: moyenne de {} soldes après compensation = {}", 
            balancesAfterCompensations.size(), average);
        
        return average;
    }
    
    /**
     * Calcule le niveau de confiance basé sur le stock de sécurité
     * Confiance = f(solde actuel, stock de sécurité, consommation, variabilité, nombre de données)
     */
    private Double calculateConfidenceBasedOnSafetyStock(
            Double currentBalance, 
            Double safetyStock, 
            Double dailyConsumption, 
            Double stdDev, 
            int dataPoints) {
        
        if (currentBalance == null || safetyStock == null || dailyConsumption == null || dailyConsumption <= 0) {
            return 0.5; // Confiance par défaut faible
        }
        
        // Base de confiance selon le nombre de points de données
        double confidence = Math.min(0.95, 0.5 + (dataPoints / 100.0));
        
        // Ajuster selon la distance entre solde actuel et stock de sécurité
        // Si le solde actuel est proche ou supérieur au stock de sécurité, confiance élevée
        double ratio = currentBalance / safetyStock;
        if (ratio >= 1.0) {
            // Solde actuel >= stock de sécurité : confiance élevée
            confidence = Math.min(0.95, confidence * 1.1);
        } else if (ratio >= 0.8) {
            // Solde actuel proche du stock de sécurité : confiance normale
            confidence = confidence;
        } else {
            // Solde actuel bien en dessous : confiance réduite
            confidence = Math.max(0.3, confidence * 0.8);
        }
        
        // Ajuster selon la variabilité de la consommation
        if (stdDev != null && stdDev > 0 && dailyConsumption > 0) {
            double coefficientVariation = stdDev / dailyConsumption;
            // Réduire la confiance si la variabilité est très élevée
            if (coefficientVariation > 1.0) {
                confidence *= 0.8; // Réduire de 20%
            } else if (coefficientVariation > 0.5) {
                confidence *= 0.9; // Réduire de 10%
            }
        }
        
        return Math.max(0.1, Math.min(0.95, confidence));
    }
    
    /**
     * Calcule le niveau de confiance (ancienne méthode, conservée pour compatibilité)
     * Inspiré du modèle Python : min(0.95, 0.5 + (data_points / 100))
     */
    private Double calculateConfidence(List<OperationEntity> operations, ConsumptionAnalysis consumption) {
        // Méthode simplifiée comme dans le modèle Python
        int dataPoints = operations.size();
        double confidence = Math.min(0.95, 0.5 + (dataPoints / 100.0));
        
        // Ajuster selon la qualité des données (régularité)
        if (consumption.dailyAverage > 0 && consumption.stdDev > 0) {
            double coefficientVariation = consumption.stdDev / consumption.dailyAverage;
            // Réduire la confiance si la variabilité est très élevée
            if (coefficientVariation > 1.0) {
                confidence *= 0.8; // Réduire de 20%
            }
        }
        
        return Math.min(0.95, confidence);
    }

    /**
     * Obtient la priorité d'une alerte
     */
    private int getAlertPriority(String alertLevel) {
        if (alertLevel == null) return 0;
        switch (alertLevel.toLowerCase()) {
            case "urgent": return 3;
            case "normal": return 2;
            case "low": return 1;
            default: return 0;
        }
    }

    /**
     * Classe interne pour l'analyse de consommation
     */
    private static class ConsumptionAnalysis {
        double dailyAverage;
        double weeklyAverage;
        double monthlyAverage;
        double dailySupplyAverage; // Taux moyen d'approvisionnement (pour calculer montée du solde)
        double stdDev;
        double trend; // Pente de la tendance
        String trendDirection; // "increasing", "decreasing", "stable", "insufficient_data", "no_activity"
    }
    
    /**
     * Analyse la fréquence historique des approvisionnements
     * Inspiré du modèle Python
     */
    @Transactional(readOnly = true)
    public Map<String, Object> analyzeSupplyFrequency(String codeProprietaire, String typeOperation, Integer periodeAnalyseJours) {
        logger.info("📊 Analyse de fréquence d'approvisionnement pour: {}", codeProprietaire);
        
        LocalDate aujourdhui = LocalDate.now();
        LocalDateTime dateDebut = aujourdhui.minusDays(periodeAnalyseJours != null ? periodeAnalyseJours : 90).atStartOfDay();
        LocalDateTime dateFin = aujourdhui.atTime(23, 59, 59);
        
        // Récupérer les opérations d'approvisionnement (montants positifs)
        List<OperationEntity> operations = operationRepository.findByCodeProprietaire(codeProprietaire);
        List<OperationEntity> supplies = operations.stream()
            .filter(op -> typeOperation.equals(op.getTypeOperation()))
            .filter(op -> op.getDateOperation().isAfter(dateDebut) && op.getDateOperation().isBefore(dateFin))
            .filter(op -> op.getStatut() == null || !"Annulée".equals(op.getStatut()))
            .filter(op -> op.getMontant() != null && op.getMontant() > 0) // Approvisionnements
            .sorted(Comparator.comparing(OperationEntity::getDateOperation))
            .collect(Collectors.toList());
        
        Map<String, Object> frequency = new HashMap<>();
        
        if (supplies.size() < 2) {
            frequency.put("averageIntervalDays", null);
            frequency.put("stdIntervalDays", null);
            frequency.put("lastSupplyDate", supplies.isEmpty() ? null : supplies.get(0).getDateOperation().toLocalDate().toString());
            frequency.put("supplyCount", supplies.size());
            frequency.put("minInterval", null);
            frequency.put("maxInterval", null);
            return frequency;
        }
        
        // Calculer les intervalles entre approvisionnements
        List<Long> intervals = new ArrayList<>();
        for (int i = 1; i < supplies.size(); i++) {
            long interval = ChronoUnit.DAYS.between(
                supplies.get(i - 1).getDateOperation().toLocalDate(),
                supplies.get(i).getDateOperation().toLocalDate()
            );
            intervals.add(interval);
        }
        
        // Calculer les statistiques
        double avgInterval = intervals.stream().mapToLong(Long::longValue).average().orElse(0.0);
        double variance = intervals.stream()
            .mapToDouble(i -> Math.pow(i - avgInterval, 2))
            .average()
            .orElse(0.0);
        double stdInterval = Math.sqrt(variance);
        
        frequency.put("averageIntervalDays", avgInterval);
        frequency.put("stdIntervalDays", stdInterval);
        frequency.put("lastSupplyDate", supplies.get(supplies.size() - 1).getDateOperation().toLocalDate().toString());
        frequency.put("supplyCount", supplies.size());
        frequency.put("minInterval", intervals.stream().mapToLong(Long::longValue).min().orElse(0));
        frequency.put("maxInterval", intervals.stream().mapToLong(Long::longValue).max().orElse(0));
        
        logger.info("✅ Fréquence analysée: intervalle moyen = {} jours, {} approvisionnements", avgInterval, supplies.size());
        return frequency;
    }

    /**
     * Obtient le calendrier prédictif
     */
    @Transactional(readOnly = true)
    public SupplyCalendar getSupplyCalendar(String typeOperation, Integer days, String pays) {
        logger.info("📅 Génération du calendrier prédictif pour {} jours", days);
        
        LocalDate startDate = LocalDate.now();
        LocalDate endDate = startDate.plusDays(days != null ? days : 30);
        
        List<SupplyRecommendation> recommendations = getSupplyRecommendations(
            typeOperation, pays, 90);
        
        SupplyCalendar calendar = new SupplyCalendar(startDate, endDate);
        
        // Grouper les recommandations par date
        Map<LocalDate, List<SupplyRecommendation>> recommendationsByDate = new HashMap<>();
        
        for (SupplyRecommendation rec : recommendations) {
            if (rec.getPredictedDate() != null && 
                !rec.getPredictedDate().isBefore(startDate) && 
                !rec.getPredictedDate().isAfter(endDate)) {
                
                recommendationsByDate.computeIfAbsent(rec.getPredictedDate(), k -> new ArrayList<>()).add(rec);
            }
        }
        
        // Créer les événements du calendrier
        List<SupplyCalendar.CalendarEvent> events = new ArrayList<>();
        
        for (Map.Entry<LocalDate, List<SupplyRecommendation>> entry : recommendationsByDate.entrySet()) {
            for (SupplyRecommendation rec : entry.getValue()) {
                SupplyCalendar.CalendarEvent event = new SupplyCalendar.CalendarEvent(
                    entry.getKey(),
                    rec.getCodeProprietaire(),
                    rec.getAgence(),
                    rec.getTypeOperation(),
                    rec.getRecommendedBalance() != null ? rec.getRecommendedBalance() : rec.getRecommendedQuantity(),
                    rec.getAlertLevel()
                );
                // Utiliser recommendedBalance si disponible
                if (rec.getRecommendedBalance() != null) {
                    event.setRecommendedBalance(rec.getRecommendedBalance());
                }
                event.setNumberOfAgencies(entry.getValue().size());
                events.add(event);
            }
        }
        
        calendar.setEvents(events);
        
        // Calculer les métriques
        long urgentCount = events.stream().filter(e -> "urgent".equals(e.getAlertLevel())).count();
        long normalCount = events.stream().filter(e -> "normal".equals(e.getAlertLevel())).count();
        long lowCount = events.stream().filter(e -> "low".equals(e.getAlertLevel())).count();
        
        calendar.setTotalOrders(events.size());
        calendar.setUrgentOrders((int) urgentCount);
        calendar.setNormalOrders((int) normalCount);
        calendar.setLowPriorityOrders((int) lowCount);
        
        logger.info("✅ Calendrier généré: {} événements sur {} jours", events.size(), days);
        return calendar;
    }

    /**
     * Obtient les analytiques détaillées pour une agence
     */
    @Transactional(readOnly = true)
    public AgencyAnalytics getAgencyAnalytics(String codeProprietaire, String typeOperation, Integer periodeAnalyseJours) {
        logger.info("🔍 Analyse détaillée pour l'agence: {}", codeProprietaire);
        
        LocalDate aujourdhui = LocalDate.now();
        LocalDateTime dateDebut = aujourdhui.minusDays(periodeAnalyseJours != null ? periodeAnalyseJours : 90).atStartOfDay();
        LocalDateTime dateFin = aujourdhui.atTime(23, 59, 59);
        
        // Récupérer toutes les opérations de l'agence pour calculer la variation moyenne
        // (pas seulement celles du type spécifié, car la formule nécessite total_paiement, total_cashin, etc.)
        List<OperationEntity> allOperations = operationRepository.findByCodeProprietaire(codeProprietaire);
        allOperations = allOperations.stream()
            .filter(op -> op.getDateOperation().isAfter(dateDebut) && op.getDateOperation().isBefore(dateFin))
            .filter(op -> op.getStatut() == null || !"Annulée".equals(op.getStatut()))
            .sorted(Comparator.comparing(OperationEntity::getDateOperation))
            .collect(Collectors.toList());
        
        // Récupérer aussi les opérations du type spécifié pour les autres analyses
        List<OperationEntity> operations = allOperations.stream()
            .filter(op -> typeOperation.equals(op.getTypeOperation()))
            .collect(Collectors.toList());
        
        if (allOperations.isEmpty()) {
            return null;
        }
        
        AgencyAnalytics analytics = new AgencyAnalytics(codeProprietaire, typeOperation);
        
        // Récupérer le compte
        List<CompteEntity> comptes = compteRepository.findByCodeProprietaire(codeProprietaire);
        String agenceName = comptes.isEmpty() ? codeProprietaire : 
            (comptes.get(0).getAgence() != null ? comptes.get(0).getAgence() : codeProprietaire);
        analytics.setAgence(agenceName);
        
        // Analyser la consommation (utiliser toutes les opérations pour calculer la variation moyenne)
        ConsumptionAnalysis consumption = calculateConsumption(allOperations);
        analytics.setAverageConsumptionDaily(consumption.dailyAverage);
        analytics.setAverageConsumptionWeekly(consumption.weeklyAverage);
        analytics.setAverageConsumptionMonthly(consumption.monthlyAverage);
        analytics.setConsumptionStdDev(consumption.stdDev);
        analytics.setConsumptionTrend(consumption.trendDirection != null ? consumption.trendDirection : "stable");
        
        // Analyser le stock
        Double currentStock = comptes.isEmpty() ? 0.0 : 
            (comptes.get(0).getSolde() != null ? comptes.get(0).getSolde() : 0.0);
        analytics.setCurrentStock(currentStock);
        
        // Calculer le stock seuil compensation = moyenne des compensations sur la période + solde actuel
        Double averageCompensationBalance = calculateAverageBalanceAfterCompensations(allOperations);
        Double compensationThresholdStock = averageCompensationBalance + currentStock;
        // Stocker dans averageStock (réutiliser ce champ pour le seuil de compensation)
        analytics.setAverageStock(compensationThresholdStock);
        // Ne plus utiliser minStockObserved et maxStockObserved
        
        // Calculer les jours de stock
        Integer stockDays = currentStock > 0 && consumption.dailyAverage > 0
            ? (int) Math.round(currentStock / consumption.dailyAverage)
            : 0;
        analytics.setStockDays(stockDays);
        
        // Calculer le taux de rotation
        Double turnoverRate = consumption.dailyAverage > 0 && currentStock > 0
            ? (consumption.dailyAverage * 365) / currentStock
            : 0.0;
        analytics.setTurnoverRate(turnoverRate);
        
        // Calculer le risque de rupture en pourcentage basé sur le nombre de jours de stock (J)
        // Le risque est inversement proportionnel au nombre de jours de stock restants
        // Formule : pourcentage progressif entre les seuils urgent et normal
        Integer stockoutRisk;
        if (stockDays == null || stockDays <= 0) {
            // Rupture immédiate ou déjà en rupture
            stockoutRisk = 100;
        } else {
            // Forcer les valeurs par défaut : urgent=2, normal=4
            // (Ces valeurs peuvent être surchargées par la config si elle est définie)
            Integer urgentThreshold = 2;
            Integer normalThreshold = 4;
            
            // Utiliser les valeurs de la config si elles sont définies et valides
            if (config != null) {
                Integer configUrgent = config.getUrgentThresholdDays();
                Integer configNormal = config.getNormalThresholdDays();
                
                if (configUrgent != null && configUrgent > 0) {
                    urgentThreshold = configUrgent;
                }
                if (configNormal != null && configNormal > urgentThreshold) {
                    normalThreshold = configNormal;
                }
            }
            
            // Validation finale : s'assurer que normal > urgent
            if (normalThreshold <= urgentThreshold) {
                urgentThreshold = 2;
                normalThreshold = 4;
            }
            
            if (stockDays <= urgentThreshold) {
                // En dessous du seuil urgent : risque maximal (100%)
                stockoutRisk = 100;
            } else if (stockDays >= normalThreshold) {
                // Au-dessus du seuil normal : pas de risque (0%)
                stockoutRisk = 0;
            } else {
                // Entre seuil urgent et normal : calcul progressif
                // Interpolation linéaire : de 100% à 0% entre urgentThreshold et normalThreshold
                // Exemple avec J=3, urgent=2, normal=4:
                // range = 4-2 = 2
                // position = 3-2 = 1
                // riskPercent = 100 * (1 - 1/2) = 100 * 0.5 = 50%
                double range = (double)(normalThreshold - urgentThreshold);
                double position = (double)(stockDays - urgentThreshold);
                // Plus on s'approche de normalThreshold, plus le risque diminue
                // À urgentThreshold : risque = 100%, à normalThreshold : risque = 0%
                double riskPercent = 100.0 * (1.0 - (position / range));
                stockoutRisk = Math.max(0, Math.min(100, (int) Math.round(riskPercent)));
            }
            
            logger.info("📊 Calcul risque rupture: J={}, urgent={}, normal={}, range={}, position={}, risque={}%", 
                stockDays, urgentThreshold, normalThreshold, 
                (normalThreshold - urgentThreshold), (stockDays - urgentThreshold), stockoutRisk);
        }
        analytics.setStockoutRisk(stockoutRisk);
        
        // Déterminer les statuts
        analytics.setIsCritical(stockoutRisk >= 50);
        analytics.setIsOverstocked(stockDays > config.getMaxStockDays());
        analytics.setIsInactive(consumption.dailyAverage == 0 || operations.size() < 5);
        
        logger.info("✅ Analytiques générées pour {}", codeProprietaire);
        return analytics;
    }

    /**
     * Obtient les métriques globales
     */
    @Transactional(readOnly = true)
    public SupplyMetrics getSupplyMetrics(String typeOperation, String pays) {
        logger.info("📊 Calcul des métriques globales");
        
        List<SupplyRecommendation> recommendations = getSupplyRecommendations(typeOperation, pays, 90);
        
        SupplyMetrics metrics = new SupplyMetrics();
        metrics.setTotalAgencies(getEligibleAccountsByIdentifier(pays).size());
        
        // Compter les agences critiques
        long criticalCount = recommendations.stream()
            .filter(r -> "urgent".equals(r.getAlertLevel()))
            .count();
        metrics.setCriticalAgencies((int) criticalCount);
        
        // Compter les commandes par niveau
        long urgentCount = recommendations.stream()
            .filter(r -> "urgent".equals(r.getAlertLevel()))
            .count();
        long normalCount = recommendations.stream()
            .filter(r -> "normal".equals(r.getAlertLevel()))
            .count();
        long lowCount = recommendations.stream()
            .filter(r -> "low".equals(r.getAlertLevel()))
            .count();
        
        metrics.setUrgentOrders((int) urgentCount);
        metrics.setNormalOrders((int) normalCount);
        metrics.setLowPriorityOrders((int) lowCount);
        
        // Calculer les moyennes
        OptionalDouble avgConfidence = recommendations.stream()
            .filter(r -> r.getConfidenceLevel() != null)
            .mapToDouble(SupplyRecommendation::getConfidenceLevel)
            .average();
        metrics.setAverageConfidenceLevel(avgConfidence.isPresent() ? avgConfidence.getAsDouble() : 0.0);
        
        // Top agences critiques
        List<SupplyMetrics.AgencySummary> topCritical = recommendations.stream()
            .filter(r -> r.getDaysUntilStockout() != null && r.getDaysUntilStockout() <= 2)
            .sorted(Comparator.comparing(r -> r.getDaysUntilStockout() != null ? r.getDaysUntilStockout() : Integer.MAX_VALUE))
            .limit(10)
            .map(r -> new SupplyMetrics.AgencySummary(
                r.getCodeProprietaire(),
                r.getAgence(),
                r.getDaysUntilStockout() != null ? r.getDaysUntilStockout().doubleValue() : 0.0,
                r.getTypeOperation()
            ))
            .collect(Collectors.toList());
        metrics.setTopCriticalAgencies(topCritical);
        
        logger.info("✅ Métriques calculées: {} agences totales, {} critiques", 
            metrics.getTotalAgencies(), metrics.getCriticalAgencies());
        return metrics;
    }

    // ============================================
    // MÉTHODES POUR LES COMPENSATIONS
    // ============================================

    /**
     * Obtient les métriques de compensation
     */
    @Transactional(readOnly = true)
    public CompensationMetrics getCompensationMetrics(String typeOperation, Double thresholdAmount, String pays) {
        logger.info("💰 Calcul des métriques de compensation pour type: {}, threshold: {}", typeOperation, thresholdAmount);
        
        LocalDate aujourdhui = LocalDate.now();
        LocalDate dateDebut = aujourdhui.minusDays(90);
        
        Map<String, CompteEntity> eligibleAccounts = getEligibleAccountsByIdentifier(pays);
        
        CompensationMetrics metrics = new CompensationMetrics();
        metrics.setTotalAgencies(eligibleAccounts.size());
        metrics.setAgenciesNeedingCompensation(0);
        metrics.setUrgentCompensations(0);
        metrics.setTotalCompensationAmount(0.0);
        metrics.setAgenciesAboveThreshold(0);
        metrics.setAgenciesBelowThreshold(0);
        
        List<Double> compensationFrequencies = new ArrayList<>();
        
        for (Map.Entry<String, CompteEntity> entry : eligibleAccounts.entrySet()) {
            String primaryIdentifier = entry.getKey();
            CompteEntity compte = entry.getValue();
            String fallbackIdentifier = getCompteFallbackIdentifier(compte, primaryIdentifier);
            try {
                // Récupérer le solde actuel
                Double currentBalance = compte.getSolde() != null ? compte.getSolde() : 0.0;
                
                // Récupérer l'historique des compensations
                List<OperationEntity> compensations = getCompensationHistory(primaryIdentifier, fallbackIdentifier, typeOperation, 90, pays);
                
                // Utiliser le seuil personnalisé si disponible, sinon le seuil global
                Double agencyThreshold = getThresholdForAgency(primaryIdentifier, typeOperation, thresholdAmount);
                
                // Compter par rapport au seuil
                if (currentBalance >= agencyThreshold) {
                    metrics.setAgenciesAboveThreshold(metrics.getAgenciesAboveThreshold() + 1);
                } else {
                    metrics.setAgenciesBelowThreshold(metrics.getAgenciesBelowThreshold() + 1);
                }
                
                if (compensations.size() >= 2) {
                    // Calculer la fréquence moyenne
                    Double frequency = calculateAverageFrequency(compensations);
                    compensationFrequencies.add(frequency);
                    
                    // Calculer le montant moyen
                    Double avgAmount = compensations.stream()
                        .mapToDouble(OperationEntity::getMontant)
                        .average()
                        .orElse(0.0);
                    
                    // Prédire la prochaine compensation
                    LocalDate lastCompDate = compensations.get(0).getDateOperation().toLocalDate();
                    long daysSinceLast = ChronoUnit.DAYS.between(lastCompDate, aujourdhui);
                    
                    // Calculer la croissance quotidienne du solde
                    Double dailyGrowth = calculateDailyConsumption(primaryIdentifier, fallbackIdentifier, typeOperation, pays);
                    
                    // Déterminer si une compensation est nécessaire
                    // Une compensation est déclenchée lorsque le solde atteint ou dépasse le seuil maximum
                    boolean needsCompensation = false;
                    
                    if (currentBalance >= agencyThreshold) {
                        // Le solde a déjà atteint le seuil → compensation nécessaire maintenant
                        needsCompensation = true;
                        metrics.setUrgentCompensations(metrics.getUrgentCompensations() + 1);
                    } else if (dailyGrowth > 0 && agencyThreshold > currentBalance) {
                        // Calculer les jours nécessaires pour que le solde atteigne le seuil
                        long daysUntilThreshold = (long) Math.ceil((agencyThreshold - currentBalance) / dailyGrowth);
                        // Si le seuil peut être atteint dans les 90 prochains jours, compensation nécessaire
                        if (daysUntilThreshold <= 90) {
                            needsCompensation = true;
                            // Si c'est dans les 2 jours, c'est urgent
                            if (daysUntilThreshold <= 2) {
                                metrics.setUrgentCompensations(metrics.getUrgentCompensations() + 1);
                            }
                        }
                    }
                    
                    if (needsCompensation) {
                        metrics.setAgenciesNeedingCompensation(metrics.getAgenciesNeedingCompensation() + 1);
                        metrics.setTotalCompensationAmount(metrics.getTotalCompensationAmount() + avgAmount);
                    }
                }
            } catch (Exception e) {
                logger.error("❌ Erreur lors du calcul pour l'agence {}: {}", primaryIdentifier, e.getMessage());
            }
        }
        
        // Calculer la fréquence moyenne globale
        if (!compensationFrequencies.isEmpty()) {
            Double avgFrequency = compensationFrequencies.stream()
                .mapToDouble(Double::doubleValue)
                .average()
                .orElse(0.0);
            metrics.setAverageCompensationFrequency(avgFrequency);
        } else {
            metrics.setAverageCompensationFrequency(0.0);
        }
        
        // Calculer le montant moyen
        if (metrics.getAgenciesNeedingCompensation() > 0) {
            metrics.setAverageCompensationAmount(
                metrics.getTotalCompensationAmount() / metrics.getAgenciesNeedingCompensation());
        } else {
            metrics.setAverageCompensationAmount(0.0);
        }
        
        logger.info("✅ Métriques de compensation calculées");
        return metrics;
    }

    /**
     * Obtient les recommandations de compensation
     */
    @Transactional(readOnly = true)
    public List<CompensationRecommendation> getCompensationRecommendations(
            String typeOperation, Double thresholdAmount, String pays, Integer analysisDays) {
        
        logger.info("📋 Génération des recommandations de compensation pour type: {}", typeOperation);
        
        LocalDate aujourdhui = LocalDate.now();
        
        Map<String, CompteEntity> eligibleAccounts = getEligibleAccountsByIdentifier(pays);
        
        List<CompensationRecommendation> recommendations = new ArrayList<>();
        
        for (Map.Entry<String, CompteEntity> entry : eligibleAccounts.entrySet()) {
            String primaryIdentifier = entry.getKey();
            CompteEntity compte = entry.getValue();
            String fallbackIdentifier = getCompteFallbackIdentifier(compte, primaryIdentifier);
            try {
                // Récupérer le solde actuel
                Double currentBalance = compte.getSolde() != null ? compte.getSolde() : 0.0;
                
                // Récupérer l'historique des compensations
                List<OperationEntity> compensations = getCompensationHistory(primaryIdentifier, fallbackIdentifier, typeOperation, analysisDays, pays);
                
                if (compensations.size() < 2) {
                    continue; // Pas assez de données pour prédire
                }
                
                // Utiliser le seuil personnalisé si disponible, sinon le seuil global
                Double agencyThreshold = getThresholdForAgency(primaryIdentifier, typeOperation, thresholdAmount);
                
                // Extraire les montants et dates
                List<Double> amounts = compensations.stream()
                    .map(OperationEntity::getMontant)
                    .collect(Collectors.toList());
                List<LocalDate> dates = compensations.stream()
                    .map(op -> op.getDateOperation().toLocalDate())
                    .collect(Collectors.toList());
                
                // Calculer la moyenne des montants
                Double avgAmount = amounts.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
                
                // Calculer la fréquence avec pondération temporelle
                Double weightedFrequency = calculateWeightedFrequency(dates);
                
                // Détection de saisonnalité
                Double seasonalityFactor = detectSeasonality(dates, amounts);
                
                // Calcul de la volatilité
                Double volatility = calculateVolatility(amounts);
                
                // Identification du pattern
                String pattern = identifyPattern(compensations, volatility);
                
                // Prédiction de la date
                // Calculer quand le solde actuel atteindra le seuil maximum
                Double dailyGrowth = calculateDailyConsumption(primaryIdentifier, fallbackIdentifier, typeOperation, pays);
                long daysUntilNext;
                LocalDate predictedDate;
                LocalDate lastCompensation = dates.get(0);
                long daysSinceLast = ChronoUnit.DAYS.between(lastCompensation, aujourdhui);
                
                if (currentBalance >= agencyThreshold) {
                    // Le solde a déjà atteint le seuil → compensation urgente maintenant
                    predictedDate = aujourdhui;
                    daysUntilNext = 0;
                } else if (dailyGrowth > 0 && agencyThreshold > currentBalance) {
                    // Calculer les jours nécessaires pour que le solde atteigne le seuil
                    long daysUntilThreshold = (long) Math.ceil((agencyThreshold - currentBalance) / dailyGrowth);
                    predictedDate = aujourdhui.plusDays(daysUntilThreshold);
                    daysUntilNext = daysUntilThreshold;
                } else {
                    // Si le solde ne croît pas ou ne peut pas atteindre le seuil, utiliser la fréquence historique
                    Double adjustedFrequency = weightedFrequency * seasonalityFactor;
                    daysUntilNext = Math.max(0, adjustedFrequency.longValue() - daysSinceLast);
                    predictedDate = aujourdhui.plusDays(daysUntilNext);
                }
                
                Double thresholdValue = agencyThreshold != null ? agencyThreshold : 0.0;
                Double currentValue = currentBalance != null ? currentBalance : 0.0;
                // Montant à compenser = dépassement actuel du seuil (sinon 0)
                Double recommendedAmount = Math.max(0.0, currentValue - thresholdValue);
                Double overflowRatio = (thresholdValue > 0)
                    ? recommendedAmount / thresholdValue
                    : 0.0;
                
                // Calcul de la confiance
                Double confidence = calculateConfidence(
                    compensations.size(), volatility, pattern, (int) daysSinceLast, weightedFrequency);
                
                // Niveau d'alerte basé sur le dépassement du seuil
                String alertLevel;
                if (recommendedAmount <= 0) {
                    alertLevel = "low";
                } else if (overflowRatio < 0.1) {
                    alertLevel = "normal";
                } else {
                    alertLevel = "urgent";
                }
                
                // Ne générer une recommandation que si le solde atteint ou dépassera le seuil
                if (currentBalance < agencyThreshold && (dailyGrowth <= 0 || predictedDate.isAfter(aujourdhui.plusDays(90)))) {
                    continue; // Pas de recommandation si le solde ne peut pas atteindre le seuil dans un délai raisonnable
                }
                
                // Créer la recommandation
                CompensationRecommendation rec = new CompensationRecommendation();
                rec.setCodeProprietaire(primaryIdentifier);
                rec.setAgence(compte.getAgence() != null && !compte.getAgence().isEmpty() ? compte.getAgence() : primaryIdentifier);
                rec.setCurrentBalance(currentBalance);
                rec.setThresholdAmount(agencyThreshold);
                rec.setPredictedDate(predictedDate);
                rec.setRecommendedAmount(recommendedAmount);
                rec.setAverageCompensationAmount(avgAmount);
                rec.setCompensationFrequencyDays(weightedFrequency);
                rec.setLastCompensationDate(dates.get(0));
                rec.setDaysSinceLastCompensation((int) daysSinceLast);
                rec.setAlertLevel(alertLevel);
                rec.setConfidenceLevel(confidence);
                rec.setCompensationPattern(pattern);
                
                recommendations.add(rec);
            } catch (Exception e) {
                logger.error("❌ Erreur lors du calcul pour l'agence {}: {}", primaryIdentifier, e.getMessage());
            }
        }
        
        // Trier par urgence puis par date prédite
        recommendations.sort((a, b) -> {
            int priorityA = getAlertPriority(a.getAlertLevel());
            int priorityB = getAlertPriority(b.getAlertLevel());
            if (priorityA != priorityB) {
                return Integer.compare(priorityA, priorityB);
            }
            return a.getPredictedDate().compareTo(b.getPredictedDate());
        });
        
        logger.info("✅ {} recommandations de compensation générées", recommendations.size());
        return recommendations;
    }

    /**
     * Obtient le calendrier de compensation
     */
    @Transactional(readOnly = true)
    public SupplyCalendar getCompensationCalendar(String typeOperation, Double thresholdAmount, Integer calendarDays, String pays) {
        logger.info("📅 Génération du calendrier de compensation pour type: {}", typeOperation);
        
        // Obtenir les recommandations
        List<CompensationRecommendation> recommendations = getCompensationRecommendations(
            typeOperation, thresholdAmount, pays, 90);
        
        LocalDate aujourdhui = LocalDate.now();
        LocalDate endDate = aujourdhui.plusDays(calendarDays != null ? calendarDays : 30);
        
        List<SupplyCalendar.CalendarEvent> events = new ArrayList<>();
        int urgentCount = 0;
        int normalCount = 0;
        int lowCount = 0;
        
        for (CompensationRecommendation rec : recommendations) {
            if (rec.getPredictedDate() != null && 
                !rec.getPredictedDate().isBefore(aujourdhui) && 
                !rec.getPredictedDate().isAfter(endDate)) {
                
                SupplyCalendar.CalendarEvent event = new SupplyCalendar.CalendarEvent();
                event.setDate(rec.getPredictedDate().toString());
                event.setCodeProprietaire(rec.getCodeProprietaire());
                event.setAgence(rec.getAgence());
                event.setRecommendedAmount(rec.getRecommendedAmount());
                event.setRecommendedBalance(rec.getRecommendedAmount());
                event.setAlertLevel(rec.getAlertLevel());
                
                events.add(event);
                
                if ("urgent".equals(rec.getAlertLevel())) {
                    urgentCount++;
                } else if ("normal".equals(rec.getAlertLevel())) {
                    normalCount++;
                } else {
                    lowCount++;
                }
            }
        }
        
        // Trier par date
        events.sort(Comparator.comparing(SupplyCalendar.CalendarEvent::getDate));
        
        SupplyCalendar calendar = new SupplyCalendar();
        calendar.setStartDate(aujourdhui);
        calendar.setEndDate(endDate);
        calendar.setTotalDays(calendarDays != null ? calendarDays : 30);
        calendar.setEvents(events);
        calendar.setTotalOrders(events.size());
        calendar.setUrgentOrders(urgentCount);
        calendar.setNormalOrders(normalCount);
        calendar.setLowPriorityOrders(lowCount);
        
        logger.info("✅ Calendrier de compensation généré: {} événements", events.size());
        return calendar;
    }

    /**
     * Obtient les analytiques de compensation pour une agence
     */
    @Transactional(readOnly = true)
    public CompensationAnalytics getCompensationAnalytics(
            String codeProprietaire, String typeOperation, Double thresholdAmount, Integer analysisDays) {
        
        logger.info("🔍 Analyse de compensation pour l'agence: {}", codeProprietaire);
        
        Optional<CompteEntity> compteOpt = resolveCompteByIdentifier(codeProprietaire);
        if (compteOpt.isEmpty()) {
            return null;
        }
        
        CompteEntity compte = compteOpt.get();
        String primaryIdentifier = codeProprietaire;
        String fallbackIdentifier = getCompteFallbackIdentifier(compte, primaryIdentifier);
        Double currentBalance = compte.getSolde() != null ? compte.getSolde() : 0.0;
        
        // Récupérer l'historique des compensations
        List<OperationEntity> compensations = getCompensationHistory(primaryIdentifier, fallbackIdentifier, typeOperation, analysisDays, null);
        
        if (compensations.size() < 2) {
            return null;
        }
        
        // Extraire les montants et dates
        List<Double> amounts = compensations.stream()
            .map(OperationEntity::getMontant)
            .collect(Collectors.toList());
        List<LocalDate> dates = compensations.stream()
            .map(op -> op.getDateOperation().toLocalDate())
            .collect(Collectors.toList());
        
        // Calculs
        Double avgAmount = amounts.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
        
        // Fréquence
        Double avgFrequency = calculateAverageFrequency(compensations);
        
        // Dernière compensation
        LocalDate lastCompDate = dates.get(0);
        LocalDate aujourdhui = LocalDate.now();
        long daysSinceLast = ChronoUnit.DAYS.between(lastCompDate, aujourdhui);
        
        // Prédiction
        LocalDate predictedNext = lastCompDate.plusDays(avgFrequency.longValue());
        
        // Tendance
        String trend = calculateTrend(amounts, dates);
        
        // Volatilité
        Double volatility = calculateVolatility(amounts);
        
        // Saisonnalité
        Double seasonality = detectSeasonality(dates, amounts);
        
        // Niveau de risque
        String riskLevel;
        if (daysSinceLast >= avgFrequency * 0.9) {
            riskLevel = "high";
        } else if (daysSinceLast >= avgFrequency * 0.7) {
            riskLevel = "medium";
        } else {
            riskLevel = "low";
        }
        
        CompensationAnalytics analytics = new CompensationAnalytics();
        analytics.setCodeProprietaire(primaryIdentifier);
        analytics.setAgence(compte.getAgence() != null ? compte.getAgence() : primaryIdentifier);
        analytics.setCurrentBalance(currentBalance);
        analytics.setAverageCompensationAmount(avgAmount);
        analytics.setCompensationFrequencyDays(avgFrequency);
        analytics.setTotalCompensations(compensations.size());
        analytics.setLastCompensationDate(lastCompDate);
        analytics.setDaysSinceLastCompensation((int) daysSinceLast);
        analytics.setPredictedNextCompensation(predictedNext);
        analytics.setCompensationTrend(trend);
        analytics.setVolatility(volatility);
        analytics.setSeasonalityFactor(seasonality);
        analytics.setRiskLevel(riskLevel);
        
        logger.info("✅ Analytiques de compensation générées pour {}", codeProprietaire);
        return analytics;
    }

    // ============================================
    // FONCTIONS UTILITAIRES POUR LES COMPENSATIONS
    // ============================================

    /**
     * Récupère l'historique des compensations pour une agence
     */
    private List<OperationEntity> getCompensationHistory(
            String primaryIdentifier,
            String fallbackIdentifier,
            String typeOperation,
            Integer days,
            String pays) {
        
        LocalDate aujourdhui = LocalDate.now();
        LocalDateTime dateDebut = aujourdhui.minusDays(days != null ? days : 90).atStartOfDay();
        LocalDateTime dateFin = aujourdhui.atTime(23, 59, 59);
        
        List<OperationEntity> operations = findOperationsByIdentifiers(primaryIdentifier, fallbackIdentifier);
        return operations.stream()
            .filter(Objects::nonNull)
            .filter(op -> typeOperation.equals(op.getTypeOperation()))
            .filter(op -> op.getDateOperation().isAfter(dateDebut) && op.getDateOperation().isBefore(dateFin))
            .filter(op -> op.getStatut() == null || !"Annulée".equals(op.getStatut()))
            .filter(op -> pays == null || pays.isEmpty() || (op.getPays() != null && op.getPays().equalsIgnoreCase(pays)))
            .filter(op -> op.getMontant() != null && op.getMontant() > 0) // Seulement les crédits (compensations)
            .sorted(Comparator.comparing(OperationEntity::getDateOperation).reversed())
            .collect(Collectors.toList());
    }

    /**
     * Calcule la croissance quotidienne moyenne du solde
     * Pour les compensations : on veut savoir à quelle vitesse le solde augmente pour atteindre le seuil
     * Croissance = (Total crédits - Total débits) / nombre de jours
     */
    private Double calculateDailyConsumption(String primaryIdentifier, String fallbackIdentifier, String typeOperation, String pays) {
        LocalDate aujourdhui = LocalDate.now();
        LocalDateTime dateDebut = aujourdhui.minusDays(30).atStartOfDay();
        LocalDateTime dateFin = aujourdhui.atTime(23, 59, 59);
        
        List<OperationEntity> transactions = findOperationsByIdentifiers(primaryIdentifier, fallbackIdentifier);
        transactions = transactions.stream()
            .filter(op -> typeOperation.equals(op.getTypeOperation()))
            .filter(op -> op.getDateOperation().isAfter(dateDebut) && op.getDateOperation().isBefore(dateFin))
            .filter(op -> op.getStatut() == null || !"Annulée".equals(op.getStatut()))
            .filter(op -> pays == null || pays.isEmpty() || (op.getPays() != null && op.getPays().equalsIgnoreCase(pays)))
            .collect(Collectors.toList());
        
        if (transactions.isEmpty()) {
            return 0.0;
        }
        
        // Calculer la variation nette quotidienne (crédits - débits)
        // Pour les compensations, on veut la croissance du solde (montants positifs augmentent, négatifs diminuent)
        Double totalVariation = transactions.stream()
            .filter(op -> op.getMontant() != null)
            .mapToDouble(OperationEntity::getMontant)
            .sum();
        
        // Retourner la variation moyenne quotidienne (positive = solde augmente)
        return totalVariation / 30.0;
    }

    /**
     * Calcule la fréquence moyenne entre compensations
     */
    private Double calculateAverageFrequency(List<OperationEntity> compensations) {
        if (compensations.size() < 2) {
            return 0.0;
        }
        
        List<LocalDate> dates = compensations.stream()
            .map(op -> op.getDateOperation().toLocalDate())
            .sorted(Comparator.reverseOrder())
            .collect(Collectors.toList());
        
        List<Long> frequencies = new ArrayList<>();
        for (int i = 0; i < dates.size() - 1; i++) {
            long days = ChronoUnit.DAYS.between(dates.get(i + 1), dates.get(i));
            frequencies.add(days);
        }
        
        return frequencies.stream().mapToLong(Long::longValue).average().orElse(0.0);
    }

    private Map<String, CompteEntity> getEligibleAccountsByIdentifier(String pays) {
        List<String> categories = ELIGIBLE_CATEGORIES.stream()
            .map(String::toLowerCase)
            .collect(Collectors.toList());
        List<CompteEntity> comptes = compteRepository.findByCategorieInIgnoreCase(categories);
        Map<String, CompteEntity> accounts = new LinkedHashMap<>();
        for (CompteEntity compte : comptes) {
            if (compte == null) {
                continue;
            }
            if (pays != null && !pays.isEmpty()) {
                if (compte.getPays() == null || !compte.getPays().equalsIgnoreCase(pays)) {
                    continue;
                }
            }
            String identifier = getCompteIdentifier(compte);
            if (identifier == null || identifier.isEmpty()) {
                continue;
            }
            accounts.putIfAbsent(identifier, compte);
        }
        return accounts;
    }

    private String getCompteIdentifier(CompteEntity compte) {
        if (compte == null) {
            return null;
        }
        if (compte.getNumeroCompte() != null && !compte.getNumeroCompte().isBlank()) {
            return compte.getNumeroCompte().trim();
        }
        if (compte.getCodeProprietaire() != null && !compte.getCodeProprietaire().isBlank()) {
            return compte.getCodeProprietaire().trim();
        }
        return null;
    }

    private String getCompteFallbackIdentifier(CompteEntity compte, String primaryIdentifier) {
        if (compte == null) {
            return null;
        }
        String fallback = compte.getCodeProprietaire();
        if (fallback != null && !fallback.isBlank() && !Objects.equals(fallback.trim(), primaryIdentifier)) {
            return fallback.trim();
        }
        fallback = compte.getNumeroCompte();
        if (fallback != null && !fallback.isBlank() && !Objects.equals(fallback.trim(), primaryIdentifier)) {
            return fallback.trim();
        }
        return null;
    }

    private List<OperationEntity> findOperationsByIdentifiers(String primaryIdentifier, String fallbackIdentifier) {
        List<OperationEntity> operations = new ArrayList<>();
        Set<Long> seenIds = new HashSet<>();
        if (primaryIdentifier != null && !primaryIdentifier.isBlank()) {
            addOperationsIfNotEmpty(operations, operationRepository.findByCodeProprietaire(primaryIdentifier), seenIds);
        }
        if (fallbackIdentifier != null && !fallbackIdentifier.isBlank()) {
            addOperationsIfNotEmpty(operations, operationRepository.findByCodeProprietaire(fallbackIdentifier), seenIds);
        }
        if (operations.isEmpty() && primaryIdentifier != null && !primaryIdentifier.isBlank()) {
            addOperationsIfNotEmpty(operations,
                operationRepository.findByCompteNumeroCompteAndFiltersOrderByDateOperationDesc(primaryIdentifier, null, null, null),
                seenIds);
        }
        if (operations.isEmpty() && fallbackIdentifier != null && !fallbackIdentifier.isBlank()) {
            addOperationsIfNotEmpty(operations,
                operationRepository.findByCompteNumeroCompteAndFiltersOrderByDateOperationDesc(fallbackIdentifier, null, null, null),
                seenIds);
        }
        return operations;
    }

    private void addOperationsIfNotEmpty(List<OperationEntity> target, List<OperationEntity> source, Set<Long> seenIds) {
        if (source == null || source.isEmpty()) {
            return;
        }
        for (OperationEntity operation : source) {
            if (operation == null) {
                continue;
            }
            Long opId = operation.getId();
            if (opId != null) {
                if (!seenIds.add(opId)) {
                    continue;
                }
            }
            target.add(operation);
        }
    }

    private Optional<CompteEntity> resolveCompteByIdentifier(String identifier) {
        if (identifier == null || identifier.isBlank()) {
            return Optional.empty();
        }
        Optional<CompteEntity> byNumero = compteRepository.findByNumeroCompte(identifier);
        if (byNumero.isPresent()) {
            return byNumero;
        }
        List<CompteEntity> byCode = compteRepository.findByCodeProprietaire(identifier);
        if (!byCode.isEmpty()) {
            return Optional.of(byCode.get(0));
        }
        return Optional.empty();
    }

    /**
     * Calcule la fréquence pondérée temporellement
     */
    private Double calculateWeightedFrequency(List<LocalDate> dates) {
        if (dates.size() < 2) {
            return 0.0;
        }
        
        List<Long> frequencies = new ArrayList<>();
        List<Double> weights = new ArrayList<>();
        
        for (int i = 0; i < dates.size() - 1; i++) {
            long freq = ChronoUnit.DAYS.between(dates.get(i + 1), dates.get(i));
            // Poids exponentiel décroissant (plus récent = plus de poids)
            double weight = Math.exp(-0.1 * i);
            frequencies.add(freq);
            weights.add(weight);
        }
        
        double weightedSum = 0.0;
        double totalWeight = 0.0;
        for (int i = 0; i < frequencies.size(); i++) {
            weightedSum += frequencies.get(i) * weights.get(i);
            totalWeight += weights.get(i);
        }
        
        return totalWeight > 0 ? weightedSum / totalWeight : 0.0;
    }

    /**
     * Détecte les patterns saisonniers dans les compensations
     */
    private Double detectSeasonality(List<LocalDate> dates, List<Double> amounts) {
        if (dates.size() < 12) {
            return 1.0;
        }
        
        // Grouper par mois
        Map<Integer, List<Double>> monthlyAmounts = new HashMap<>();
        for (int i = 0; i < dates.size(); i++) {
            int month = dates.get(i).getMonthValue();
            monthlyAmounts.computeIfAbsent(month, k -> new ArrayList<>()).add(amounts.get(i));
        }
        
        // Calculer la moyenne par mois
        Map<Integer, Double> monthlyAverages = new HashMap<>();
        for (Map.Entry<Integer, List<Double>> entry : monthlyAmounts.entrySet()) {
            double avg = entry.getValue().stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
            monthlyAverages.put(entry.getKey(), avg);
        }
        
        // Facteur saisonnier pour le mois actuel
        int currentMonth = LocalDate.now().getMonthValue();
        if (monthlyAverages.containsKey(currentMonth)) {
            double globalAvg = amounts.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
            if (globalAvg > 0) {
                return monthlyAverages.get(currentMonth) / globalAvg;
            }
        }
        
        return 1.0;
    }

    /**
     * Calcule la tendance des montants de compensation
     */
    private String calculateTrend(List<Double> amounts, List<LocalDate> dates) {
        if (amounts.size() < 3) {
            return "stable";
        }
        
        // Régression linéaire simple
        int n = amounts.size();
        double xMean = (n - 1) / 2.0;
        double yMean = amounts.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
        
        double numerator = 0.0;
        double denominator = 0.0;
        for (int i = 0; i < n; i++) {
            double x = i;
            double y = amounts.get(i);
            numerator += (x - xMean) * (y - yMean);
            denominator += Math.pow(x - xMean, 2);
        }
        
        if (denominator == 0) {
            return "stable";
        }
        
        double slope = numerator / denominator;
        
        // Seuil de significativité: 5% de la moyenne
        double threshold = 0.05 * yMean;
        
        if (slope > threshold) {
            return "increasing";
        } else if (slope < -threshold) {
            return "decreasing";
        } else {
            return "stable";
        }
    }

    /**
     * Calcule la volatilité (coefficient de variation)
     */
    private Double calculateVolatility(List<Double> amounts) {
        if (amounts.size() < 2) {
            return 0.0;
        }
        
        double mean = amounts.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
        if (mean == 0) {
            return 0.0;
        }
        
        double variance = amounts.stream()
            .mapToDouble(x -> Math.pow(x - mean, 2))
            .average()
            .orElse(0.0);
        double stdDev = Math.sqrt(variance);
        
        // Coefficient de variation normalisé entre 0 et 1
        double cv = stdDev / mean;
        return Math.min(cv, 1.0);
    }

    /**
     * Identifie le pattern de compensation
     */
    private String identifyPattern(List<OperationEntity> compensations, Double volatility) {
        if (volatility < 0.2) {
            return "regular";
        } else if (volatility > 0.5) {
            return "irregular";
        } else {
            // Vérifier si cyclique
            if (compensations.size() >= 4) {
                List<LocalDate> dates = compensations.stream()
                    .map(op -> op.getDateOperation().toLocalDate())
                    .sorted()
                    .collect(Collectors.toList());
                
                List<Long> frequencies = new ArrayList<>();
                for (int i = 0; i < dates.size() - 1; i++) {
                    frequencies.add(ChronoUnit.DAYS.between(dates.get(i), dates.get(i + 1)));
                }
                
                double freqStd = calculateStdDev(frequencies.stream().mapToDouble(Long::doubleValue).boxed().collect(Collectors.toList()));
                double freqMean = frequencies.stream().mapToLong(Long::longValue).average().orElse(0.0);
                
                if (freqMean > 0 && freqStd / freqMean < 0.3) {
                    return "seasonal";
                }
            }
            return "regular";
        }
    }

    /**
     * Calcule l'écart-type
     */
    private Double calculateStdDev(List<Double> values) {
        if (values.size() < 2) {
            return 0.0;
        }
        
        double mean = values.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
        double variance = values.stream()
            .mapToDouble(x -> Math.pow(x - mean, 2))
            .average()
            .orElse(0.0);
        return Math.sqrt(variance);
    }

    /**
     * Calcule le niveau de confiance de la prédiction
     */
    private Double calculateConfidence(
            int numDataPoints, Double volatility, String pattern, int daysSinceLast, Double avgFrequency) {
        
        // Base de confiance selon le nombre de données
        double baseConfidence;
        if (numDataPoints >= 10) {
            baseConfidence = 0.9;
        } else if (numDataPoints >= 5) {
            baseConfidence = 0.75;
        } else {
            baseConfidence = 0.6;
        }
        
        // Ajustement selon la volatilité
        double volatilityPenalty = volatility * 0.3;
        
        // Ajustement selon le pattern
        double patternBonus = 0.0;
        if ("regular".equals(pattern)) {
            patternBonus = 0.1;
        } else if ("seasonal".equals(pattern)) {
            patternBonus = 0.05;
        } else if ("irregular".equals(pattern)) {
            patternBonus = -0.1;
        }
        
        // Ajustement selon la proximité de la prédiction
        double timeAdjustment = 0.0;
        if (avgFrequency != null && avgFrequency > 0) {
            double timeFactor = Math.min(daysSinceLast / avgFrequency, 1.0);
            timeAdjustment = 0.1 * (1 - timeFactor);
        }
        
        double confidence = baseConfidence - volatilityPenalty + patternBonus + timeAdjustment;
        
        return Math.max(0.0, Math.min(1.0, confidence));
    }

    // ============================================
    // MÉTHODES POUR LA GESTION DES SEUILS PAR AGENCE
    // ============================================

    /**
     * Obtient le seuil personnalisé pour une agence, ou retourne le seuil global si aucun seuil personnalisé n'existe
     */
    public Double getThresholdForAgency(String codeProprietaire, String typeOperation, Double defaultThreshold) {
        Optional<AgencyThresholdEntity> thresholdOpt = agencyThresholdRepository
            .findByCodeProprietaireAndTypeOperation(codeProprietaire, typeOperation);
        
        if (thresholdOpt.isPresent()) {
            logger.debug("Seuil personnalisé trouvé pour {}: {}", codeProprietaire, thresholdOpt.get().getThresholdAmount());
            return thresholdOpt.get().getThresholdAmount();
        }
        
        logger.debug("Utilisation du seuil global pour {}: {}", codeProprietaire, defaultThreshold);
        return defaultThreshold;
    }

    /**
     * Obtient tous les seuils personnalisés pour un type d'opération
     */
    @Transactional(readOnly = true)
    public List<AgencyThresholdResponse> getAgencyThresholds(String typeOperation) {
        List<AgencyThresholdEntity> entities;
        
        if (typeOperation != null && !typeOperation.isEmpty()) {
            entities = agencyThresholdRepository.findByTypeOperation(typeOperation);
        } else {
            entities = agencyThresholdRepository.findAll();
        }
        
        return entities.stream().map(entity -> {
            AgencyThresholdResponse response = new AgencyThresholdResponse();
            response.setId(entity.getId());
            response.setCodeProprietaire(entity.getCodeProprietaire());
            response.setTypeOperation(entity.getTypeOperation());
            response.setThresholdAmount(entity.getThresholdAmount());
            response.setCreatedAt(entity.getCreatedAt());
            response.setUpdatedAt(entity.getUpdatedAt());
            
            // Récupérer le nom de l'agence
            List<CompteEntity> comptes = compteRepository.findByCodeProprietaire(entity.getCodeProprietaire());
            if (!comptes.isEmpty() && comptes.get(0).getAgence() != null) {
                response.setAgence(comptes.get(0).getAgence());
            } else {
                response.setAgence(entity.getCodeProprietaire());
            }
            
            return response;
        }).collect(Collectors.toList());
    }

    /**
     * Obtient le seuil personnalisé pour une agence spécifique
     */
    @Transactional(readOnly = true)
    public AgencyThresholdResponse getAgencyThreshold(String codeProprietaire, String typeOperation) {
        Optional<AgencyThresholdEntity> thresholdOpt = agencyThresholdRepository
            .findByCodeProprietaireAndTypeOperation(codeProprietaire, typeOperation);
        
        if (!thresholdOpt.isPresent()) {
            return null;
        }
        
        AgencyThresholdEntity entity = thresholdOpt.get();
        AgencyThresholdResponse response = new AgencyThresholdResponse();
        response.setId(entity.getId());
        response.setCodeProprietaire(entity.getCodeProprietaire());
        response.setTypeOperation(entity.getTypeOperation());
        response.setThresholdAmount(entity.getThresholdAmount());
        response.setCreatedAt(entity.getCreatedAt());
        response.setUpdatedAt(entity.getUpdatedAt());
        
        // Récupérer le nom de l'agence
        List<CompteEntity> comptes = compteRepository.findByCodeProprietaire(codeProprietaire);
        if (!comptes.isEmpty() && comptes.get(0).getAgence() != null) {
            response.setAgence(comptes.get(0).getAgence());
        } else {
            response.setAgence(codeProprietaire);
        }
        
        return response;
    }

    /**
     * Crée ou met à jour un seuil personnalisé pour une agence
     */
    @Transactional
    public AgencyThresholdResponse saveAgencyThreshold(AgencyThresholdRequest request) {
        Optional<AgencyThresholdEntity> existingOpt = agencyThresholdRepository
            .findByCodeProprietaireAndTypeOperation(request.getCodeProprietaire(), request.getTypeOperation());
        
        AgencyThresholdEntity entity;
        
        if (existingOpt.isPresent()) {
            // Mise à jour
            entity = existingOpt.get();
            entity.setThresholdAmount(request.getThresholdAmount());
            logger.info("Mise à jour du seuil pour {}: {}", request.getCodeProprietaire(), request.getThresholdAmount());
        } else {
            // Création
            entity = new AgencyThresholdEntity(
                request.getCodeProprietaire(),
                request.getTypeOperation(),
                request.getThresholdAmount()
            );
            logger.info("Création du seuil pour {}: {}", request.getCodeProprietaire(), request.getThresholdAmount());
        }
        
        entity = agencyThresholdRepository.save(entity);
        
        AgencyThresholdResponse response = new AgencyThresholdResponse();
        response.setId(entity.getId());
        response.setCodeProprietaire(entity.getCodeProprietaire());
        response.setTypeOperation(entity.getTypeOperation());
        response.setThresholdAmount(entity.getThresholdAmount());
        response.setCreatedAt(entity.getCreatedAt());
        response.setUpdatedAt(entity.getUpdatedAt());
        
        // Récupérer le nom de l'agence
        List<CompteEntity> comptes = compteRepository.findByCodeProprietaire(request.getCodeProprietaire());
        if (!comptes.isEmpty() && comptes.get(0).getAgence() != null) {
            response.setAgence(comptes.get(0).getAgence());
        } else {
            response.setAgence(request.getCodeProprietaire());
        }
        
        return response;
    }

    /**
     * Supprime un seuil personnalisé pour une agence
     */
    @Transactional
    public boolean deleteAgencyThreshold(String codeProprietaire, String typeOperation) {
        Optional<AgencyThresholdEntity> thresholdOpt = agencyThresholdRepository
            .findByCodeProprietaireAndTypeOperation(codeProprietaire, typeOperation);
        
        if (!thresholdOpt.isPresent()) {
            return false;
        }
        
        agencyThresholdRepository.delete(thresholdOpt.get());
        logger.info("Seuil supprimé pour {}: {}", codeProprietaire, typeOperation);
        return true;
    }
}

