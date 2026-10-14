package com.reconciliation.service;

import com.reconciliation.entity.AgencySummaryEntity;
import com.reconciliation.entity.FluxEntity;
import com.reconciliation.entity.FraisTransactionEntity;
import com.reconciliation.entity.RedevanceAgenceParamEntity;
import com.reconciliation.repository.AgencySummaryRepository;
import com.reconciliation.repository.FraisTransactionRepository;
import com.reconciliation.repository.RedevanceAgenceParamRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class RedevanceService {

    @Autowired
    private AgencySummaryRepository agencySummaryRepository;

    @Autowired
    private FraisTransactionRepository fraisTransactionRepository;

    @Autowired
    private RedevanceAgenceParamRepository redevanceAgenceParamRepository;

    @Autowired
    private PaysFilterService paysFilterService;

    @Autowired
    private FluxService fluxService;

    private static final Map<String, String> COUNTRY_NAME_TO_CODE = new HashMap<>();
    private static final Map<String, List<String>> COUNTRY_CODE_TO_NAMES = new HashMap<>();
    static {
        COUNTRY_NAME_TO_CODE.put("CAMEROUN", "CM");
        COUNTRY_NAME_TO_CODE.put("CAMEROON", "CM");
        COUNTRY_NAME_TO_CODE.put("CÔTE D'IVOIRE", "CI");
        COUNTRY_NAME_TO_CODE.put("COTE D'IVOIRE", "CI");
        COUNTRY_NAME_TO_CODE.put("SÉNÉGAL", "SN");
        COUNTRY_NAME_TO_CODE.put("SENEGAL", "SN");
        COUNTRY_NAME_TO_CODE.put("BURKINA FASO", "BF");
        COUNTRY_NAME_TO_CODE.put("MALI", "ML");
        COUNTRY_NAME_TO_CODE.put("BÉNIN", "BJ");
        COUNTRY_NAME_TO_CODE.put("BENIN", "BJ");
        COUNTRY_NAME_TO_CODE.put("NIGER", "NE");
        COUNTRY_NAME_TO_CODE.put("TCHAD", "TD");
        COUNTRY_NAME_TO_CODE.put("CITCH", "CI");
        COUNTRY_CODE_TO_NAMES.put("CM", Arrays.asList("CAMEROUN", "CAMEROON"));
        COUNTRY_CODE_TO_NAMES.put("CI", Arrays.asList("CÔTE D'IVOIRE", "COTE D'IVOIRE", "COTE DIVOIRE", "CITCH"));
        COUNTRY_CODE_TO_NAMES.put("SN", Arrays.asList("SÉNÉGAL", "SENEGAL"));
        COUNTRY_CODE_TO_NAMES.put("BF", Arrays.asList("BURKINA FASO", "BURKINA"));
        COUNTRY_CODE_TO_NAMES.put("ML", Arrays.asList("MALI"));
        COUNTRY_CODE_TO_NAMES.put("BJ", Arrays.asList("BÉNIN", "BENIN"));
        COUNTRY_CODE_TO_NAMES.put("NE", Arrays.asList("NIGER"));
        COUNTRY_CODE_TO_NAMES.put("TD", Arrays.asList("TCHAD"));
        COUNTRY_CODE_TO_NAMES.put("TG", Arrays.asList("TOGO"));
    }

    /**
     * Calcule les données redevance selon les filtres.
     * Payin/Payout : si un flux (FLUX TRANSACTION) existe pour l'agence et la période, on utilise ses champs payin/payout pour le calcul du Produit Brut de Jeux (95% × (PAYIN − PAYOUT)). Sinon, Payin = services PAIEMENT, Payout = services CASHIN (agency_summary).
     */
    public Map<String, Object> computeRedevance(String agence, List<String> pays, String startDate, String endDate, String username) {
        List<String> allowedCountries = (username != null && !username.isEmpty())
            ? paysFilterService.getAllowedPaysCodes(username)
            : null;
        if (allowedCountries != null && allowedCountries.isEmpty()) {
            return new LinkedHashMap<>();
        }
        List<String> countryFilter = resolveCountriesForQuery(pays, allowedCountries);
        if (countryFilter != null && countryFilter.isEmpty()) {
            return new LinkedHashMap<>();
        }
        String agencyFilter = (agence != null && !agence.trim().isEmpty()) ? agence.trim() : null;

        double payin = 0, payout = 0, totalMises = 0, totalGains = 0, totalBonus = 0;
        double retenueSurGainsFromFlux = 0;
        boolean useFlux = false;

        List<AgencySummaryEntity> summaries = agencySummaryRepository.findByFiltersForRedevance(
            agencyFilter,
            countryFilter,
            (startDate != null && !startDate.isEmpty()) ? startDate : null,
            (endDate != null && !endDate.isEmpty()) ? endDate : null
        );

        for (AgencySummaryEntity s : summaries) {
            String svc = (s.getService() != null) ? s.getService().toUpperCase() : "";
            double vol = s.getTotalVolume();
            if (svc.contains("PAIEMENT")) {
                payin += vol;
            }
            if (svc.contains("CASHIN")) {
                payout += vol;
            }
        }

        if (agencyFilter != null && startDate != null && !startDate.isEmpty() && endDate != null && !endDate.isEmpty()) {
            try {
                LocalDate dDebut = LocalDate.parse(startDate);
                LocalDate dFin = LocalDate.parse(endDate);
                var fluxOpt = fluxService.findByAgenceAndPeriod(agencyFilter, dDebut, dFin);
                if (fluxOpt.isPresent()) {
                    FluxEntity flux = fluxOpt.get();
                    totalMises = flux.getTotalMises() != null ? flux.getTotalMises() : 0;
                    totalGains = flux.getTotalGains() != null ? flux.getTotalGains() : 0;
                    totalBonus = flux.getTotalBonus() != null ? flux.getTotalBonus() : 0;
                    retenueSurGainsFromFlux = flux.getRetenueSurGains() != null ? flux.getRetenueSurGains() : 0;
                    // PAYIN / PAYOUT au niveau FLUX TRANSACTION pour le calcul PBJ (95%)
                    payin = flux.getPayin() != null ? flux.getPayin() : 0;
                    payout = flux.getPayout() != null ? flux.getPayout() : 0;
                    useFlux = true;
                }
            } catch (Exception ignored) {}
        }

        double chiffreAffairesBrut = totalMises - totalBonus;
        double tauxPayin = getTauxPayin(agence);
        double tauxPayout = getTauxPayout(agence);
        RedevanceAgenceParamEntity params = getParams(agence);
        double taxeJeuxHasardPct = params != null ? params.getTaxeJeuxHasardPourcentage() : 5.0;
        double retenueSurGainsPct = params != null ? params.getRetenueSurGainsPourcentage() : 15.0;
        double retenueSeuil = params != null ? params.getRetenueSurGainsSeuil() : 500000.0;
        double tauxRedevancePct = params != null ? params.getTauxRedevancePourcentage() : 50.0;

        double taxeSurJeuxHasard = chiffreAffairesBrut * (taxeJeuxHasardPct / 100.0);
        double retenueSurGains = useFlux ? retenueSurGainsFromFlux : 0;
        // Produit Brut de Jeux = 95% × (PAYIN − PAYOUT)
        double produitBrutJeux = 0.95 * (payin - payout);
        double remunerationIntegrateur = (payin * (tauxPayin / 100.0)) + (payout * (tauxPayout / 100.0));
        double revenuGenereActCom = produitBrutJeux - remunerationIntegrateur;
        double baseCalcul = revenuGenereActCom;
        double redevanceTotale = baseCalcul * (tauxRedevancePct / 100.0);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("payin", payin);
        result.put("payout", payout);
        result.put("totalMises", totalMises);
        result.put("totalGains", totalGains);
        result.put("totalBonus", totalBonus);
        result.put("chiffreAffairesBrut", chiffreAffairesBrut);
        result.put("taxeSurJeuxHasard", taxeSurJeuxHasard);
        result.put("retenueSurGains", retenueSurGains);
        result.put("produitBrutJeux", produitBrutJeux);
        result.put("remunerationIntegrateur", remunerationIntegrateur);
        result.put("revenuGenereActCom", revenuGenereActCom);
        result.put("baseCalcul", baseCalcul);
        result.put("redevanceTotale", redevanceTotale);
        result.put("tauxPayin", tauxPayin);
        result.put("tauxPayout", tauxPayout);
        result.put("retenueSurGainsPourcentage", retenueSurGainsPct);
        result.put("retenueSurGainsSeuil", retenueSeuil);
        result.put("taxeJeuxHasardPourcentage", taxeJeuxHasardPct);
        result.put("tauxRedevancePourcentage", tauxRedevancePct);
        result.put("operateur", agence != null ? agence : "");
        result.put("periode", formatPeriode(startDate, endDate));
        result.put("fluxFromTable", useFlux);
        return result;
    }

    /** Résout les pays en noms pour la requête (agency_summary stocke les noms) */
    private List<String> resolveCountriesForQuery(List<String> pays, List<String> allowedCountries) {
        Set<String> codes = new HashSet<>();
        if (pays != null && !pays.isEmpty()) {
            for (String p : pays) {
                if (p == null || p.trim().isEmpty()) continue;
                String code = p.length() <= 3 ? p.toUpperCase() : COUNTRY_NAME_TO_CODE.getOrDefault(p.toUpperCase().trim(), p.toUpperCase());
                codes.add(code);
            }
        } else if (allowedCountries != null && !allowedCountries.isEmpty()) {
            codes.addAll(allowedCountries);
        } else if (allowedCountries == null) {
            return null;
        }
        if (allowedCountries != null && !allowedCountries.isEmpty()) {
            codes.retainAll(allowedCountries);
        }
        if (codes.isEmpty()) return null;
        List<String> names = new ArrayList<>();
        for (String code : codes) {
            List<String> n = COUNTRY_CODE_TO_NAMES.get(code);
            if (n != null) names.addAll(n);
            else names.add(code);
        }
        return names;
    }

    private double getTauxPayin(String agence) {
        if (agence == null || agence.trim().isEmpty()) return 2.5;
        List<FraisTransactionEntity> frais = fraisTransactionRepository.findByAgenceAndActifTrueOrderByDateModificationDesc(agence.trim());
        List<Double> pcts = frais.stream()
            .filter(f -> f.getService() != null && f.getService().toUpperCase().contains("PAIEMENT") && "POURCENTAGE".equals(f.getTypeCalcul()) && f.getPourcentage() != null)
            .map(FraisTransactionEntity::getPourcentage)
            .collect(Collectors.toList());
        return pcts.isEmpty() ? 2.5 : pcts.stream().mapToDouble(Double::doubleValue).average().orElse(2.5);
    }

    private double getTauxPayout(String agence) {
        if (agence == null || agence.trim().isEmpty()) return 3.0;
        List<FraisTransactionEntity> frais = fraisTransactionRepository.findByAgenceAndActifTrueOrderByDateModificationDesc(agence.trim());
        List<Double> pcts = frais.stream()
            .filter(f -> f.getService() != null && f.getService().toUpperCase().contains("CASHIN") && "POURCENTAGE".equals(f.getTypeCalcul()) && f.getPourcentage() != null)
            .map(FraisTransactionEntity::getPourcentage)
            .collect(Collectors.toList());
        return pcts.isEmpty() ? 3.0 : pcts.stream().mapToDouble(Double::doubleValue).average().orElse(3.0);
    }

    private RedevanceAgenceParamEntity getParams(String agence) {
        if (agence == null || agence.trim().isEmpty()) return null;
        return redevanceAgenceParamRepository.findByAgence(agence.trim()).orElse(null);
    }

    private String formatPeriode(String start, String end) {
        if (start == null && end == null) return "";
        if (start != null && end != null && start.equals(end)) return start;
        return (start != null ? start : "?") + " - " + (end != null ? end : "?");
    }

    public RedevanceAgenceParamEntity getOrCreateParams(String agence) {
        return redevanceAgenceParamRepository.findByAgence(agence)
            .orElseGet(() -> {
                RedevanceAgenceParamEntity p = new RedevanceAgenceParamEntity();
                p.setAgence(agence);
                return redevanceAgenceParamRepository.save(p);
            });
    }

    public RedevanceAgenceParamEntity saveParams(RedevanceAgenceParamEntity params) {
        if (params.getAgence() == null || params.getAgence().trim().isEmpty()) {
            throw new IllegalArgumentException("Agence requise");
        }
        RedevanceAgenceParamEntity existing = redevanceAgenceParamRepository.findByAgence(params.getAgence()).orElse(null);
        if (existing != null) {
            existing.setRetenueSurGainsPourcentage(params.getRetenueSurGainsPourcentage());
            existing.setRetenueSurGainsSeuil(params.getRetenueSurGainsSeuil());
            existing.setTaxeJeuxHasardPourcentage(params.getTaxeJeuxHasardPourcentage());
            existing.setTauxRedevancePourcentage(params.getTauxRedevancePourcentage());
            return redevanceAgenceParamRepository.save(existing);
        }
        return redevanceAgenceParamRepository.save(params);
    }
}
