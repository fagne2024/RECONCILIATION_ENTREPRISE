package com.reconciliation.service;

import com.reconciliation.model.Operation;
import com.reconciliation.entity.AgencySummaryEntity;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.text.Normalizer;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.WeekFields;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class RankingService {
    
    @Autowired
    private com.reconciliation.service.OperationService operationService;
    
    @Autowired
    private com.reconciliation.repository.AgencySummaryRepository agencySummaryRepository;
    
    @Autowired
    private com.reconciliation.repository.CompteRepository compteRepository;
    
    private static final Map<String, String> COUNTRY_KEYWORDS = initCountryKeywordMap();
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private static class DateRange {
        final LocalDate startDate;
        final LocalDate endDate;
        final boolean all;

        DateRange(LocalDate startDate, LocalDate endDate, boolean all) {
            this.startDate = startDate;
            this.endDate = endDate;
            this.all = all;
        }
    }

    private static class RankingDataContext {
        final List<AgencySummaryEntity> summaries;
        final Map<String, List<Operation>> fraisByAgency;
        final Map<String, List<Operation>> fraisByService;
        final String period;

        RankingDataContext(List<AgencySummaryEntity> summaries,
                           Map<String, List<Operation>> fraisByAgency,
                           Map<String, List<Operation>> fraisByService,
                           String period) {
            this.summaries = summaries;
            this.fraisByAgency = fraisByAgency;
            this.fraisByService = fraisByService;
            this.period = period;
        }
    }
    
    /**
     * Récupérer le classement des agences par nombre de transactions (via recordCount)
     */
    public List<Map<String, Object>> getAgencyRankingByTransactions(List<String> countries, String period, String startDate, String endDate) {
        RankingDataContext ctx = loadContext(countries, period, startDate, endDate);
        List<Map<String, Object>> ranking = buildAgencyRankings(ctx);
        ranking.sort((a, b) -> Long.compare((Long) b.get("transactionCount"), (Long) a.get("transactionCount")));
        return ranking;
    }
    
    /**
     * Calculer le volume moyen selon la période pour une agence
     */
    private double calculateAverageVolumeByPeriod(List<AgencySummaryEntity> summaries, String period) {
        if (summaries.isEmpty()) {
            return 0.0;
        }
        
        // Grouper selon la période
        Map<String, List<AgencySummaryEntity>> byPeriod = summaries.stream()
            .filter(s -> s.getDate() != null && !s.getDate().isEmpty())
            .collect(Collectors.groupingBy(s -> {
                try {
                    LocalDate date = LocalDate.parse(s.getDate(), DateTimeFormatter.ofPattern("yyyy-MM-dd"));
                    return getPeriodKey(date, period);
                } catch (Exception e) {
                    return "unknown";
                }
            }));
        
        if (byPeriod.isEmpty()) {
            return 0.0;
        }
        
        // Calculer le volume total par période
        List<Double> periodVolumes = byPeriod.values().stream()
            .map(periodSummaries -> periodSummaries.stream()
                .mapToDouble(AgencySummaryEntity::getTotalVolume)
                .sum())
            .collect(Collectors.toList());
        
        // Retourner la moyenne des volumes par période
        return periodVolumes.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
    }
    
    /**
     * Calculer les frais moyens selon la période à partir des opérations FRAIS_TRANSACTION
     */
    private double calculateAverageFeesFromFraisOps(List<Operation> fraisOps, String period) {
        if (fraisOps.isEmpty()) {
            return 0.0;
        }

        Map<String, List<Operation>> byPeriod = fraisOps.stream()
            .filter(op -> op.getDateOperation() != null)
            .collect(Collectors.groupingBy(op ->
                getPeriodKey(op.getDateOperation().toLocalDate(), period)
            ));

        if (byPeriod.isEmpty()) {
            return 0.0;
        }

        List<Double> periodFees = byPeriod.values().stream()
            .map(periodOperations -> periodOperations.stream()
                .mapToDouble(op -> op.getMontant() != null ? op.getMontant() : 0.0)
                .sum())
            .collect(Collectors.toList());

        return periodFees.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
    }
    
    /**
     * Obtenir la clé de période selon le type demandé
     */
    private String getPeriodKey(LocalDate date, String period) {
        switch (period != null ? period.toLowerCase() : "month") {
            case "day":
                return date.format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
            case "week":
                int weekOfYear = date.get(WeekFields.ISO.weekOfWeekBasedYear());
                int year = date.getYear();
                return String.format("%d-W%02d", year, weekOfYear);
            case "month":
            default:
                return date.format(DateTimeFormatter.ofPattern("yyyy-MM"));
        }
    }
    
    /**
     * Récupérer le classement des agences par volume
     */
    public List<Map<String, Object>> getAgencyRankingByVolume(List<String> countries, String period, String startDate, String endDate) {
        RankingDataContext ctx = loadContext(countries, period, startDate, endDate);
        List<Map<String, Object>> ranking = buildAgencyRankings(ctx);
        ranking.sort((a, b) -> Double.compare((Double) b.get("totalVolume"), (Double) a.get("totalVolume")));
        return ranking;
    }
    
    /**
     * Récupérer le classement des agences par frais
     */
    public List<Map<String, Object>> getAgencyRankingByFees(List<String> countries, String period, String startDate, String endDate) {
        RankingDataContext ctx = loadContext(countries, period, startDate, endDate);
        List<Map<String, Object>> ranking = buildAgencyRankings(ctx);
        ranking.sort((a, b) -> Double.compare((Double) b.get("totalFees"), (Double) a.get("totalFees")));
        return ranking;
    }
    
    /**
     * Récupérer le classement des services par nombre de transactions (via recordCount)
     */
    public List<Map<String, Object>> getServiceRankingByTransactions(List<String> countries, String period, String startDate, String endDate) {
        RankingDataContext ctx = loadContext(countries, period, startDate, endDate);
        List<Map<String, Object>> ranking = buildServiceRankings(ctx);
        ranking.sort((a, b) -> Long.compare((Long) b.get("transactionCount"), (Long) a.get("transactionCount")));
        return ranking;
    }
    
    /**
     * Calculer le volume moyen selon la période pour un service
     */
    private double calculateAverageVolumeByPeriodForService(List<AgencySummaryEntity> summaries, String period) {
        if (summaries.isEmpty()) {
            return 0.0;
        }
        
        // Grouper selon la période
        Map<String, List<AgencySummaryEntity>> byPeriod = summaries.stream()
            .filter(s -> s.getDate() != null && !s.getDate().isEmpty())
            .collect(Collectors.groupingBy(s -> {
                try {
                    LocalDate date = LocalDate.parse(s.getDate(), DateTimeFormatter.ofPattern("yyyy-MM-dd"));
                    return getPeriodKey(date, period);
                } catch (Exception e) {
                    return "unknown";
                }
            }));
        
        if (byPeriod.isEmpty()) {
            return 0.0;
        }
        
        // Calculer le volume total par période
        List<Double> periodVolumes = byPeriod.values().stream()
            .map(periodSummaries -> periodSummaries.stream()
                .mapToDouble(AgencySummaryEntity::getTotalVolume)
                .sum())
            .collect(Collectors.toList());
        
        // Retourner la moyenne des volumes par période
        return periodVolumes.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
    }
    
    /**
     * Calculer les frais moyens selon la période pour un service (opérations FRAIS_TRANSACTION)
     */
    private double calculateAverageFeesByPeriodForService(List<Operation> fraisOps, String period) {
        return calculateAverageFeesFromFraisOps(fraisOps, period);
    }
    
    /**
     * Récupérer le classement des services par volume
     */
    public List<Map<String, Object>> getServiceRankingByVolume(List<String> countries, String period, String startDate, String endDate) {
        RankingDataContext ctx = loadContext(countries, period, startDate, endDate);
        List<Map<String, Object>> ranking = buildServiceRankings(ctx);
        ranking.sort((a, b) -> Double.compare((Double) b.get("totalVolume"), (Double) a.get("totalVolume")));
        return ranking;
    }
    
    /**
     * Récupérer le classement des services par frais
     */
    public List<Map<String, Object>> getServiceRankingByFees(List<String> countries, String period, String startDate, String endDate) {
        RankingDataContext ctx = loadContext(countries, period, startDate, endDate);
        List<Map<String, Object>> ranking = buildServiceRankings(ctx);
        ranking.sort((a, b) -> Double.compare((Double) b.get("totalFees"), (Double) a.get("totalFees")));
        return ranking;
    }
    
    /**
     * Récupérer les classements agences + services en un seul passage (optimisé pour l'affichage initial)
     */
    public Map<String, Object> getRankingsBundle(List<String> countries, String period, String startDate, String endDate) {
        RankingDataContext ctx = loadContext(countries, period, startDate, endDate);
        List<Map<String, Object>> agencies = buildAgencyRankings(ctx);
        List<Map<String, Object>> services = buildServiceRankings(ctx);
        agencies.sort((a, b) -> Long.compare((Long) b.get("transactionCount"), (Long) a.get("transactionCount")));
        services.sort((a, b) -> Long.compare((Long) b.get("transactionCount"), (Long) a.get("transactionCount")));
        Map<String, Object> bundle = new HashMap<>();
        bundle.put("agencies", agencies);
        bundle.put("services", services);
        return bundle;
    }

    private RankingDataContext loadContext(List<String> countries, String period, String customStartDate, String customEndDate) {
        DateRange dateRange = resolveDateRange(period, customStartDate, customEndDate);
        String startStr = dateRange.all ? null : dateRange.startDate.format(DATE_FORMAT);
        String endStr = dateRange.all ? null : dateRange.endDate.format(DATE_FORMAT);

        List<AgencySummaryEntity> summaries = agencySummaryRepository.findByStatsFilters(
            null, null, null, startStr, endStr);

        if (countries != null && !countries.isEmpty()) {
            summaries = summaries.stream()
                .filter(s -> matchesCountryFilter(s.getCountry(), countries))
                .collect(Collectors.toList());
        }

        java.time.LocalDateTime opStart = dateRange.all ? null : dateRange.startDate.atStartOfDay();
        java.time.LocalDateTime opEnd = dateRange.all ? null : dateRange.endDate.atTime(23, 59, 59);

        List<Operation> fraisOperations = operationService.getFraisTransactionsForRanking(opStart, opEnd);
        if (countries != null && !countries.isEmpty()) {
            fraisOperations = fraisOperations.stream()
                .filter(op -> matchesCountryFilter(op.getPays(), countries))
                .collect(Collectors.toList());
        }

        Map<String, List<Operation>> fraisByAgency = fraisOperations.stream()
            .filter(op -> op.getCodeProprietaire() != null && !op.getCodeProprietaire().isEmpty())
            .collect(Collectors.groupingBy(Operation::getCodeProprietaire));

        Map<String, List<Operation>> fraisByService = fraisOperations.stream()
            .filter(op -> op.getService() != null && !op.getService().isEmpty())
            .collect(Collectors.groupingBy(Operation::getService));

        return new RankingDataContext(summaries, fraisByAgency, fraisByService, period);
    }

    private List<Map<String, Object>> buildAgencyRankings(RankingDataContext ctx) {
        Map<String, List<AgencySummaryEntity>> byAgency = ctx.summaries.stream()
            .filter(s -> s.getAgency() != null && !s.getAgency().isEmpty())
            .collect(Collectors.groupingBy(AgencySummaryEntity::getAgency));

        List<Map<String, Object>> ranking = new ArrayList<>();
        for (Map.Entry<String, List<AgencySummaryEntity>> entry : byAgency.entrySet()) {
            String agency = entry.getKey();
            List<AgencySummaryEntity> list = entry.getValue();
            List<Operation> agencyFrais = ctx.fraisByAgency.getOrDefault(agency, Collections.emptyList());

            long transactionCount = list.stream().mapToLong(AgencySummaryEntity::getRecordCount).sum();
            double totalVolume = list.stream().mapToDouble(AgencySummaryEntity::getTotalVolume).sum();
            double totalFees = agencyFrais.stream()
                .mapToDouble(op -> op.getMontant() != null ? op.getMontant() : 0.0)
                .sum();

            Map<String, Object> agencyData = new HashMap<>();
            agencyData.put("agency", agency);
            agencyData.put("country", getDistinctCountries(list));
            agencyData.put("transactionCount", transactionCount);
            agencyData.put("totalVolume", totalVolume);
            agencyData.put("totalFees", totalFees);
            agencyData.put("averageVolume", calculateAverageVolumeByPeriod(list, ctx.period));
            agencyData.put("averageFees", calculateAverageFeesFromFraisOps(agencyFrais, ctx.period));
            ranking.add(agencyData);
        }
        return ranking;
    }

    private List<Map<String, Object>> buildServiceRankings(RankingDataContext ctx) {
        Map<String, List<AgencySummaryEntity>> byService = ctx.summaries.stream()
            .filter(s -> s.getService() != null && !s.getService().isEmpty())
            .collect(Collectors.groupingBy(AgencySummaryEntity::getService));

        List<Map<String, Object>> ranking = new ArrayList<>();
        for (Map.Entry<String, List<AgencySummaryEntity>> entry : byService.entrySet()) {
            String service = entry.getKey();
            List<AgencySummaryEntity> list = entry.getValue();
            List<Operation> serviceFrais = ctx.fraisByService.getOrDefault(service, Collections.emptyList());

            long transactionCount = list.stream().mapToLong(AgencySummaryEntity::getRecordCount).sum();
            double totalVolume = list.stream().mapToDouble(AgencySummaryEntity::getTotalVolume).sum();
            double totalFees = serviceFrais.stream()
                .mapToDouble(op -> op.getMontant() != null ? op.getMontant() : 0.0)
                .sum();
            long uniqueAgencies = list.stream().map(AgencySummaryEntity::getAgency).distinct().count();

            Map<String, Object> serviceData = new HashMap<>();
            serviceData.put("service", service);
            serviceData.put("country", getDistinctCountries(list));
            serviceData.put("transactionCount", transactionCount);
            serviceData.put("totalVolume", totalVolume);
            serviceData.put("totalFees", totalFees);
            serviceData.put("uniqueAgencies", uniqueAgencies);
            serviceData.put("averageVolume", calculateAverageVolumeByPeriodForService(list, ctx.period));
            serviceData.put("averageFees", calculateAverageFeesByPeriodForService(serviceFrais, ctx.period));
            ranking.add(serviceData);
        }
        return ranking;
    }

    private DateRange resolveDateRange(String period, String customStartDate, String customEndDate) {
        LocalDate today = LocalDate.now();
        LocalDate startDate;
        LocalDate endDate;

        if ("custom".equals(period) && customStartDate != null && customEndDate != null) {
            try {
                startDate = LocalDate.parse(customStartDate);
                endDate = LocalDate.parse(customEndDate);
            } catch (Exception e) {
                startDate = today.withDayOfMonth(1);
                endDate = today.withDayOfMonth(today.lengthOfMonth());
            }
            return new DateRange(startDate, endDate, false);
        }

        switch (period != null ? period.toLowerCase() : "month") {
            case "all":
                return new DateRange(today, today, true);
            case "day":
                startDate = today.minusDays(1);
                endDate = today.minusDays(1);
                break;
            case "week":
                startDate = today.minusWeeks(1).with(java.time.DayOfWeek.MONDAY);
                endDate = startDate.plusDays(6);
                break;
            case "thisyear":
                startDate = today.withDayOfYear(1);
                endDate = today.withDayOfYear(today.lengthOfYear());
                break;
            case "lastyear":
                startDate = today.minusYears(1).withDayOfYear(1);
                endDate = today.minusYears(1).withDayOfYear(today.minusYears(1).lengthOfYear());
                break;
            case "lastmonth":
                startDate = today.minusMonths(1).withDayOfMonth(1);
                endDate = today.minusMonths(1).withDayOfMonth(today.minusMonths(1).lengthOfMonth());
                break;
            case "month":
            default:
                startDate = today.withDayOfMonth(1);
                endDate = today.withDayOfMonth(today.lengthOfMonth());
                break;
        }
        return new DateRange(startDate, endDate, false);
    }
    
    /**
     * Récupérer tous les classements (agences et services)
     */
    public Map<String, Object> getAllRankings(String period) {
        Map<String, Object> rankings = new HashMap<>();
        RankingDataContext ctx = loadContext(null, period, null, null);
        List<Map<String, Object>> agencies = buildAgencyRankings(ctx);
        List<Map<String, Object>> services = buildServiceRankings(ctx);
        rankings.put("agenciesByTransactions", sortAgencyBy(agencies, "transactionCount"));
        rankings.put("agenciesByVolume", sortAgencyBy(agencies, "totalVolume"));
        rankings.put("agenciesByFees", sortAgencyBy(agencies, "totalFees"));
        rankings.put("servicesByTransactions", sortServiceBy(services, "transactionCount"));
        rankings.put("servicesByVolume", sortServiceBy(services, "totalVolume"));
        rankings.put("servicesByFees", sortServiceBy(services, "totalFees"));
        return rankings;
    }

    private List<Map<String, Object>> sortAgencyBy(List<Map<String, Object>> ranking, String field) {
        List<Map<String, Object>> sorted = new ArrayList<>(ranking);
        if ("transactionCount".equals(field)) {
            sorted.sort((a, b) -> Long.compare((Long) b.get(field), (Long) a.get(field)));
        } else {
            sorted.sort((a, b) -> Double.compare((Double) b.get(field), (Double) a.get(field)));
        }
        return sorted;
    }

    private List<Map<String, Object>> sortServiceBy(List<Map<String, Object>> ranking, String field) {
        return sortAgencyBy(ranking, field);
    }
    
    /**
     * Vérifie si un pays correspond aux filtres de pays sélectionnés
     * Gère les cas spéciaux comme CI et CICTH qui doivent être traités de la même manière
     */
    private boolean matchesCountryFilter(String country, List<String> filterCountries) {
        if (country == null || country.trim().isEmpty()) {
            return false;
        }
        
        // Normaliser le pays à vérifier
        String normalizedCountry = normalizeCountryCode(country);
        
        if (normalizedCountry.isEmpty()) {
            return false;
        }
        
        // Vérifier si le pays normalisé correspond à l'un des filtres (normalisés aussi)
        for (String filterCountry : filterCountries) {
            if (filterCountry == null || filterCountry.trim().isEmpty()) {
                continue;
            }
            String normalizedFilter = normalizeCountryCode(filterCountry);
            
            // Correspondance après normalisation (CI et CICTH seront tous les deux normalisés en CI)
            if (normalizedCountry.equals(normalizedFilter)) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Normalise un code pays pour le filtrage
     * CI et CICTH sont traités de la même manière
     */
    private String normalizeCountryCode(String countryCode) {
        if (countryCode == null || countryCode.trim().isEmpty()) {
            return "";
        }
        
        String trimmed = countryCode.trim();
        if (trimmed.isEmpty()) {
            return "";
        }
        
        String normalized = Normalizer.normalize(trimmed, Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "")
            .toUpperCase();
        String normalizedWithSpaces = normalized.replaceAll("[^A-Z0-9 ]", " ").replaceAll("\\s+", " ").trim();
        String lettersOnly = normalized.replaceAll("[^A-Z0-9]", "");
        
        if (lettersOnly.isEmpty()) {
            return "";
        }
        
        // Gérer les variantes spéciales : CICTH est équivalent à CI
        if (lettersOnly.startsWith("CICTH")) {
            return "CI";
        }
        
        // Si c'est déjà un code à 2 lettres, le retourner tel quel
        if (lettersOnly.length() == 2) {
            return lettersOnly;
        }
        
        for (Map.Entry<String, String> entry : COUNTRY_KEYWORDS.entrySet()) {
            if (normalizedWithSpaces.contains(entry.getKey())) {
                return entry.getValue();
            }
        }
        
        // Fallback : retourner les deux premières lettres si disponibles
        if (lettersOnly.length() >= 2) {
            return lettersOnly.substring(0, 2);
        }
        
        return lettersOnly;
    }
    
    /**
     * Récupère les pays distincts depuis une liste de summaries
     * Retourne une chaîne avec les pays séparés par des virgules
     */
    private String getDistinctCountries(List<AgencySummaryEntity> summaries) {
        if (summaries == null || summaries.isEmpty()) {
            return "";
        }
        
        List<String> countries = summaries.stream()
            .map(AgencySummaryEntity::getCountry)
            .map(this::normalizeCountryCode)
            .filter(country -> country != null && !country.isEmpty())
            .distinct()
            .sorted()
            .collect(Collectors.toList());
        
        if (countries.isEmpty()) {
            return "";
        }
        
        // Si un seul pays, le retourner tel quel
        if (countries.size() == 1) {
            return countries.get(0);
        }
        
        // Sinon, les concaténer avec des virgules
        return String.join(", ", countries);
    }
    
    /**
     * Récupère la liste des pays distincts normalisés pour le dropdown
     * Normalise les variantes comme CI et CICTH en un seul CI
     */
    public List<String> getNormalizedDistinctCountries() {
        List<String> allCountries = compteRepository.findDistinctPays();
        
        // Normaliser et dédupliquer les pays
        return allCountries.stream()
            .filter(country -> country != null && !country.trim().isEmpty())
            .map(this::normalizeCountryCode)
            .filter(normalized -> !normalized.isEmpty())
            .distinct()
            .sorted()
            .collect(Collectors.toList());
    }
    
    private static Map<String, String> initCountryKeywordMap() {
        Map<String, String> map = new LinkedHashMap<>();
        map.put("COTE D IVOIRE", "CI");
        map.put("COTE IVOIRE", "CI");
        map.put("COTE DIVOIRE", "CI");
        map.put("COTE DIVOIRES", "CI");
        map.put("SENEGAL", "SN");
        map.put("CAMEROUN", "CM");
        map.put("CAMEROON", "CM");
        map.put("BURKINA FASO", "BF");
        map.put("BURKINA", "BF");
        map.put("MALI", "ML");
        map.put("BENIN", "BJ");
        map.put("GUINEE", "GN");
        map.put("GUINEA", "GN");
        map.put("GABON", "GA");
        map.put("TOGO", "TG");
        map.put("TCHAD", "TD");
        map.put("CHAD", "TD");
        map.put("NIGERIA", "NG");
        map.put("NIGER", "NE");
        map.put("KENYA", "KE");
        map.put("MOZAMBIQUE", "MZ");
        map.put("MOZAMBIC", "MZ");
        return map;
    }
} 