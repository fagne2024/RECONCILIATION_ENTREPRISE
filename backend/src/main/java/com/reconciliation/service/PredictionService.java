package com.reconciliation.service;

import com.reconciliation.dto.PredictionRequest;
import com.reconciliation.dto.PredictionResponse;
import com.reconciliation.entity.OperationEntity;
import com.reconciliation.repository.OperationRepository;
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
import java.util.Comparator;

@Service
public class PredictionService {
    private static final Logger logger = LoggerFactory.getLogger(PredictionService.class);

    @Autowired
    private OperationRepository operationRepository;

    /** Règles de calcul configurables (Configuration > Calcul) : prioritaire sur les valeurs codées en dur. */
    @Autowired
    private CalculationRuleService calculationRuleService;

    /**
     * Génère des prédictions pour un type d'opération donné
     */
    @Transactional(readOnly = true)
    public PredictionResponse predict(PredictionRequest request) {
        try {
            logger.info("🎯 Génération de prédiction pour type: {}, horizon: {} jours", 
                request.getTypeOperation(), request.getHorizonJours());
            
            // Validation
            if (request.getTypeOperation() == null || request.getTypeOperation().isEmpty()) {
                throw new IllegalArgumentException("Le type d'opération est requis");
            }
            
            // Calculer les dates
            LocalDate aujourdhui = LocalDate.now();
            LocalDateTime dateDebutAnalyse = aujourdhui.minusDays(request.getPeriodeAnalyseJours()).atStartOfDay();
            LocalDateTime dateFinAnalyse = aujourdhui.atTime(23, 59, 59);
            LocalDate dateDebutPrediction = aujourdhui.plusDays(1);
            LocalDate dateFinPrediction = aujourdhui.plusDays(request.getHorizonJours());
            
            // Récupérer les données historiques
            List<OperationEntity> operationsHistoriques = getOperationsHistoriques(
                request.getTypeOperation(),
                request.getCodeProprietaire(),
                request.getService(),
                request.getPays(),
                dateDebutAnalyse,
                dateFinAnalyse
            );
            
            logger.info("📊 {} opérations historiques trouvées pour l'analyse", operationsHistoriques.size());
            
            if (operationsHistoriques.isEmpty()) {
                return createEmptyPrediction(request, dateDebutPrediction, dateFinPrediction, 
                    "Aucune donnée historique disponible pour ce type d'opération");
            }
            
            // Calculer les statistiques historiques
            Map<String, Object> stats = calculerStatistiquesHistoriques(operationsHistoriques);
            // Ajouter le type d'opération dans les stats pour les calculs de solde
            stats.put("typeOperation", request.getTypeOperation());
            
            // Générer les prédictions selon la méthode choisie
            List<PredictionResponse.PredictionJour> predictions = genererPredictions(
                operationsHistoriques,
                dateDebutPrediction,
                dateFinPrediction,
                request.getMethodePrediction(),
                stats
            );
            
            // Créer la réponse
            PredictionResponse response = new PredictionResponse();
            response.setTypeOperation(request.getTypeOperation());
            response.setDateDebutPrediction(dateDebutPrediction);
            response.setDateFinPrediction(dateFinPrediction);
            response.setHorizonJours(request.getHorizonJours());
            response.setMethodePrediction(request.getMethodePrediction());
            response.setPredictionsParJour(predictions);
            response.setStatistiquesHistoriques(stats);
            
            // Calculer les statistiques globales
            calculerStatistiquesGlobales(response, predictions);
            
            // Calculer la confiance
            response.setConfiance(calculerConfiance(operationsHistoriques, stats));
            
            logger.info("✅ Prédiction générée: {} jours, montant total: {}, confiance: {}%",
                response.getHorizonJours(),
                response.getMontantTotalPrediction() != null ? response.getMontantTotalPrediction() : 0.0,
                String.format("%.2f", response.getConfiance() != null ? response.getConfiance() * 100 : 0.0));
            
            return response;
        } catch (IllegalArgumentException e) {
            logger.error("❌ Erreur de validation: {}", e.getMessage(), e);
            throw e;
        } catch (Exception e) {
            logger.error("❌ Erreur inattendue lors de la génération de la prédiction: {}", e.getMessage(), e);
            e.printStackTrace();
            throw new RuntimeException("Erreur lors de la génération de la prédiction: " + e.getMessage(), e);
        }
    }

    /**
     * Récupère les opérations historiques selon les critères
     */
    private List<OperationEntity> getOperationsHistoriques(
        String typeOperation,
        String codeProprietaire,
        String service,
        String pays,
        LocalDateTime dateDebut,
        LocalDateTime dateFin) {
        
        List<OperationEntity> operations = operationRepository.findByDateOperationBetween(dateDebut, dateFin);
        
        return operations.stream()
            .filter(op -> typeOperation.equals(op.getTypeOperation()))
            .filter(op -> codeProprietaire == null || codeProprietaire.isEmpty() || 
                         codeProprietaire.equals(op.getCodeProprietaire()))
            .filter(op -> service == null || service.isEmpty() || 
                         service.equals(op.getService()))
            .filter(op -> pays == null || pays.isEmpty() || 
                         pays.equals(op.getPays()))
            .filter(op -> op.getStatut() == null || !"Annulée".equals(op.getStatut()))
            .collect(Collectors.toList());
    }

    /**
     * Calcule les statistiques historiques
     */
    private Map<String, Object> calculerStatistiquesHistoriques(List<OperationEntity> operations) {
        Map<String, Object> stats = new HashMap<>();
        
        if (operations.isEmpty()) {
            return stats;
        }
        
        // Montants
        List<Double> montants = operations.stream()
            .filter(op -> op.getMontant() != null)
            .map(OperationEntity::getMontant)
            .collect(Collectors.toList());
        
        if (!montants.isEmpty()) {
            double somme = montants.stream().mapToDouble(Double::doubleValue).sum();
            double moyenne = somme / montants.size();
            double min = montants.stream().mapToDouble(Double::doubleValue).min().orElse(0.0);
            double max = montants.stream().mapToDouble(Double::doubleValue).max().orElse(0.0);
            
            // Calcul de l'écart-type
            double variance = montants.stream()
                .mapToDouble(m -> Math.pow(m - moyenne, 2))
                .average()
                .orElse(0.0);
            double ecartType = Math.sqrt(variance);
            
            stats.put("montantTotal", somme);
            stats.put("montantMoyen", moyenne);
            stats.put("montantMin", min);
            stats.put("montantMax", max);
            stats.put("montantEcartType", ecartType);
            stats.put("nombreOperations", montants.size());
        }
        
        // Fréquence
        Map<LocalDate, Long> operationsParJour = operations.stream()
            .filter(op -> op.getDateOperation() != null)
            .collect(Collectors.groupingBy(
                op -> op.getDateOperation().toLocalDate(),
                Collectors.counting()
            ));
        
        double frequenceMoyenne = operationsParJour.size() > 0 
            ? (double) operations.size() / operationsParJour.size()
            : 0.0;
        
        stats.put("frequenceMoyenne", frequenceMoyenne);
        stats.put("joursAvecOperations", operationsParJour.size());
        
        // Analyse par jour de la semaine
        Map<String, List<Double>> montantsParJourSemaine = new HashMap<>();
        Map<String, Integer> frequencesParJourSemaine = new HashMap<>();
        
        for (OperationEntity op : operations) {
            if (op.getDateOperation() == null || op.getMontant() == null) {
                continue;
            }
            String jourSemaine = op.getDateOperation().getDayOfWeek().toString();
            montantsParJourSemaine.computeIfAbsent(jourSemaine, k -> new ArrayList<>()).add(op.getMontant());
            frequencesParJourSemaine.put(jourSemaine, frequencesParJourSemaine.getOrDefault(jourSemaine, 0) + 1);
        }
        
        Map<String, Double> moyenneParJourSemaine = new HashMap<>();
        for (Map.Entry<String, List<Double>> entry : montantsParJourSemaine.entrySet()) {
            double moyenne = entry.getValue().stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
            moyenneParJourSemaine.put(entry.getKey(), moyenne);
        }
        
        stats.put("montantMoyenParJourSemaine", moyenneParJourSemaine);
        stats.put("frequenceParJourSemaine", frequencesParJourSemaine);
        
        // Tendances temporelles
        Map<LocalDate, Double> montantsParDate = operations.stream()
            .filter(op -> op.getDateOperation() != null && op.getMontant() != null)
            .collect(Collectors.groupingBy(
                op -> op.getDateOperation().toLocalDate(),
                Collectors.summingDouble(OperationEntity::getMontant)
            ));
        
        List<LocalDate> dates = new ArrayList<>(montantsParDate.keySet());
        Collections.sort(dates);
        
        if (dates.size() >= 2) {
            // Calcul de la tendance (pente linéaire)
            double[] tendance = calculerTendanceLineaire(dates, montantsParDate);
            stats.put("tendancePente", tendance[0]); // Pente
            stats.put("tendanceIntercept", tendance[1]); // Intercept
        }
        
        // Période de référence
        if (!dates.isEmpty()) {
            stats.put("datePremiereOperation", dates.get(0));
            stats.put("dateDerniereOperation", dates.get(dates.size() - 1));
            long joursAnalyse = ChronoUnit.DAYS.between(dates.get(0), dates.get(dates.size() - 1)) + 1;
            stats.put("nombreJoursAnalyse", joursAnalyse);
        }
        
        // Statistiques sur les soldes (pour les opérations avec solde_avant et solde_apres)
        List<Double> soldesAvant = operations.stream()
            .filter(op -> op.getSoldeAvant() != null)
            .map(OperationEntity::getSoldeAvant)
            .collect(Collectors.toList());
        
        List<Double> soldesApres = operations.stream()
            .filter(op -> op.getSoldeApres() != null)
            .map(OperationEntity::getSoldeApres)
            .collect(Collectors.toList());
        
        if (!soldesAvant.isEmpty() && !soldesApres.isEmpty()) {
            // Solde moyen avant
            double soldeMoyenAvant = soldesAvant.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
            stats.put("soldeMoyenAvant", soldeMoyenAvant);
            
            // Solde moyen après
            double soldeMoyenApres = soldesApres.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
            stats.put("soldeMoyenApres", soldeMoyenApres);
            
            // Solde final (dernière opération)
            OperationEntity derniereOperation = operations.stream()
                .filter(op -> op.getDateOperation() != null && op.getSoldeApres() != null)
                .max(Comparator.comparing(OperationEntity::getDateOperation))
                .orElse(null);
            
            if (derniereOperation != null) {
                stats.put("soldeFinal", derniereOperation.getSoldeApres());
                stats.put("dateDernierSolde", derniereOperation.getDateOperation().toLocalDate());
            }
        }
        
        // Analyser les seuils de déclenchement (solde AVANT chaque opération)
        analyserSeuilsDeclenchement(operations, stats);
        
        return stats;
    }

    /**
     * Analyse les seuils de déclenchement des opérations basés sur le solde
     * Identifie le solde moyen/min/max AVANT chaque compense/appro
     */
    private void analyserSeuilsDeclenchement(List<OperationEntity> operations, Map<String, Object> stats) {
        // Filtrer les opérations avec solde_avant valide
        List<OperationEntity> operationsAvecSolde = operations.stream()
            .filter(op -> op.getSoldeAvant() != null && op.getMontant() != null)
            .sorted(Comparator.comparing(OperationEntity::getDateOperation))
            .collect(Collectors.toList());
        
        if (operationsAvecSolde.isEmpty()) {
            logger.warn("⚠️ Aucune opération avec solde_avant disponible pour l'analyse des seuils");
            return;
        }
        
        // Extraire les seuils (soldes avant) par type d'opération
        Map<String, List<Double>> seuilsParType = new HashMap<>();
        
        for (OperationEntity op : operationsAvecSolde) {
            String type = op.getTypeOperation();
            if (type != null) {
                seuilsParType.computeIfAbsent(type, k -> new ArrayList<>()).add(op.getSoldeAvant());
            }
        }
        
        // Calculer les statistiques des seuils pour le type d'opération analysé
        String typeOperation = (String) stats.get("typeOperation");
        if (typeOperation != null && seuilsParType.containsKey(typeOperation)) {
            List<Double> seuils = seuilsParType.get(typeOperation);
            
            if (!seuils.isEmpty()) {
                double seuilMoyen = seuils.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
                double seuilMin = seuils.stream().mapToDouble(Double::doubleValue).min().orElse(0.0);
                double seuilMax = seuils.stream().mapToDouble(Double::doubleValue).max().orElse(0.0);
                
                // Calculer l'écart-type pour mesurer la régularité
                double variance = seuils.stream()
                    .mapToDouble(s -> Math.pow(s - seuilMoyen, 2))
                    .average()
                    .orElse(0.0);
                double ecartType = Math.sqrt(variance);
                
                stats.put("seuilDeclenchementMoyen", seuilMoyen);
                stats.put("seuilDeclenchementMin", seuilMin);
                stats.put("seuilDeclenchementMax", seuilMax);
                stats.put("seuilDeclenchementEcartType", ecartType);
                stats.put("nombreOccurrencesSeuil", seuils.size());
                
                logger.info("📊 Seuils de déclenchement pour {}: Moyen={}, Min={}, Max={}, Écart-type={}", 
                    typeOperation, seuilMoyen, seuilMin, seuilMax, ecartType);
            }
        }
        
        // Analyser l'évolution du solde entre les opérations pour comprendre les patterns
        analyserEvolutionSolde(operationsAvecSolde, stats);
    }
    
    /**
     * Analyse l'évolution du solde entre les opérations pour comprendre les patterns
     */
    private void analyserEvolutionSolde(List<OperationEntity> operationsAvecSolde, Map<String, Object> stats) {
        if (operationsAvecSolde.size() < 2) {
            return;
        }
        
        // Calculer les variations de solde entre opérations consécutives
        List<Double> variations = new ArrayList<>();
        List<Double> dureesEntreOperations = new ArrayList<>();
        
        for (int i = 1; i < operationsAvecSolde.size(); i++) {
            OperationEntity opPrecedente = operationsAvecSolde.get(i - 1);
            OperationEntity opCourante = operationsAvecSolde.get(i);
            
            if (opPrecedente.getSoldeApres() != null && opCourante.getSoldeAvant() != null) {
                // Variation entre le solde après la précédente et le solde avant la courante
                double variation = opCourante.getSoldeAvant() - opPrecedente.getSoldeApres();
                variations.add(variation);
                
                // Calculer la durée entre les opérations
                if (opPrecedente.getDateOperation() != null && opCourante.getDateOperation() != null) {
                    long jours = ChronoUnit.DAYS.between(
                        opPrecedente.getDateOperation().toLocalDate(),
                        opCourante.getDateOperation().toLocalDate()
                    );
                    if (jours > 0) {
                        dureesEntreOperations.add((double) jours);
                    }
                }
            }
        }
        
        if (!variations.isEmpty()) {
            double variationMoyenne = variations.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
            double variationParJour = 0.0;
            
            if (!dureesEntreOperations.isEmpty()) {
                double dureeMoyenne = dureesEntreOperations.stream().mapToDouble(Double::doubleValue).average().orElse(1.0);
                variationParJour = variationMoyenne / dureeMoyenne;
            }
            
            stats.put("variationSoldeMoyenne", variationMoyenne);
            stats.put("variationSoldeParJour", variationParJour);
            
            logger.info("📈 Évolution du solde: Variation moyenne={}, Variation/jour={}", 
                variationMoyenne, variationParJour);
        }
    }

    /**
     * Calcule la tendance linéaire (régression linéaire simple)
     */
    private double[] calculerTendanceLineaire(List<LocalDate> dates, Map<LocalDate, Double> montants) {
        int n = dates.size();
        double sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        
        LocalDate dateMin = dates.get(0);
        
        for (LocalDate date : dates) {
            long x = ChronoUnit.DAYS.between(dateMin, date);
            double y = montants.get(date);
            
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
        }
        
        double pente = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        double intercept = (sumY - pente * sumX) / n;
        
        return new double[]{pente, intercept};
    }

    /**
     * Génère les prédictions selon la méthode choisie avec calcul des soldes
     * Utilise les seuils de déclenchement pour prédire quand les opérations se produiront
     */
    private List<PredictionResponse.PredictionJour> genererPredictions(
        List<OperationEntity> operationsHistoriques,
        LocalDate dateDebut,
        LocalDate dateFin,
        String methode,
        Map<String, Object> stats) {
        
        List<PredictionResponse.PredictionJour> predictions = new ArrayList<>();
        
        // Calculer le solde initial (solde après la dernière opération historique)
        double soldeInitial = calculerSoldeInitial(operationsHistoriques, stats);
        
        // Récupérer les seuils de déclenchement
        Double seuilDeclenchementMoyen = (Double) stats.get("seuilDeclenchementMoyen");
        Double variationSoldeParJour = (Double) stats.get("variationSoldeParJour");
        
        // Si on a des seuils, utiliser la logique basée sur les seuils
        boolean utiliserSeuils = seuilDeclenchementMoyen != null && variationSoldeParJour != null;
        
        if (utiliserSeuils) {
            // Utiliser la logique basée sur les seuils
            predictions = genererPredictionsAvecSeuils(
                dateDebut, dateFin, stats, soldeInitial, seuilDeclenchementMoyen, variationSoldeParJour);
        } else {
            // Sinon, utiliser la méthode classique avec prédictions basées sur la fréquence
            predictions = genererPredictionsParFrequence(
                dateDebut, dateFin, stats, soldeInitial, methode, operationsHistoriques);
        }
        
        return predictions;
    }
    
    /**
     * Génère les prédictions en utilisant les seuils de déclenchement
     * Simule l'évolution du solde et prédit seulement les jours où des opérations sont attendues
     * basé sur la fréquence moyenne
     */
    private List<PredictionResponse.PredictionJour> genererPredictionsAvecSeuils(
        LocalDate dateDebut,
        LocalDate dateFin,
        Map<String, Object> stats,
        double soldeInitial,
        double seuilDeclenchementMoyen,
        double variationSoldeParJour) {
        
        List<PredictionResponse.PredictionJour> predictions = new ArrayList<>();
        
        Double montantMoyen = (Double) stats.get("montantMoyen");
        Double frequenceMoyenne = (Double) stats.get("frequenceMoyenne");
        String typeOperation = (String) stats.get("typeOperation");
        
        if (montantMoyen == null) {
            montantMoyen = 0.0;
        }
        if (frequenceMoyenne == null || frequenceMoyenne <= 0) {
            frequenceMoyenne = 1.0;
        }
        
        // Calculer l'intervalle entre les opérations (en jours)
        // Si fréquence = 0.5 op/jour, cela signifie 1 opération tous les 2 jours
        double intervalleJours = 1.0 / frequenceMoyenne;
        
        // Calculer le nombre total d'opérations attendues sur la période
        long totalJours = ChronoUnit.DAYS.between(dateDebut, dateFin) + 1;
        int nombreOperationsAttendues = (int) Math.round(totalJours * frequenceMoyenne);
        
        LocalDate dateCourante = dateDebut;
        double soldeCourant = soldeInitial;
        LocalDate prochaineDateOperation = dateDebut;
        int operationsGenerees = 0;
        
        // Déterminer si c'est une compense (débit) ou un appro (crédit)
        // Classification pilotée par les règles de calcul (repli : valeurs codées en dur).
        boolean estCompense = calculationRuleService.matchesAny(typeOperation, "BANQUE.TYPES_COMPENSATION",
                CalculationRuleService.DEFAULT_TYPES_COMPENSATION);
        boolean estAppro = calculationRuleService.matchesAny(typeOperation, "BANQUE.TYPES_APPROVISIONNEMENT",
                CalculationRuleService.DEFAULT_TYPES_APPROVISIONNEMENT);
        
        // Simuler l'évolution du solde jour après jour
        while (!dateCourante.isAfter(dateFin) && operationsGenerees < nombreOperationsAttendues) {
            // Simuler l'évolution du solde jusqu'à la prochaine date d'opération
            while (!dateCourante.isAfter(dateFin) && dateCourante.isBefore(prochaineDateOperation)) {
                soldeCourant = soldeCourant + variationSoldeParJour;
                dateCourante = dateCourante.plusDays(1);
            }
            
            // Si on a atteint ou dépassé la date d'opération prévue
            if (!dateCourante.isAfter(dateFin) && !dateCourante.isBefore(prochaineDateOperation)) {
                double soldeAvantJour = soldeCourant;
                
                // Vérifier si le seuil est atteint pour déclencher une opération
                boolean seuilAtteint = false;
                
                if (estCompense) {
                    // Pour les compensations : déclencher quand le solde est >= seuil (solde trop élevé)
                    seuilAtteint = soldeCourant >= seuilDeclenchementMoyen;
                } else if (estAppro) {
                    // Pour les approvisionnements : déclencher quand le solde est <= seuil (solde trop bas)
                    seuilAtteint = soldeCourant <= seuilDeclenchementMoyen;
                } else {
                    // Pour les autres types, utiliser le seuil comme indicateur
                    double tolerance = Math.abs(seuilDeclenchementMoyen * 0.1); // 10% de tolérance
                    seuilAtteint = Math.abs(soldeCourant - seuilDeclenchementMoyen) <= tolerance;
                }
                
                // Si le seuil est atteint OU si c'est le moment basé sur la fréquence (même si seuil pas atteint)
                if (seuilAtteint || operationsGenerees < nombreOperationsAttendues) {
                    double montantPrediction = montantMoyen;
                    int nombreOperations = 1; // Généralement 1 opération par jour prédit
                    
                    // Calculer l'impact sur le solde
                    double impact = calculerImpactSolde(typeOperation, montantMoyen);
                    double soldeApres = soldeAvantJour + impact;
                    
                    // Créer la prédiction pour ce jour
                    PredictionResponse.PredictionJour prediction = new PredictionResponse.PredictionJour(
                        dateCourante,
                        montantPrediction,
                        nombreOperations,
                        0.7, // Confiance élevée car basée sur seuils et fréquence
                        soldeAvantJour,
                        soldeApres
                    );
                    
                    predictions.add(prediction);
                    soldeCourant = soldeApres;
                    operationsGenerees++;
                    
                    // Calculer la prochaine date d'opération
                    long joursAjouter = Math.max(1, Math.round(intervalleJours));
                    prochaineDateOperation = dateCourante.plusDays(joursAjouter);
                    dateCourante = dateCourante.plusDays(1);
                } else {
                    // Le seuil n'est pas atteint et on a déjà assez d'opérations
                    // Ajuster la prochaine date pour retenter plus tard
                    prochaineDateOperation = dateCourante.plusDays(1);
                    dateCourante = dateCourante.plusDays(1);
                }
            } else {
                // On n'a pas encore atteint la date d'opération, continuer
                dateCourante = dateCourante.plusDays(1);
            }
        }
        
        logger.info("✅ Prédictions avec seuils générées: {} opérations sur {} jours, solde initial={}, seuil={}, variation/jour={}, intervalle={} jours", 
            predictions.size(), totalJours, soldeInitial, seuilDeclenchementMoyen, variationSoldeParJour, intervalleJours);
        
        return predictions;
    }
    
    /**
     * Génère les prédictions basées sur la fréquence (méthodes classiques)
     * Ne génère des prédictions que pour les jours où des opérations sont attendues
     */
    private List<PredictionResponse.PredictionJour> genererPredictionsParFrequence(
        LocalDate dateDebut,
        LocalDate dateFin,
        Map<String, Object> stats,
        double soldeInitial,
        String methode,
        List<OperationEntity> operationsHistoriques) {
        
        List<PredictionResponse.PredictionJour> predictions = new ArrayList<>();
        
        Double frequenceMoyenne = (Double) stats.get("frequenceMoyenne");
        if (frequenceMoyenne == null || frequenceMoyenne <= 0) {
            frequenceMoyenne = 1.0;
        }
        
        // Calculer l'intervalle entre les opérations (en jours)
        double intervalleJours = 1.0 / frequenceMoyenne;
        
        // Calculer le nombre total d'opérations attendues sur la période
        long totalJours = ChronoUnit.DAYS.between(dateDebut, dateFin) + 1;
        int nombreOperationsAttendues = (int) Math.round(totalJours * frequenceMoyenne);
        
        LocalDate dateCourante = dateDebut;
        double soldeCourant = soldeInitial;
        int operationsGenerees = 0;
        
        // Calculer la prochaine date d'opération basée sur l'intervalle
        LocalDate prochaineDateOperation = dateDebut;
        
        while (!dateCourante.isAfter(dateFin) && operationsGenerees < nombreOperationsAttendues) {
            // Si on a atteint la date d'opération prévue
            if (!dateCourante.isBefore(prochaineDateOperation) && !dateCourante.isAfter(dateFin)) {
                PredictionResponse.PredictionJour prediction = null;
                
                switch (methode.toLowerCase()) {
                    case "moyenne":
                        prediction = predireParMoyenne(dateCourante, stats, soldeCourant);
                        break;
                    case "tendance":
                        prediction = predireParTendance(dateCourante, stats, operationsHistoriques, soldeCourant);
                        break;
                    case "saisonnier":
                        prediction = predireParSaisonnier(dateCourante, stats, operationsHistoriques, soldeCourant);
                        break;
                    default:
                        prediction = predireParTendance(dateCourante, stats, operationsHistoriques, soldeCourant);
                }
                
                if (prediction != null && prediction.getNombreOperationsPredites() > 0) {
                    soldeCourant = prediction.getSoldeApresPrediction() != null 
                        ? prediction.getSoldeApresPrediction() 
                        : soldeCourant;
                    
                    predictions.add(prediction);
                    operationsGenerees++;
                    
                    // Calculer la prochaine date d'opération
                    long joursAjouter = Math.max(1, Math.round(intervalleJours));
                    prochaineDateOperation = dateCourante.plusDays(joursAjouter);
                } else {
                    // Pas d'opération prévue, avancer la prochaine date
                    prochaineDateOperation = dateCourante.plusDays(1);
                }
            }
            
            dateCourante = dateCourante.plusDays(1);
        }
        
        logger.info("✅ Prédictions par fréquence générées: {} opérations sur {} jours (méthode: {}), intervalle={} jours", 
            predictions.size(), totalJours, methode, intervalleJours);
        
        return predictions;
    }
    
    /**
     * Calcule le solde initial à partir des opérations historiques
     */
    private double calculerSoldeInitial(List<OperationEntity> operations, Map<String, Object> stats) {
        // Essayer d'obtenir le solde final de la dernière opération
        Double soldeFinal = (Double) stats.get("soldeFinal");
        if (soldeFinal != null) {
            return soldeFinal;
        }
        
        // Sinon, trouver la dernière opération avec un solde après
        Optional<OperationEntity> derniereOp = operations.stream()
            .filter(op -> op.getSoldeApres() != null && op.getDateOperation() != null)
            .max(Comparator.comparing(OperationEntity::getDateOperation));
        
        if (derniereOp.isPresent()) {
            return derniereOp.get().getSoldeApres();
        }
        
        // Par défaut, utiliser le solde moyen après
        Double soldeMoyenApres = (Double) stats.get("soldeMoyenApres");
        return soldeMoyenApres != null ? soldeMoyenApres : 0.0;
    }
    
    /**
     * Calcule l'impact d'une opération sur le solde selon son type
     */
    private double calculerImpactSolde(String typeOperation, double montant) {
        if (typeOperation == null) {
            return 0.0;
        }
        
        // Opérations de crédit (augmentent le solde)
        // Classification pilotée par les règles de calcul (repli : valeurs codées en dur).
        if (calculationRuleService.matchesAny(typeOperation, "BANQUE.TYPES_APPROVISIONNEMENT",
                CalculationRuleService.DEFAULT_TYPES_APPROVISIONNEMENT)) {
            return montant; // Crédit
        }
        
        // Opérations de débit (diminuent le solde)
        if (calculationRuleService.matchesAny(typeOperation, "BANQUE.TYPES_COMPENSATION",
                CalculationRuleService.DEFAULT_TYPES_COMPENSATION)) {
            return -montant; // Débit
        }
        
        // Nivellement : le signe du montant détermine l'impact
        if (calculationRuleService.matchesAny(typeOperation, "BANQUE.TYPES_NIVELLEMENT",
                CalculationRuleService.DEFAULT_TYPES_NIVELLEMENT)) {
            return montant; // Peut être positif ou négatif selon le montant
        }
        
        // Par défaut, pas d'impact
        return 0.0;
    }

    /**
     * Prédiction basée sur la moyenne simple avec calcul des soldes
     */
    private PredictionResponse.PredictionJour predireParMoyenne(LocalDate date, Map<String, Object> stats, double soldeAvant) {
        Double montantMoyen = (Double) stats.get("montantMoyen");
        Double frequenceMoyenne = (Double) stats.get("frequenceMoyenne");
        
        if (montantMoyen == null || frequenceMoyenne == null) {
            return new PredictionResponse.PredictionJour(date, 0.0, 0, 0.5, soldeAvant, soldeAvant);
        }
        
        double montantPrediction = montantMoyen * frequenceMoyenne;
        int nombreOperations = (int) Math.round(frequenceMoyenne);
        
        // Calculer l'impact sur le solde (on utilise le type d'opération depuis les stats)
        String typeOperation = (String) stats.get("typeOperation");
        if (typeOperation == null && !stats.isEmpty()) {
            // Essayer de récupérer le type depuis les opérations historiques
            // Pour l'instant, on suppose que c'est le même type que celui demandé
        }
        
        // Pour le calcul, on utilise le montant moyen par opération
        double impactParOperation = calculerImpactSolde(typeOperation != null ? typeOperation : "", montantMoyen);
        double impactTotal = impactParOperation * frequenceMoyenne;
        double soldeApres = soldeAvant + impactTotal;
        
        return new PredictionResponse.PredictionJour(date, montantPrediction, nombreOperations, 0.5, soldeAvant, soldeApres);
    }

    /**
     * Prédiction basée sur la tendance linéaire avec calcul des soldes
     */
    private PredictionResponse.PredictionJour predireParTendance(
        LocalDate date,
        Map<String, Object> stats,
        List<OperationEntity> operations,
        double soldeAvant) {
        
        Double montantMoyen = (Double) stats.get("montantMoyen");
        Double frequenceMoyenne = (Double) stats.get("frequenceMoyenne");
        Double pente = (Double) stats.get("tendancePente");
        Double intercept = (Double) stats.get("tendanceIntercept");
        LocalDate dateDerniereOperation = (LocalDate) stats.get("dateDerniereOperation");
        String typeOperation = (String) stats.get("typeOperation");
        
        if (montantMoyen == null || frequenceMoyenne == null) {
            return new PredictionResponse.PredictionJour(date, 0.0, 0, 0.5, soldeAvant, soldeAvant);
        }
        
        // Calculer le montant basé sur la tendance
        double montantPrediction = montantMoyen;
        
        if (pente != null && intercept != null && dateDerniereOperation != null) {
            long joursDepuisDerniereOperation = ChronoUnit.DAYS.between(dateDerniereOperation, date);
            montantPrediction = pente * joursDepuisDerniereOperation + intercept;
            
            // Ne pas permettre de valeurs négatives
            if (montantPrediction < 0) {
                montantPrediction = montantMoyen * 0.5; // Utiliser 50% de la moyenne si négatif
            }
        }
        
        // Ajuster avec la fréquence moyenne
        double montantParOperation = montantPrediction / frequenceMoyenne;
        montantPrediction = montantParOperation * frequenceMoyenne;
        int nombreOperations = (int) Math.round(frequenceMoyenne);
        
        // Calculer l'impact sur le solde
        double impactParOperation = calculerImpactSolde(typeOperation != null ? typeOperation : "", montantParOperation);
        double impactTotal = impactParOperation * frequenceMoyenne;
        double soldeApres = soldeAvant + impactTotal;
        
        // Confiance basée sur la quantité de données
        double confiance = Math.min(0.9, 0.5 + (operations.size() / 1000.0) * 0.4);
        
        return new PredictionResponse.PredictionJour(date, montantPrediction, nombreOperations, confiance, soldeAvant, soldeApres);
    }

    /**
     * Prédiction basée sur les patterns saisonniers (jour de la semaine) avec calcul des soldes
     */
    private PredictionResponse.PredictionJour predireParSaisonnier(
        LocalDate date,
        Map<String, Object> stats,
        List<OperationEntity> operations,
        double soldeAvant) {
        
        String jourSemaine = date.getDayOfWeek().toString();
        @SuppressWarnings("unchecked")
        Map<String, Double> moyenneParJourSemaine = (Map<String, Double>) stats.get("montantMoyenParJourSemaine");
        @SuppressWarnings("unchecked")
        Map<String, Integer> frequenceParJourSemaine = (Map<String, Integer>) stats.get("frequenceParJourSemaine");
        
        Double montantMoyen = (Double) stats.get("montantMoyen");
        Double frequenceMoyenne = (Double) stats.get("frequenceMoyenne");
        String typeOperation = (String) stats.get("typeOperation");
        
        double montantParOperation;
        int nombreOperations;
        
        // Utiliser la moyenne du jour de la semaine si disponible, sinon la moyenne globale
        if (moyenneParJourSemaine != null && moyenneParJourSemaine.containsKey(jourSemaine)) {
            montantParOperation = moyenneParJourSemaine.get(jourSemaine);
        } else if (montantMoyen != null) {
            montantParOperation = montantMoyen;
        } else {
            montantParOperation = 0.0;
        }
        
        // Utiliser la fréquence du jour de la semaine si disponible
        if (frequenceParJourSemaine != null && frequenceParJourSemaine.containsKey(jourSemaine)) {
            nombreOperations = frequenceParJourSemaine.get(jourSemaine);
        } else if (frequenceMoyenne != null) {
            nombreOperations = (int) Math.round(frequenceMoyenne);
        } else {
            nombreOperations = 0;
        }
        
        double montantPrediction = montantParOperation * nombreOperations;
        
        // Calculer l'impact sur le solde
        double impactParOperation = calculerImpactSolde(typeOperation != null ? typeOperation : "", montantParOperation);
        double impactTotal = impactParOperation * nombreOperations;
        double soldeApres = soldeAvant + impactTotal;
        
        // Confiance plus élevée si on a des données spécifiques pour ce jour
        double confiance = (moyenneParJourSemaine != null && moyenneParJourSemaine.containsKey(jourSemaine)) 
            ? 0.7 : 0.5;
        
        return new PredictionResponse.PredictionJour(date, montantPrediction, nombreOperations, confiance, soldeAvant, soldeApres);
    }

    /**
     * Calcule les statistiques globales de la prédiction
     */
    private void calculerStatistiquesGlobales(
        PredictionResponse response,
        List<PredictionResponse.PredictionJour> predictions) {
        
        if (predictions.isEmpty()) {
            response.setMontantTotalPrediction(0.0);
            response.setMontantMoyenParJour(0.0);
            response.setMontantMin(0.0);
            response.setMontantMax(0.0);
            response.setNombreOperationsPredites(0);
            response.setFrequenceMoyenneParJour(0.0);
            return;
        }
        
        double montantTotal = predictions.stream()
            .mapToDouble(p -> p.getMontantPrediction() != null ? p.getMontantPrediction() : 0.0)
            .sum();
        
        double montantMoyen = montantTotal / predictions.size();
        
        double montantMin = predictions.stream()
            .mapToDouble(p -> p.getMontantPrediction() != null ? p.getMontantPrediction() : 0.0)
            .min()
            .orElse(0.0);
        
        double montantMax = predictions.stream()
            .mapToDouble(p -> p.getMontantPrediction() != null ? p.getMontantPrediction() : 0.0)
            .max()
            .orElse(0.0);
        
        int nombreOperations = predictions.stream()
            .mapToInt(p -> p.getNombreOperationsPredites() != null ? p.getNombreOperationsPredites() : 0)
            .sum();
        
        double frequenceMoyenne = (double) nombreOperations / predictions.size();
        
        // Statistiques sur les soldes
        List<Double> soldesAvant = predictions.stream()
            .map(p -> p.getSoldeAvantPrediction())
            .filter(Objects::nonNull)
            .collect(Collectors.toList());
        
        List<Double> soldesApres = predictions.stream()
            .map(p -> p.getSoldeApresPrediction())
            .filter(Objects::nonNull)
            .collect(Collectors.toList());
        
        double soldeInitial = !soldesAvant.isEmpty() ? soldesAvant.get(0) : 0.0;
        double soldeFinal = !soldesApres.isEmpty() ? soldesApres.get(soldesApres.size() - 1) : 0.0;
        double soldeMin = soldesApres.stream().mapToDouble(Double::doubleValue).min().orElse(0.0);
        double soldeMax = soldesApres.stream().mapToDouble(Double::doubleValue).max().orElse(0.0);
        double variationSolde = soldeFinal - soldeInitial;
        
        // Ajouter les statistiques de soldes aux statistiques historiques
        Map<String, Object> statsHistoriques = response.getStatistiquesHistoriques();
        if (statsHistoriques == null) {
            statsHistoriques = new HashMap<>();
            response.setStatistiquesHistoriques(statsHistoriques);
        }
        statsHistoriques.put("soldeInitial", soldeInitial);
        statsHistoriques.put("soldeFinal", soldeFinal);
        statsHistoriques.put("soldeMin", soldeMin);
        statsHistoriques.put("soldeMax", soldeMax);
        statsHistoriques.put("variationSolde", variationSolde);
        
        response.setMontantTotalPrediction(montantTotal);
        response.setMontantMoyenParJour(montantMoyen);
        response.setMontantMin(montantMin);
        response.setMontantMax(montantMax);
        response.setNombreOperationsPredites(nombreOperations);
        response.setFrequenceMoyenneParJour(frequenceMoyenne);
    }

    /**
     * Calcule un score de confiance pour la prédiction
     */
    private Double calculerConfiance(List<OperationEntity> operations, Map<String, Object> stats) {
        if (operations.isEmpty()) {
            return 0.0;
        }
        
        double confiance = 0.0;
        
        // Facteur 1: Nombre d'opérations (plus de données = plus de confiance)
        int nombreOperations = operations.size();
        confiance += Math.min(0.4, nombreOperations / 500.0 * 0.4);
        
        // Facteur 2: Période d'analyse (plus longue = plus de confiance)
        Object nombreJoursObj = stats.get("nombreJoursAnalyse");
        if (nombreJoursObj != null) {
            long nombreJoursAnalyse;
            if (nombreJoursObj instanceof Long) {
                nombreJoursAnalyse = (Long) nombreJoursObj;
            } else if (nombreJoursObj instanceof Integer) {
                nombreJoursAnalyse = ((Integer) nombreJoursObj).longValue();
            } else {
                nombreJoursAnalyse = ((Number) nombreJoursObj).longValue();
            }
            confiance += Math.min(0.3, nombreJoursAnalyse / 90.0 * 0.3);
        }
        
        // Facteur 3: Régularité (écart-type faible = plus de confiance)
        Double ecartType = (Double) stats.get("montantEcartType");
        Double montantMoyen = (Double) stats.get("montantMoyen");
        if (ecartType != null && montantMoyen != null && montantMoyen > 0) {
            double coefficientVariation = ecartType / montantMoyen;
            confiance += Math.min(0.3, (1.0 - Math.min(1.0, coefficientVariation)) * 0.3);
        }
        
        return Math.min(1.0, confiance);
    }

    /**
     * Crée une prédiction vide avec un message d'erreur
     */
    private PredictionResponse createEmptyPrediction(
        PredictionRequest request,
        LocalDate dateDebut,
        LocalDate dateFin,
        String message) {
        
        PredictionResponse response = new PredictionResponse();
        response.setTypeOperation(request.getTypeOperation());
        response.setDateDebutPrediction(dateDebut);
        response.setDateFinPrediction(dateFin);
        response.setHorizonJours(request.getHorizonJours());
        response.setMethodePrediction(request.getMethodePrediction());
        response.setPredictionsParJour(new ArrayList<>());
        response.setMontantTotalPrediction(0.0);
        response.setMontantMoyenParJour(0.0);
        response.setMontantMin(0.0);
        response.setMontantMax(0.0);
        response.setNombreOperationsPredites(0);
        response.setFrequenceMoyenneParJour(0.0);
        response.setConfiance(0.0);
        response.setMessage(message);
        response.setStatistiquesHistoriques(new HashMap<>());
        
        return response;
    }
}

