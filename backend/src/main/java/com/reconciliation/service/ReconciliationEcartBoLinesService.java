package com.reconciliation.service;

import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Agrège boOnly + mismatches en lignes prêtes pour ecart-bo-summary (sans transférer les matches).
 */
@Service
public class ReconciliationEcartBoLinesService {

    private static final String[] AGENCE_KEYS = {"Agence", "agence", "AGENCE", "agency", "Agency"};
    private static final String[] SERVICE_KEYS = {"Service", "service", "SERVICE", "serv", "Serv"};
    private static final String[] PAYS_KEYS = {"Pays", "pays", "PAYS", "country", "Country", "GRX", "grx", "Pays provenance", "pays provenance"};
    private static final String[] DATE_KEYS = {"Date", "date", "DATE", "jour", "Jour", "JOUR", "dateTransaction", "DateTransaction", "Date opération", "dateOperation"};
    private static final String[] AMOUNT_KEYS = {"montant", "Montant", "MONTANT", "amount", "Amount", "AMOUNT", "volume", "Volume", "VOLUME"};

    public Map<String, Object> buildSummaryLines(
        List<Map<String, String>> boOnly,
        List<Map<String, String>> mismatches
    ) {
        Map<String, GroupAccumulator> grouped = new LinkedHashMap<>();
        if (boOnly != null) {
            for (Map<String, String> record : boOnly) {
                accumulateRecord(record, grouped);
            }
        }
        if (mismatches != null) {
            for (Map<String, String> record : mismatches) {
                accumulateRecord(record, grouped);
            }
        }

        List<Map<String, Object>> lines = new ArrayList<>();
        for (GroupAccumulator group : grouped.values()) {
            if ("multiAgence".equals(group.agence) && group.multiAgenceRecords != null) {
                for (Map<String, String> record : group.multiAgenceRecords) {
                    lines.add(singleLine(record, group));
                }
                continue;
            }
            Map<String, Object> line = new LinkedHashMap<>();
            line.put("agence", group.agence);
            line.put("service", group.service);
            line.put("pays", group.pays);
            line.put("date", group.date != null && !group.date.isBlank()
                ? group.date
                : LocalDate.now().toString());
            line.put("montant", group.totalMontant);
            line.put("statut", "EN_COURS");
            line.put("nombreTransactions", group.recordCount);
            lines.add(line);
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("lines", lines);
        response.put("totalRecords", countRecords(boOnly) + countRecords(mismatches));
        return response;
    }

    private Map<String, Object> singleLine(Map<String, String> record, GroupAccumulator group) {
        String agence = extractValue(record, AGENCE_KEYS);
        if (agence.isBlank()) {
            agence = group.agence;
        }
        String service = extractValue(record, SERVICE_KEYS);
        if (service.isBlank()) {
            service = group.service;
        }
        String pays = extractValue(record, PAYS_KEYS);
        if (pays.isBlank()) {
            pays = group.pays;
        }
        String date = extractValue(record, DATE_KEYS);
        if (date.isBlank()) {
            date = group.date;
        }
        double montant = parseAmount(extractValue(record, AMOUNT_KEYS));

        Map<String, Object> line = new LinkedHashMap<>();
        line.put("agence", agence);
        line.put("service", service);
        line.put("pays", pays);
        line.put("date", date != null && !date.isBlank() ? date : LocalDate.now().toString());
        line.put("montant", montant);
        line.put("statut", "EN_COURS");
        line.put("nombreTransactions", 1);
        return line;
    }

    private void accumulateRecord(Map<String, String> record, Map<String, GroupAccumulator> grouped) {
        String agence = extractValue(record, AGENCE_KEYS);
        if (agence.isBlank()) {
            agence = "Non spécifié";
        }
        String service = extractValue(record, SERVICE_KEYS);
        if (service.isBlank()) {
            service = "Non spécifié";
        }
        String pays = extractValue(record, PAYS_KEYS);
        if (pays.isBlank()) {
            pays = "Non spécifié";
        }
        String date = extractValue(record, DATE_KEYS);
        double montant = parseAmount(extractValue(record, AMOUNT_KEYS));
        String key = agence + "|" + service + "|" + pays;
        boolean isMultiAgence = "multiAgence".equals(agence);

        final String agenceFinal = agence;
        final String serviceFinal = service;
        final String paysFinal = pays;
        final String dateFinal = date;
        GroupAccumulator group = grouped.computeIfAbsent(key, ignored -> {
            GroupAccumulator created = new GroupAccumulator();
            created.agence = agenceFinal;
            created.service = serviceFinal;
            created.pays = paysFinal;
            created.date = dateFinal;
            if (isMultiAgence) {
                created.multiAgenceRecords = new ArrayList<>();
            }
            return created;
        });

        if (isMultiAgence) {
            group.multiAgenceRecords.add(record);
        } else {
            group.recordCount += 1;
        }
        group.totalMontant += montant;
        if ((group.date == null || group.date.isBlank()) && date != null && !date.isBlank()) {
            group.date = date;
        }
    }

    private static int countRecords(List<Map<String, String>> records) {
        return records != null ? records.size() : 0;
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

    private static final class GroupAccumulator {
        private String agence;
        private String service;
        private String pays;
        private String date;
        private int recordCount;
        private double totalMontant;
        private List<Map<String, String>> multiAgenceRecords;
    }
}
