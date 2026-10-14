package com.reconciliation.service;

import com.reconciliation.model.Statistics;
import com.reconciliation.repository.StatisticsRepository;
import com.reconciliation.repository.OperationRepository;
import com.reconciliation.repository.CompteRepository;
import com.reconciliation.repository.AgencySummaryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.ArrayList;

@Service
public class StatisticsService {
    private static final Logger logger = LoggerFactory.getLogger(StatisticsService.class);

    @Autowired
    private StatisticsRepository statisticsRepository;
    
    @Autowired
    private OperationRepository operationRepository;
    
    @Autowired
    private CompteRepository compteRepository;

    @Autowired
    private AgencySummaryRepository agencySummaryRepository;

    @Autowired
    private com.reconciliation.service.PaysFilterService paysFilterService;

    @Autowired
    private com.reconciliation.service.OperationService operationService;

    @Autowired
    private com.reconciliation.repository.Result8RecRepository result8RecRepository;

    @Transactional
    public List<Statistics> saveStatistics(List<Statistics> statistics) {
        try {
            for (Statistics stat : statistics) {
                if (stat.getDate() == null) {
                    stat.setDate(LocalDate.now());
                }
                statisticsRepository.save(stat);
            }
            return statistics;
        } catch (Exception e) {
            logger.error("Error saving statistics: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to save statistics: " + e.getMessage(), e);
        }
    }

    public List<Statistics> getStatisticsByDate(LocalDate date) {
        return getStatisticsByDate(date, null);
    }
    
    public List<Statistics> getStatisticsByDate(LocalDate date, String username) {
        logger.info("Fetching statistics for date: {} (username: {})", date, username);
        try {
            List<Statistics> stats;
            
            // Récupérer les pays autorisés pour l'utilisateur
            List<String> allowedCountries = null;
            if (username != null && !username.isEmpty()) {
                allowedCountries = paysFilterService.getAllowedPaysCodes(username);
                // null signifie tous les pays (GNL ou admin)
            }
            
            if (allowedCountries == null) {
                // GNL ou admin : tous les pays
                stats = statisticsRepository.findByDate(date);
            } else if (allowedCountries.isEmpty()) {
                // Aucun pays autorisé
                stats = new ArrayList<>();
            } else {
                // Filtrer par pays autorisés
                stats = statisticsRepository.findByDateAndCountries(date, allowedCountries);
            }
            
            logger.debug("Found {} statistics records for date {}", stats.size(), date);
            return stats;
        } catch (Exception e) {
            logger.error("Error fetching statistics by date {}: {}", date, e.getMessage(), e);
            throw new RuntimeException("Failed to fetch statistics by date: " + e.getMessage(), e);
        }
    }

    public List<Statistics> getStatisticsByFilters(String agency, String service, LocalDate startDate, LocalDate endDate) {
        return getStatisticsByFilters(agency, service, startDate, endDate, null);
    }
    
    public List<Statistics> getStatisticsByFilters(String agency, String service, LocalDate startDate, LocalDate endDate, String username) {
        logger.info("Fetching statistics with filters: agency={}, service={}, startDate={}, endDate={} (username: {})", 
            agency, service, startDate, endDate, username);
        try {
            List<Statistics> stats;
            
            // Récupérer les pays autorisés pour l'utilisateur
            List<String> allowedCountries = null;
            if (username != null && !username.isEmpty()) {
                allowedCountries = paysFilterService.getAllowedPaysCodes(username);
                // null signifie tous les pays (GNL ou admin)
            }
            
            if (allowedCountries == null) {
                // GNL ou admin : tous les pays
                stats = statisticsRepository.findByFilters(agency, service, startDate, endDate);
            } else if (allowedCountries.isEmpty()) {
                // Aucun pays autorisé
                stats = new ArrayList<>();
            } else {
                // Filtrer par pays autorisés
                stats = statisticsRepository.findByFiltersWithCountries(agency, service, allowedCountries, startDate, endDate);
            }
            
            logger.debug("Found {} statistics records matching filters", stats.size());
            return stats;
        } catch (Exception e) {
            logger.error("Error fetching statistics with filters: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to fetch statistics with filters: " + e.getMessage(), e);
        }
    }

    public Map<String, Object> getDashboardMetrics() {
        return getDashboardMetrics(null, "semaine");
    }
    
    public Map<String, Object> getDashboardMetrics(String username) {
        return getDashboardMetrics(username, "semaine");
    }

    public Map<String, Object> getDashboardMetrics(String username, String period) {
        logger.info("Calculating dashboard metrics for username: {}, period: {}", username, period);
        
        try {
            Map<String, Object> metrics = new HashMap<>();
            
            // Référence temps = J-1
            LocalDate reference = LocalDate.now().minusDays(1);

            // Déterminer l'intervalle [start, end) selon la période demandée
            LocalDate start;
            LocalDate end;
            // Semaine (et période inconnue → semaine) : borne supérieure d'affichage = J-1, pas le jour calendaire
            boolean capWeekEndToJ1 = false;
            String p = (period == null ? "semaine" : period.toLowerCase());
            switch (p) {
                case "jour":
                    start = reference;
                    end = start.plusDays(1);
                    break;
                case "7_jours":
                    start = reference.minusDays(6);
                    end = reference.plusDays(1);
                    break;
                case "30_jours":
                    start = reference.minusDays(29);
                    end = reference.plusDays(1);
                    break;
                case "semaine_passee":
                    start = reference.with(java.time.DayOfWeek.MONDAY).minusDays(7);
                    end = start.plusDays(7);
                    break;
                case "mois":
                    start = reference.withDayOfMonth(1);
                    end = start.plusMonths(1);
                    break;
                case "trimestre":
                    int currentQuarter = (reference.getMonthValue() - 1) / 3;
                    start = LocalDate.of(reference.getYear(), currentQuarter * 3 + 1, 1);
                    end = start.plusMonths(3);
                    break;
                case "semestre":
                    int currentSemester = (reference.getMonthValue() - 1) / 6;
                    start = LocalDate.of(reference.getYear(), currentSemester * 6 + 1, 1);
                    end = start.plusMonths(6);
                    break;
                case "annee":
                    start = LocalDate.of(reference.getYear(), 1, 1);
                    end = start.plusYears(1);
                    break;
                case "semaine":
                default:
                    capWeekEndToJ1 = true;
                    start = reference.with(java.time.DayOfWeek.MONDAY);
                    end = start.plusDays(7);
                    break;
            }

            // Semaine : jusqu'à J-1 exclusif (référence métier). Autres périodes : pas après aujourd'hui (calendrier).
            LocalDate today = LocalDate.now();
            LocalDate maxExclusive = capWeekEndToJ1 ? reference.plusDays(1) : today.plusDays(1);
            if (end.isAfter(maxExclusive)) {
                end = maxExclusive;
            }
            if (!start.isBefore(end)) {
                end = start.plusDays(1);
            }

            // Charger toutes les lignes result8rec
            List<com.reconciliation.entity.Result8RecEntity> allResults = result8RecRepository.findAll();

            // Filtrer les données de result8rec sur la période choisie
            List<com.reconciliation.entity.Result8RecEntity> periodResults = new ArrayList<>();
            for (com.reconciliation.entity.Result8RecEntity r : allResults) {
                if (r.getDate() == null || r.getDate().trim().isEmpty()) continue;
                String dateOnly = r.getDate().split(" ")[0];
                try {
                    LocalDate d = LocalDate.parse(dateOnly);
                    if ((d.isEqual(start) || d.isAfter(start)) && d.isBefore(end)) {
                        periodResults.add(r);
                    }
                } catch (Exception ignored) {
                    // Date invalide : on ignore cette ligne pour les métriques rapides
                }
            }

            // Total des réconciliations sur la période (nombre de couples distincts date+service+pays)
            java.util.Set<String> periodKeys = new java.util.HashSet<>();
            for (com.reconciliation.entity.Result8RecEntity r : periodResults) {
                String key = (r.getDate() == null ? "" : r.getDate().split(" ")[0]) + "|" +
                             (r.getService() == null ? "" : r.getService()) + "|" +
                             (r.getCountry() == null ? "" : r.getCountry());
                periodKeys.add(key);
            }
            long totalReconciliations = periodKeys.size();
            metrics.put("totalReconciliations", totalReconciliations);

            // Fichiers traités = nombre de réconciliations distinctes (date+service+pays), pas chaque ligne
            long totalFiles = periodKeys.size();
            metrics.put("totalFiles", totalFiles);

            // Dernière activité sur la période (date max parmi les dates de la période)
            LocalDate lastActivityDate = null;
            for (com.reconciliation.entity.Result8RecEntity r : periodResults) {
                if (r.getDate() == null || r.getDate().trim().isEmpty()) continue;
                String dateOnly = r.getDate().split(" ")[0];
                try {
                    LocalDate d = LocalDate.parse(dateOnly);
                    if (lastActivityDate == null || d.isAfter(lastActivityDate)) {
                        lastActivityDate = d;
                    }
                } catch (Exception ignored) {}
            }

            // La date brute est envoyée telle quelle : la mise en formerelative
            // dépend de la langue de l'interface et relève donc du frontend.
            String lastActivityDateStr = lastActivityDate != null ? lastActivityDate.toString() : "";
            metrics.put("lastActivityDate", lastActivityDateStr);
            String lastActivityStr;
            if (lastActivityDate != null) {
                lastActivityStr = formatLastActivity(lastActivityDate);
            } else {
                lastActivityStr = "Aucune activité récente";
            }
            metrics.put("lastActivity", lastActivityStr);

            // Statistiques du jour : nombre de réconciliations (relevés distincts) pour J-1
            long todayReconciliations = 0;
            java.util.Set<String> todayKeys = new java.util.HashSet<>();
            for (com.reconciliation.entity.Result8RecEntity r : periodResults) {
                if (r.getDate() == null || r.getDate().trim().isEmpty()) continue;
                String dateOnly = r.getDate().split(" ")[0];
                if (!dateOnly.equals(reference.toString())) continue;
                String key = dateOnly + "|" +
                             (r.getService() == null ? "" : r.getService()) + "|" +
                             (r.getCountry() == null ? "" : r.getCountry());
                todayKeys.add(key);
            }
            todayReconciliations = todayKeys.size();
            metrics.put("todayReconciliations", todayReconciliations);
            
            logger.info("Dashboard metrics calculated: totalReconciliations={}, totalFiles={}, lastActivity={}, todayReconciliations={}", 
                totalReconciliations, totalFiles, lastActivityStr, todayReconciliations);
            
            return metrics;
        } catch (Exception e) {
            logger.error("Error calculating dashboard metrics: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to calculate dashboard metrics: " + e.getMessage(), e);
        }
    }
    
    private String formatLastActivity(LocalDate date) {
        // Dans le métier réconciliation, la référence temporelle est J-1.
        // On considère donc "aujourd'hui" = J-1 réel, "hier" = J-2, etc.
        LocalDate reference = LocalDate.now().minusDays(1);
        LocalDate referenceYesterday = reference.minusDays(1);
        
        if (date.equals(reference)) {
            return "Aujourd'hui";
        } else if (date.equals(referenceYesterday)) {
            return "Hier";
        } else {
            long daysDiff = java.time.temporal.ChronoUnit.DAYS.between(date, reference);
            if (daysDiff == 1) {
                return "Il y a 1 jour";
            } else if (daysDiff < 7) {
                return "Il y a " + daysDiff + " jours";
            } else {
                return "Il y a " + (daysDiff / 7) + " semaines";
            }
        }
    }

    public Map<String, Object> getFilterOptions() {
        return getFilterOptions(null);
    }
    
    public Map<String, Object> getFilterOptions(String username) {
        logger.info("Retrieving filter options from operations data for username: {}", username);
        
        try {
            Map<String, Object> filterOptions = new HashMap<>();
            
            // Récupérer les pays autorisés pour l'utilisateur
            List<String> allowedCountries = null;
            if (username != null && !username.isEmpty()) {
                allowedCountries = paysFilterService.getAllowedPaysCodes(username);
                // null signifie tous les pays (GNL ou admin)
            }
            
            // Récupérer les agences depuis les opérations (filtrées par pays si nécessaire)
            List<String> agencies;
            if (allowedCountries == null) {
                agencies = new ArrayList<>(operationRepository.findDistinctAgency());
            } else if (allowedCountries.isEmpty()) {
                agencies = new ArrayList<>();
            } else {
                // Filtrer les agences selon les pays autorisés
                // Note: findDistinctAgency() retourne codeProprietaire qui représente l'agence
                List<com.reconciliation.model.Operation> operations = operationService.getAllOperations(username);
                agencies = operations.stream()
                    .map(com.reconciliation.model.Operation::getCodeProprietaire)
                    .filter(agence -> agence != null && !agence.isEmpty())
                    .distinct()
                    .sorted()
                    .collect(java.util.stream.Collectors.toList());
            }
            filterOptions.put("agencies", agencies);
            
            // Récupérer les services depuis les opérations (filtrées par pays si nécessaire)
            List<String> services;
            if (allowedCountries == null) {
                services = new ArrayList<>(operationRepository.findDistinctService());
            } else if (allowedCountries.isEmpty()) {
                services = new ArrayList<>();
            } else {
                // Filtrer les services selon les pays autorisés
                List<com.reconciliation.model.Operation> operations = operationService.getAllOperations(username);
                services = operations.stream()
                    .map(com.reconciliation.model.Operation::getService)
                    .filter(service -> service != null && !service.isEmpty())
                    .distinct()
                    .sorted()
                    .collect(java.util.stream.Collectors.toList());
            }
            filterOptions.put("services", services);
            
            // Récupérer les pays depuis les comptes (filtrés selon les permissions)
            List<String> countries;
            if (allowedCountries == null) {
                // GNL ou admin : tous les pays
                countries = new ArrayList<>(compteRepository.findDistinctPays());
            } else if (allowedCountries.isEmpty()) {
                countries = new ArrayList<>();
            } else {
                // Filtrer uniquement les pays autorisés
                List<String> allCountries = compteRepository.findDistinctPays();
                countries = allCountries.stream()
                    .filter(allowedCountries::contains)
                    .collect(java.util.stream.Collectors.toList());
            }
            filterOptions.put("countries", countries);
            
            // Options de filtres temporels (sans 'Tous')
            List<String> timeFilters = List.of("Aujourd'hui", "Cette semaine", "Ce mois", "Mois passé", "Cette année", "Année dernière", "Personnalisé");
            filterOptions.put("timeFilters", timeFilters);
            
            logger.info("Filter options retrieved: {} agencies, {} services, {} countries", 
                agencies.size(), services.size(), countries.size());
            
            return filterOptions;
        } catch (Exception e) {
            logger.error("Error retrieving filter options: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to retrieve filter options: " + e.getMessage(), e);
        }
    }

    public Map<String, Object> getDetailedMetrics(List<String> agencies, List<String> services, List<String> countries, 
                                                 String timeFilter, String startDate, String endDate) {
        return getDetailedMetrics(agencies, services, countries, timeFilter, startDate, endDate, null);
    }
    
    public Map<String, Object> getDetailedMetrics(List<String> agencies, List<String> services, List<String> countries, 
                                                 String timeFilter, String startDate, String endDate, String username) {
        logger.info("Calculating detailed metrics with filters: agencies={}, services={}, countries={}, timeFilter={}, startDate={}, endDate={}", 
            agencies, services, countries, timeFilter, startDate, endDate);
        
        try {
            // Traiter les valeurs "Tous" comme des valeurs vides
            final List<String> finalAgencies = normalizeFilterValues(agencies);
            final List<String> finalServices = normalizeFilterValues(services);
            final List<String> finalCountries = normalizeFilterValues(countries);
            
            // Calculer les dates de filtrage
            String start = null;
            String end = null;
            
            if (timeFilter != null && !timeFilter.equals("Tous")) {
                LocalDate today = LocalDate.now();
                
                switch (timeFilter) {
                    case "Aujourd'hui":
                        LocalDate yesterday = today.minusDays(1);
                        start = yesterday.toString();
                        end = yesterday.toString();
                        break;
                    case "Cette semaine":
                        start = today.minusDays(today.getDayOfWeek().getValue() - 1).toString();
                        end = today.toString();
                        break;
                    case "Ce mois":
                        start = today.withDayOfMonth(1).toString();
                        end = today.toString();
                        break;
                    case "Mois passé":
                        LocalDate lastMonth = today.minusMonths(1);
                        start = lastMonth.withDayOfMonth(1).toString();
                        end = lastMonth.withDayOfMonth(lastMonth.lengthOfMonth()).toString();
                        break;
                    case "Cette année":
                        start = today.withDayOfYear(1).toString();
                        end = today.withDayOfYear(today.lengthOfYear()).toString();
                        break;
                    case "Année dernière":
                        LocalDate lastYear = today.minusYears(1);
                        start = lastYear.withDayOfYear(1).toString();
                        end = lastYear.withDayOfYear(lastYear.lengthOfYear()).toString();
                        break;
                    case "Personnalisé":
                        if (startDate != null && endDate != null) {
                            start = startDate;
                            end = endDate;
                        }
                        break;
                }
            }
            
            Map<String, Object> metrics = new HashMap<>();
            
            // Métriques globales avec filtres temporels (agencySummaryRepository)
            Double totalVolume = agencySummaryRepository.calculateTotalVolumeWithDateRange(finalAgencies, finalServices, finalCountries, start, end);
            long totalTransactions = agencySummaryRepository.countTransactionsWithDateRange(finalAgencies, finalServices, finalCountries, start, end);
            long totalClients = agencySummaryRepository.countDistinctAgencyWithDateRange(finalAgencies, finalServices, finalCountries, start, end);
            metrics.put("totalVolume", totalVolume != null ? totalVolume : 0.0);
            metrics.put("totalTransactions", totalTransactions);
            metrics.put("totalClients", totalClients);

            // Conversion des dates pour les opérations
            final java.time.LocalDateTime startDateTime;
            final java.time.LocalDateTime endDateTime;
            if (start != null && end != null) {
                startDateTime = java.time.LocalDate.parse(start).atStartOfDay();
                endDateTime = java.time.LocalDate.parse(end).atTime(23, 59, 59);
            } else {
                startDateTime = null;
                endDateTime = null;
            }

            // Statistiques par type d'opération (operationRepository)
            List<Object[]> operationStatsRaw = operationRepository.getOperationTypeStatisticsWithDateRange(
                finalServices, finalCountries, startDateTime, endDateTime
            );
            List<Map<String, Object>> operationStats = new ArrayList<>();
            
            // Types de transaction à exclure de l'affichage
            List<String> excludedTypes = List.of("transaction_cree", "annulation_partenaire");
            
            for (Object[] row : operationStatsRaw) {
                String operationType = (String) row[0];
                
                // Exclure les types spécifiés
                if (!excludedTypes.contains(operationType)) {
                    Map<String, Object> stat = new HashMap<>();
                    stat.put("operationType", operationType);
                    stat.put("transactionCount", row[1]);
                    stat.put("totalVolume", row[2]);
                    stat.put("averageVolume", row[3]);
                    operationStats.add(stat);
                }
            }
            metrics.put("operationStats", operationStats);

            // Fréquence par type d'opération (operationRepository)
            List<Object[]> frequencyStatsRaw = operationRepository.getOperationFrequencyWithDateRange(
                finalServices, finalCountries, startDateTime, endDateTime
            );
            List<Map<String, Object>> frequencyStats = new ArrayList<>();
            
            for (Object[] row : frequencyStatsRaw) {
                String operationType = (String) row[0];
                
                // Exclure les types spécifiés
                if (!excludedTypes.contains(operationType)) {
                    Map<String, Object> freq = new HashMap<>();
                    freq.put("operationType", operationType);
                    freq.put("frequency", row[1]);
                    frequencyStats.add(freq);
                }
            }
            metrics.put("frequencyStats", frequencyStats);

            // Moyenne volume par jour (agencySummaryRepository)
            Double averageVolume = 0.0;
            if (start != null && end != null) {
                java.time.LocalDate startDateLocal = java.time.LocalDate.parse(start);
                java.time.LocalDate endDateLocal = java.time.LocalDate.parse(end);
                long totalDays = java.time.temporal.ChronoUnit.DAYS.between(startDateLocal, endDateLocal) + 1;
                averageVolume = (totalDays > 0) ? ((totalVolume != null ? totalVolume : 0.0) / totalDays) : 0.0;
            } else {
                // Si pas de filtres de dates, calculer sur toute la période disponible
                String minDateStr = agencySummaryRepository.findMinDate();
                String maxDateStr = agencySummaryRepository.findMaxDate();
                if (minDateStr != null && maxDateStr != null) {
                java.time.LocalDate minDate = java.time.LocalDate.parse(minDateStr);
                java.time.LocalDate maxDate = java.time.LocalDate.parse(maxDateStr);
                long totalDays = java.time.temporal.ChronoUnit.DAYS.between(minDate, maxDate) + 1;
                averageVolume = (totalDays > 0) ? ((totalVolume != null ? totalVolume : 0.0) / totalDays) : 0.0;
                }
            }
            metrics.put("averageVolume", averageVolume);

            // --- Moyenne transaction par jour avec filtres appliqués ---
            long averageTransactions = 0;
            if (start != null && end != null) {
                java.time.LocalDate startDateLocal = java.time.LocalDate.parse(start);
                java.time.LocalDate endDateLocal = java.time.LocalDate.parse(end);
                long totalDays = java.time.temporal.ChronoUnit.DAYS.between(startDateLocal, endDateLocal) + 1;
                averageTransactions = totalDays > 0 ? Math.round((double) totalTransactions / totalDays) : 0;
            } else {
                // Si pas de filtres de dates, calculer sur toute la période disponible
                String minDateStr = agencySummaryRepository.findMinDate();
                String maxDateStr = agencySummaryRepository.findMaxDate();
                if (minDateStr != null && maxDateStr != null) {
                    java.time.LocalDate minDate = java.time.LocalDate.parse(minDateStr);
                    java.time.LocalDate maxDate = java.time.LocalDate.parse(maxDateStr);
                    long totalDays = java.time.temporal.ChronoUnit.DAYS.between(minDate, maxDate) + 1;
                    long totalTransactionsAll = agencySummaryRepository.countTransactionsWithDateRange(null, null, null, null, null);
                    averageTransactions = totalDays > 0 ? Math.round((double) totalTransactionsAll / totalDays) : 0;
                }
            }
            metrics.put("averageTransactions", averageTransactions);
            
            // --- Frais de transaction moyen par jour ---
            Double averageFeesPerDay = 0.0;
            
            // Utiliser les opérations avec frais calculés au lieu du repository FraisTransactionRepository
            List<com.reconciliation.model.Operation> operationsWithFrais = operationService.getAllOperationsWithFrais(username);
            
            // Filtrer les opérations selon les critères
            List<com.reconciliation.model.Operation> filteredOperations = operationsWithFrais.stream()
                .filter(op -> finalAgencies == null || finalAgencies.isEmpty() || finalAgencies.contains(op.getCodeProprietaire()))
                .filter(op -> finalServices == null || finalServices.isEmpty() || finalServices.contains(op.getService()))
                .filter(op -> op.getFraisApplicable() != null && op.getFraisApplicable())
                .filter(op -> {
                    // Appliquer le filtre de dates si spécifié
                    if (startDateTime != null && endDateTime != null) {
                        return op.getDateOperation() != null && 
                               !op.getDateOperation().isBefore(startDateTime) && 
                               !op.getDateOperation().isAfter(endDateTime);
                    }
                    return true;
                })
                .collect(java.util.stream.Collectors.toList());
            
            // --- Nouveau calcul du volume des revenus (somme brute des FRAIS_TRANSACTION avec filtres) ---
            String agenceFilter = (finalAgencies != null && !finalAgencies.isEmpty()) ? finalAgencies.get(0) : null;
            String serviceFilter = (finalServices != null && !finalServices.isEmpty()) ? finalServices.get(0) : null;
            String paysFilter = (finalCountries != null && !finalCountries.isEmpty()) ? finalCountries.get(0) : null;
            Double totalFees = operationRepository.sumMontantByTypeOperationWithFilters(
                "FRAIS_TRANSACTION",
                agenceFilter,
                serviceFilter,
                paysFilter,
                startDateTime,
                endDateTime
            );
            metrics.put("totalFees", totalFees != null ? totalFees : 0.0);
            
            // Compter les jours uniques avec des frais (uniquement les débits)
            long daysWithFees = filteredOperations.stream()
                .filter(op -> op.getMontantFrais() != null && op.getMontantFrais() > 0)
                .map(op -> op.getDateOperation().toLocalDate())
                .distinct()
                .count();
            
            if (daysWithFees > 0 && totalFees != null) {
                averageFeesPerDay = totalFees / daysWithFees;
            } else if (start != null && end != null && totalFees != null) {
                // Si pas de frais dans la période, calculer sur la période complète
                java.time.LocalDate startDateLocal = java.time.LocalDate.parse(start);
                java.time.LocalDate endDateLocal = java.time.LocalDate.parse(end);
                long totalDays = java.time.temporal.ChronoUnit.DAYS.between(startDateLocal, endDateLocal) + 1;
                averageFeesPerDay = totalDays > 0 ? (totalFees / totalDays) : 0.0;
            } else if (totalFees != null) {
                // Si pas de filtres de dates, calculer sur toute la période disponible
                String minDateStr = agencySummaryRepository.findMinDate();
                String maxDateStr = agencySummaryRepository.findMaxDate();
                if (minDateStr != null && maxDateStr != null) {
                    java.time.LocalDate minDate = java.time.LocalDate.parse(minDateStr);
                    java.time.LocalDate maxDate = java.time.LocalDate.parse(maxDateStr);
                    long totalDays = java.time.temporal.ChronoUnit.DAYS.between(minDate, maxDate) + 1;
                    averageFeesPerDay = totalDays > 0 ? (totalFees / totalDays) : 0.0;
                }
            } else {
                // Si totalFees est null, définir averageFeesPerDay à 0.0
                averageFeesPerDay = 0.0;
            }
            metrics.put("averageFeesPerDay", averageFeesPerDay);
            
            logger.info("Detailed metrics calculated: totalVolume={}, totalTransactions={}, totalClients={}, averageFeesPerDay={}", 
                totalVolume, totalTransactions, totalClients, averageFeesPerDay);
            
            return metrics;
        } catch (Exception e) {
            logger.error("Error calculating detailed metrics: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to calculate detailed metrics: " + e.getMessage(), e);
        }
    }


    /**
     * Normalise les listes de valeurs de filtre en retirant les valeurs "Tous"
     */
    private List<String> normalizeFilterValues(List<String> values) {
        if (values == null || values.isEmpty()) {
            return null;
        }
        List<String> normalized = values.stream()
            .filter(value -> value != null && !value.trim().isEmpty() && !value.equals("Tous"))
            .collect(java.util.stream.Collectors.toList());
        return normalized.isEmpty() ? null : normalized;
    }

    /**
     * Récupère les statistiques des opérations de type transaction_cree par service
     * pour les volumes Total cashin et Total paiement
     */
    public Map<String, Object> getTransactionCreatedStatsByService(List<String> agencies, List<String> services, 
                                                                   List<String> countries, String timeFilter, 
                                                                   String startDate, String endDate) {
        return getTransactionCreatedStatsByService(agencies, services, countries, timeFilter, startDate, endDate, null);
    }
    
    public Map<String, Object> getTransactionCreatedStatsByService(List<String> agencies, List<String> services, 
                                                                   List<String> countries, String timeFilter, 
                                                                   String startDate, String endDate, String username) {
        logger.info("Calculating transaction_cree stats by service with filters: agencies={}, services={}, countries={}, timeFilter={}, startDate={}, endDate={}", 
            agencies, services, countries, timeFilter, startDate, endDate);
        
        try {
            // Traiter les valeurs "Tous" comme des valeurs vides
            final List<String> finalAgencies = normalizeFilterValues(agencies);
            final List<String> finalServices = normalizeFilterValues(services);
            final List<String> finalCountries = normalizeFilterValues(countries);
            
            // Calculer les dates de filtrage
            String start = null;
            String end = null;
            
            if (timeFilter != null && !timeFilter.equals("Tous")) {
                LocalDate today = LocalDate.now();
                
                switch (timeFilter) {
                    case "Aujourd'hui":
                        LocalDate yesterday = today.minusDays(1);
                        start = yesterday.toString();
                        end = yesterday.toString();
                        break;
                    case "Cette semaine":
                        start = today.minusDays(today.getDayOfWeek().getValue() - 1).toString();
                        end = today.toString();
                        break;
                    case "Ce mois":
                        start = today.withDayOfMonth(1).toString();
                        end = today.toString();
                        break;
                    case "Mois passé":
                        LocalDate lastMonth = today.minusMonths(1);
                        start = lastMonth.withDayOfMonth(1).toString();
                        end = lastMonth.withDayOfMonth(lastMonth.lengthOfMonth()).toString();
                        break;
                    case "Cette année":
                        start = today.withDayOfYear(1).toString();
                        end = today.withDayOfYear(today.lengthOfYear()).toString();
                        break;
                    case "Année dernière":
                        LocalDate lastYear = today.minusYears(1);
                        start = lastYear.withDayOfYear(1).toString();
                        end = lastYear.withDayOfYear(lastYear.lengthOfYear()).toString();
                        break;
                    case "Personnalisé":
                        if (startDate != null && endDate != null) {
                            start = startDate;
                            end = endDate;
                        }
                        break;
                }
            }
            
            // Conversion des dates pour les opérations
            final java.time.LocalDateTime startDateTime;
            final java.time.LocalDateTime endDateTime;
            if (start != null && end != null) {
                startDateTime = java.time.LocalDate.parse(start).atStartOfDay();
                endDateTime = java.time.LocalDate.parse(end).atTime(23, 59, 59);
            } else {
                startDateTime = null;
                endDateTime = null;
            }

            Map<String, Object> stats = new HashMap<>();
            
            // Récupérer toutes les opérations de type transaction_cree (uniquement celles non annulées)
            List<com.reconciliation.model.Operation> allTransactionCreatedOps = operationService.getAllOperations(username).stream()
                .filter(op -> "transaction_cree".equals(op.getTypeOperation()))
                .filter(op -> op.getStatut() == null || !"Annulée".equalsIgnoreCase(op.getStatut())) // Exclure les transactions annulées
                .filter(op -> finalAgencies == null || finalAgencies.isEmpty() || finalAgencies.contains(op.getCodeProprietaire()))
                .filter(op -> finalServices == null || finalServices.isEmpty() || finalServices.contains(op.getService()))
                .filter(op -> finalCountries == null || finalCountries.isEmpty() || finalCountries.contains(op.getPays()))
                .filter(op -> {
                    if (startDateTime != null && endDateTime != null) {
                        return op.getDateOperation() != null && 
                               !op.getDateOperation().isBefore(startDateTime) && 
                               !op.getDateOperation().isAfter(endDateTime);
                    }
                    return true;
                })
                .collect(java.util.stream.Collectors.toList());

            // Grouper par service et calculer les statistiques
            Map<String, Map<String, Object>> serviceStats = new HashMap<>();
            
            for (com.reconciliation.model.Operation op : allTransactionCreatedOps) {
                String service = op.getService();
                if (service == null || service.trim().isEmpty()) {
                    service = "Service non défini";
                }
                
                serviceStats.computeIfAbsent(service, k -> {
                    Map<String, Object> statsMap = new HashMap<>();
                    statsMap.put("service", k);
                    statsMap.put("totalCashinVolume", 0.0);
                    statsMap.put("totalPaymentVolume", 0.0);
                    statsMap.put("totalCashinCount", 0);
                    statsMap.put("totalPaymentCount", 0);
                    statsMap.put("totalTransactions", 0);
                    return statsMap;
                });
                
                Map<String, Object> serviceStat = serviceStats.get(service);
                
                // Compter le nombre total de transactions créées pour ce service
                int currentTotal = (Integer) serviceStat.get("totalTransactions");
                serviceStat.put("totalTransactions", currentTotal + 1);
                
                // Déterminer si cette opération est liée à un cashin ou paiement
                // En analysant le service ou d'autres critères
                if (isCashinService(service)) {
                    double currentVolume = (Double) serviceStat.get("totalCashinVolume");
                    int currentCount = (Integer) serviceStat.get("totalCashinCount");
                    serviceStat.put("totalCashinVolume", currentVolume + op.getMontant());
                    serviceStat.put("totalCashinCount", currentCount + 1);
                } else if (isPaymentService(service)) {
                    double currentVolume = (Double) serviceStat.get("totalPaymentVolume");
                    int currentCount = (Integer) serviceStat.get("totalPaymentCount");
                    serviceStat.put("totalPaymentVolume", currentVolume + op.getMontant());
                    serviceStat.put("totalPaymentCount", currentCount + 1);
                }
            }
            
            // Convertir en liste pour l'affichage
            List<Map<String, Object>> serviceStatsList = new ArrayList<>(serviceStats.values());
            
            // Trier par volume total décroissant
            serviceStatsList.sort((a, b) -> {
                double totalA = (Double) a.get("totalCashinVolume") + (Double) a.get("totalPaymentVolume");
                double totalB = (Double) b.get("totalCashinVolume") + (Double) b.get("totalPaymentVolume");
                return Double.compare(totalB, totalA);
            });
            
            stats.put("serviceStats", serviceStatsList);
            stats.put("totalServices", serviceStatsList.size());
            
            // Calculer les totaux globaux
            double totalCashinVolume = serviceStatsList.stream()
                .mapToDouble(s -> (Double) s.get("totalCashinVolume"))
                .sum();
            double totalPaymentVolume = serviceStatsList.stream()
                .mapToDouble(s -> (Double) s.get("totalPaymentVolume"))
                .sum();
            int totalCashinCount = serviceStatsList.stream()
                .mapToInt(s -> (Integer) s.get("totalCashinCount"))
                .sum();
            int totalPaymentCount = serviceStatsList.stream()
                .mapToInt(s -> (Integer) s.get("totalPaymentCount"))
                .sum();
            int totalTransactionCount = serviceStatsList.stream()
                .mapToInt(s -> (Integer) s.get("totalTransactions"))
                .sum();
            
            stats.put("totalCashinVolume", totalCashinVolume);
            stats.put("totalPaymentVolume", totalPaymentVolume);
            stats.put("totalCashinCount", totalCashinCount);
            stats.put("totalPaymentCount", totalPaymentCount);
            stats.put("totalTransactionCount", totalTransactionCount);
            
            logger.info("Transaction created stats calculated: {} services, totalCashinVolume={}, totalPaymentVolume={}, totalTransactionCount={}", 
                serviceStatsList.size(), totalCashinVolume, totalPaymentVolume, totalTransactionCount);
            
            return stats;
        } catch (Exception e) {
            logger.error("Error calculating transaction created stats by service: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to calculate transaction created stats by service: " + e.getMessage(), e);
        }
    }
    
    /**
     * Détermine si un service est lié aux cashin basé sur son nom
     */
    private boolean isCashinService(String service) {
        if (service == null) return false;
        String serviceLower = service.toLowerCase();
        return serviceLower.contains("cashin") || 
               serviceLower.contains("cash_in") ||
               serviceLower.contains("depot") ||
               serviceLower.contains("dépôt");
    }
    
    /**
     * Détermine si un service est lié aux paiements basé sur son nom
     * RÈGLE SPÉCIALE: Tous les modèles commençant par "PM" sont des partenaires paiement
     */
    private boolean isPaymentService(String service) {
        if (service == null) return false;
        String serviceLower = service.toLowerCase();
        
        // RÈGLE SPÉCIALE: Tous les modèles commençant par "PM" sont des partenaires paiement
        if (serviceLower.startsWith("pm")) {
            return true;
        }
        
        return serviceLower.contains("paiement") ||
               serviceLower.contains("payment") ||
               serviceLower.contains("retrait") ||
               serviceLower.contains("transfert") ||
               serviceLower.contains("transfer");
    }
} 