package com.reconciliation.service;

import com.reconciliation.dto.MonthlyReconciliationKpiDto;
import com.reconciliation.dto.PilotReportDto;
import com.reconciliation.repository.Result8RecRepository;
import org.springframework.stereotype.Service;

import java.text.NumberFormat;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class ReconciliationPilotReportService {
    private final Result8RecRepository result8RecRepository;

    public ReconciliationPilotReportService(Result8RecRepository result8RecRepository) {
        this.result8RecRepository = result8RecRepository;
    }

    public PilotReportDto buildPilotReport(
            List<MonthlyReconciliationKpiDto> monthly,
            Map<String, Object> filters,
            Integer servicesDistinct,
            Integer countriesDistinct,
            Integer agenciesDistinct
    ) {
        PilotReportDto dto = new PilotReportDto();
        dto.title = "RAPPORT DE PILOTAGE — RÉCONCILIATION FINANCIÈRE";
        dto.subtitle = "Synthèse basée sur les données de l’application";
        dto.generatedAtIso = Instant.now().toString();
        dto.filters = filters == null ? Map.of() : filters;
        dto.monthly = monthly == null ? List.of() : monthly;

        PilotReportDto.Summary s = new PilotReportDto.Summary();
        s.servicesDistinct = servicesDistinct == null ? 0 : servicesDistinct;
        s.countriesDistinct = countriesDistinct == null ? 0 : countriesDistinct;
        s.agenciesDistinct = agenciesDistinct == null ? 0 : agenciesDistinct;

        long totalTx = 0L;
        double totalVol = 0.0;
        long totalMatches = 0L;
        long totalEcarts = 0L;

        String startYm = null;
        String endYm = null;

        for (MonthlyReconciliationKpiDto m : dto.monthly) {
            if (m == null || m.yearMonth == null) continue;
            if (startYm == null || m.yearMonth.compareTo(startYm) < 0) startYm = m.yearMonth;
            if (endYm == null || m.yearMonth.compareTo(endYm) > 0) endYm = m.yearMonth;
            totalTx += m.totalTransactions;
            totalVol += m.totalVolume;
            totalMatches += m.matches;
            totalEcarts += m.ecartsTraites;
        }

        s.periodStartYm = startYm;
        s.periodEndYm = endYm;
        s.totalTransactions = totalTx;
        s.totalVolume = totalVol;
        s.totalEcartsTraites = totalEcarts;
        s.tauxCorrespondance = totalTx > 0 ? ((double) totalMatches / (double) totalTx) * 100.0 : 0.0;
        dto.summary = s;

        dto.methodologyBullets = List.of(
                "Les KPI sont calculés à partir des relevés enregistrés dans l’application (table result8rec).",
                "Les indicateurs mensuels sont agrégés par mois (YYYY-MM) avec sommation des volumes et des transactions.",
                "Le taux de correspondance est calculé en pondéré: (Σ matches / Σ totalTransactions).",
                "Les écarts traités sont estimés en: (Σ totalTransactions − Σ matches)."
        );

        dto.benefitsBullets = List.of(
                "Réconciliation flexible: analyse par pays, service et environnement (BET/HT/T-E/…).",
                "Traitement plus rapide: consolidation automatique des KPI et génération de synthèses périodiques.",
                "Fiabilité: indicateurs calculés sur l’ensemble des relevés disponibles dans l’application.",
                "Pilotage: suivi mensuel des volumes, transactions, écarts et taux de correspondance."
        );

        List<String> notes = new ArrayList<>();
        notes.add("Le rapport reflète uniquement les données effectivement présentes dans l’application (période variable selon import).");
        notes.add("Si plusieurs relevés existent pour un même jour/service/pays, l’agrégation mensuelle additionne les lignes enregistrées.");
        dto.notesBullets = notes;

        return dto;
    }

    public String toMarkdown(PilotReportDto r) {
        if (r == null) return "";

        NumberFormat intFmt = NumberFormat.getIntegerInstance(Locale.FRANCE);
        intFmt.setGroupingUsed(true);
        NumberFormat dec2 = NumberFormat.getNumberInstance(Locale.FRANCE);
        dec2.setMaximumFractionDigits(2);
        dec2.setMinimumFractionDigits(2);

        String period = (r.summary != null && r.summary.periodStartYm != null && r.summary.periodEndYm != null)
                ? (r.summary.periodStartYm + " → " + r.summary.periodEndYm)
                : "Période: non déterminée";

        StringBuilder sb = new StringBuilder();
        sb.append(r.title).append("\n");
        sb.append(r.subtitle).append("\n\n");
        sb.append("Période: ").append(period).append("\n\n");

        if (r.summary != null) {
            sb.append("## 1. RÉSUMÉ EXÉCUTIF\n\n");
            sb.append("- Transactions traitées: ").append(intFmt.format(r.summary.totalTransactions)).append("\n");
            sb.append("- Volume total: ").append(intFmt.format(Math.round(r.summary.totalVolume))).append(" FCFA\n");
            sb.append("- Écarts traités (estimés): ").append(intFmt.format(r.summary.totalEcartsTraites)).append("\n");
            sb.append("- Taux de correspondance global: ").append(dec2.format(r.summary.tauxCorrespondance)).append("%\n");
            sb.append("- Services couverts: ").append(intFmt.format(r.summary.servicesDistinct)).append("\n");
            sb.append("- Pays couverts: ").append(intFmt.format(r.summary.countriesDistinct)).append("\n");
            sb.append("- Agences couvertes: ").append(intFmt.format(r.summary.agenciesDistinct)).append("\n\n");
        }

        sb.append("## 2. DONNÉES PAR MOIS\n\n");
        sb.append("| Mois | Transactions | Volume (FCFA) | Écarts traités | Taux |\n");
        sb.append("|---|---:|---:|---:|---:|\n");
        if (r.monthly != null) {
            for (MonthlyReconciliationKpiDto m : r.monthly) {
                if (m == null) continue;
                sb.append("| ").append(m.yearMonth == null ? "" : m.yearMonth).append(" | ")
                        .append(intFmt.format(m.totalTransactions)).append(" | ")
                        .append(intFmt.format(Math.round(m.totalVolume))).append(" | ")
                        .append(intFmt.format(m.ecartsTraites)).append(" | ")
                        .append(dec2.format(m.tauxCorrespondance)).append("% |\n");
            }
        }
        sb.append("\n");

        sb.append("## 3. MÉTHODOLOGIE\n\n");
        if (r.methodologyBullets != null) {
            for (String b : r.methodologyBullets) {
                sb.append("- ").append(b).append("\n");
            }
        }
        sb.append("\n");

        sb.append("## 4. BÉNÉFICES CONSTATÉS\n\n");
        if (r.benefitsBullets != null) {
            for (String b : r.benefitsBullets) {
                sb.append("- ").append(b).append("\n");
            }
        }
        sb.append("\n");

        sb.append("## 5. NOTES / LIMITES\n\n");
        if (r.notesBullets != null) {
            for (String b : r.notesBullets) {
                sb.append("- ").append(b).append("\n");
            }
        }
        sb.append("\n");

        return sb.toString();
    }

    public Map<String, Integer> getDistinctCounts(
            String startYm,
            String endYm,
            String service,
            String env,
            String country,
            List<String> countriesLower
    ) {
        Map<String, Integer> out = new HashMap<>();
        out.put("services", safeInt(result8RecRepository.countDistinctServices(startYm, endYm, service, env, country, countriesLower)));
        out.put("countries", safeInt(result8RecRepository.countDistinctCountries(startYm, endYm, service, env, country, countriesLower)));
        out.put("agencies", safeInt(result8RecRepository.countDistinctAgencies(startYm, endYm, service, env, country, countriesLower)));
        return out;
    }

    private static int safeInt(Long v) {
        if (v == null) return 0;
        if (v > Integer.MAX_VALUE) return Integer.MAX_VALUE;
        if (v < Integer.MIN_VALUE) return Integer.MIN_VALUE;
        return v.intValue();
    }
}

