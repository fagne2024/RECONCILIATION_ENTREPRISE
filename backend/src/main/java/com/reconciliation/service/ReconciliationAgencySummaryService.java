package com.reconciliation.service;

import com.reconciliation.dto.ReconciliationResponse;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Agrège le résumé par agence/service/pays à partir du résultat en cache,
 * sans transférer toutes les lignes détaillées au client.
 */
@Service
public class ReconciliationAgencySummaryService {

    private static final String[] AGENCE_KEYS = {"Agence", "agence", "AGENCE", "agency", "Agency"};
    private static final String[] SERVICE_KEYS = {"Service", "service", "SERVICE", "serv", "Serv"};
    private static final String[] PAYS_KEYS = {"Pays", "pays", "PAYS", "country", "Country", "GRX", "grx", "Pays provenance", "pays provenance"};
    private static final String[] DATE_KEYS = {"Date", "date", "DATE", "jour", "Jour", "JOUR", "dateTransaction", "DateTransaction", "Date opération", "dateOperation"};
    private static final String[] AMOUNT_KEYS = {"montant", "Montant", "MONTANT", "amount", "Amount", "AMOUNT", "volume", "Volume", "VOLUME"};

    public Map<String, Object> buildAgencySummary(ReconciliationResponse result) {
        Map<String, SummaryEntry> summaryMap = new LinkedHashMap<>();
        int partnerOnlyWithoutAgency = 0;
        boolean hasPartnerOnlyWithAgencyService = false;

        if (result.getMatches() != null) {
            for (ReconciliationResponse.Match match : result.getMatches()) {
                Map<String, String> boData = match != null ? match.getBoData() : null;
                addBoRecord(summaryMap, boData, "matches");
            }
        }
        if (result.getBoOnly() != null) {
            for (Map<String, String> record : result.getBoOnly()) {
                addBoRecord(summaryMap, record, "boOnly");
            }
        }
        if (result.getMismatches() != null) {
            for (Map<String, String> record : result.getMismatches()) {
                addBoRecord(summaryMap, record, "mismatches");
            }
        }
        if (result.getPartnerOnly() != null) {
            for (Map<String, String> record : result.getPartnerOnly()) {
                String agency = extractValue(record, AGENCE_KEYS);
                String service = extractValue(record, SERVICE_KEYS);
                if (agency.isBlank()) {
                    agency = "Inconnue";
                }
                if (service.isBlank()) {
                    service = "Inconnu";
                }
                if (!"Inconnue".equals(agency) && !"Inconnu".equals(service)) {
                    hasPartnerOnlyWithAgencyService = true;
                    String country = normalizeCountry(extractValue(record, PAYS_KEYS));
                    String date = normalizeDate(extractValue(record, DATE_KEYS));
                    SummaryEntry entry = ensureEntry(summaryMap, agency, service, country, date);
                    entry.partnerOnly++;
                    // Ne pas incrémenter recordCount/totalVolume ici :
                    // recordCount et totalVolume doivent refléter les transactions BO (matches/boOnly/mismatches),
                    // pas les lignes partenaire-only.
                } else {
                    partnerOnlyWithoutAgency++;
                }
            }
        }

        List<Map<String, Object>> summary = new ArrayList<>();
        for (SummaryEntry entry : summaryMap.values()) {
            summary.add(entry.toMap());
        }
        summary.sort(Comparator
            .comparing((Map<String, Object> row) -> String.valueOf(row.get("agency")))
            .thenComparing(row -> String.valueOf(row.get("service"))));

        int totalPartnerOnly = summary.stream()
            .mapToInt(row -> ((Number) row.getOrDefault("partnerOnly", 0)).intValue())
            .sum() + partnerOnlyWithoutAgency;

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("totalPartnerOnly", totalPartnerOnly);
        meta.put("hasPartnerOnlyWithAgencyService", hasPartnerOnlyWithAgencyService);
        meta.put("partnerOnlyWithoutAgency", partnerOnlyWithoutAgency);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("summary", summary);
        response.put("meta", meta);
        return response;
    }

    private void addBoRecord(Map<String, SummaryEntry> summaryMap, Map<String, String> record, String field) {
        String agency = extractValue(record, AGENCE_KEYS);
        String service = extractValue(record, SERVICE_KEYS);
        if (agency.isBlank()) {
            agency = "Inconnue";
        }
        if (service.isBlank()) {
            service = "Inconnu";
        }
        String country = normalizeCountry(extractValue(record, PAYS_KEYS));
        String date = normalizeDate(extractValue(record, DATE_KEYS));
        SummaryEntry entry = ensureEntry(summaryMap, agency, service, country, date);
        switch (field) {
            case "matches" -> entry.matches++;
            case "boOnly" -> entry.boOnly++;
            case "mismatches" -> entry.mismatches++;
            default -> {
            }
        }
        entry.recordCount++;
        entry.totalVolume += parseAmount(extractValue(record, AMOUNT_KEYS));
    }

    private SummaryEntry ensureEntry(
        Map<String, SummaryEntry> summaryMap,
        String agency,
        String service,
        String country,
        String date
    ) {
        // Regroupement par agence + service + pays (tous jours confondus).
        // La date affichée est la plus récente rencontrée.
        String day = normalizeDate(date);
        String key = agency + "|" + service + "|" + country;
        SummaryEntry entry = summaryMap.computeIfAbsent(key, ignored -> new SummaryEntry(agency, service, country, day));
        if (day.compareTo(entry.date) > 0) {
            entry.date = day;
        }
        return entry;
    }

    /**
     * Normalise une date au format yyyy-MM-dd pour agrégation journalière.
     * Sans cela, des timestamps différents créent une ligne par transaction.
     */
    private static String normalizeDate(String raw) {
        if (raw == null || raw.isBlank()) {
            return java.time.LocalDate.now().toString();
        }
        String value = raw.trim();
        // ISO: 2026-07-07T12:30:00 / 2026-07-07 12:30:00
        if (value.length() >= 10 && value.charAt(4) == '-' && value.charAt(7) == '-') {
            return value.substring(0, 10);
        }
        // dd/MM/yyyy[ HH:mm[:ss]]
        java.util.regex.Matcher dmy = java.util.regex.Pattern
            .compile("^(\\d{2})/(\\d{2})/(\\d{4})")
            .matcher(value);
        if (dmy.find()) {
            return dmy.group(3) + "-" + dmy.group(2) + "-" + dmy.group(1);
        }
        // dd-MM-yyyy
        java.util.regex.Matcher dmyDash = java.util.regex.Pattern
            .compile("^(\\d{2})-(\\d{2})-(\\d{4})")
            .matcher(value);
        if (dmyDash.find()) {
            return dmyDash.group(3) + "-" + dmyDash.group(2) + "-" + dmyDash.group(1);
        }
        try {
            return java.time.LocalDate.parse(value.substring(0, Math.min(value.length(), 10))).toString();
        } catch (Exception ignored) {
            return java.time.LocalDate.now().toString();
        }
    }

    private static String extractValue(Map<String, String> record, String... keys) {
        if (record == null || record.isEmpty()) {
            return "";
        }
        for (String expected : keys) {
            for (Map.Entry<String, String> entry : record.entrySet()) {
                if (entry.getKey() != null
                    && entry.getKey().equalsIgnoreCase(expected)
                    && entry.getValue() != null
                    && !entry.getValue().isBlank()) {
                    return entry.getValue().trim();
                }
            }
        }
        return "";
    }

    private static String normalizeCountry(String raw) {
        if (raw == null || raw.isBlank()) {
            return "Inconnu";
        }
        return raw.trim();
    }

    private static double parseAmount(String raw) {
        if (raw == null || raw.isBlank()) {
            return 0d;
        }
        String cleaned = raw.replace(" ", "").replace(",", ".");
        try {
            return Double.parseDouble(cleaned);
        } catch (NumberFormatException e) {
            return 0d;
        }
    }

    private static final class SummaryEntry {
        private final String agency;
        private final String service;
        private final String country;
        private String date;
        private double totalVolume;
        private int recordCount;
        private int matches;
        private int boOnly;
        private int partnerOnly;
        private int mismatches;

        private SummaryEntry(String agency, String service, String country, String date) {
            this.agency = agency;
            this.service = service;
            this.country = country;
            this.date = date;
        }

        private Map<String, Object> toMap() {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("agency", agency);
            row.put("service", service);
            row.put("country", country);
            row.put("date", date);
            row.put("totalVolume", totalVolume);
            row.put("recordCount", recordCount);
            row.put("matches", matches);
            row.put("boOnly", boOnly);
            row.put("partnerOnly", partnerOnly);
            row.put("mismatches", mismatches);
            return row;
        }
    }
}
