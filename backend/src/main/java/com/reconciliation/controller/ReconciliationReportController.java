package com.reconciliation.controller;

import com.reconciliation.dto.ReleveManualDto;
import com.reconciliation.dto.MonthlyReconciliationKpiDto;
import com.reconciliation.dto.PilotReportDto;
import com.reconciliation.entity.ReleveManualEntity;
import com.reconciliation.entity.UserEntity;
import com.reconciliation.repository.ReleveManualRepository;
import com.reconciliation.repository.Result8RecRepository;
import com.reconciliation.repository.UserRepository;
import com.reconciliation.service.EmailService;
import com.reconciliation.service.PaysFilterService;
import com.reconciliation.service.ReconciliationPilotReportService;
import com.reconciliation.util.RequestContextUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Slf4j
@RestController
@RequestMapping("/api/reconciliation-report")
@RequiredArgsConstructor
public class ReconciliationReportController {

    private final ReleveManualRepository releveManualRepository;
    private final Result8RecRepository result8RecRepository;
    private final PaysFilterService paysFilterService;
    private final ReconciliationPilotReportService pilotReportService;
    private final UserRepository userRepository;
    private final EmailService emailService;

    @GetMapping("/manual-trx")
    public ResponseEntity<?> getManualTrx(
            @RequestParam("date") String dateStr,
            @RequestParam("service") String service,
            @RequestParam("country") String country,
            @RequestParam(value = "env", required = false) String envStr
    ) {
        try {
            LocalDate date = LocalDate.parse(dateStr);
            String env = (envStr == null || envStr.isBlank()) ? "TOTAL" : envStr.trim();
            Optional<ReleveManualEntity> opt = releveManualRepository.findByReleveKey(date, service, country, env);

            Map<String, Object> body = new HashMap<>();
            if (opt.isPresent()) {
                ReleveManualEntity e = opt.get();
                body.put("manualNombre", e.getManualNombre() != null ? e.getManualNombre() : 0L);
                body.put("manualVolume", e.getManualVolume() != null ? e.getManualVolume() : 0.0);
                body.put("rembourseNombre", e.getRembourseNombre() != null ? e.getRembourseNombre() : 0L);
                body.put("rembourseVolume", e.getRembourseVolume() != null ? e.getRembourseVolume() : 0.0);
                body.put("env", e.getEnv());
            } else {
                body.put("manualNombre", 0L);
                body.put("manualVolume", 0.0);
                body.put("rembourseNombre", 0L);
                body.put("rembourseVolume", 0.0);
            }
            return ResponseEntity.ok(body);
        } catch (DateTimeParseException ex) {
            log.warn("Invalid date format for /manual-trx: {}", dateStr, ex);
            return ResponseEntity.badRequest().body(Map.of("error", "Format de date invalide, attendu YYYY-MM-DD"));
        } catch (Exception e) {
            log.error("Error in getManualTrx", e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Liste des saisies manuelles relevé (trx traité / trx remboursé) sur une plage de dates,
     * pour agrégation dashboard (statistiques réconciliation).
     */
    @GetMapping("/manual-trx/range")
    public ResponseEntity<?> listManualTrxByRange(
            @RequestParam("startDate") String startDateStr,
            @RequestParam("endDate") String endDateStr,
            @RequestParam(value = "country", required = false) String countryFilter,
            @RequestParam(value = "service", required = false) List<String> servicesFilter,
            @RequestParam(value = "env", required = false) String envFilter
    ) {
        try {
            LocalDate start = LocalDate.parse(startDateStr);
            LocalDate end = LocalDate.parse(endDateStr);
            if (end.isBefore(start)) {
                return ResponseEntity.badRequest().body(Map.of("error", "endDate doit être supérieur ou égal à startDate"));
            }

            String country = (countryFilter == null || countryFilter.isBlank()) ? null : countryFilter.trim();
            List<String> serviceAllowList = null;
            if (servicesFilter != null && !servicesFilter.isEmpty()) {
                serviceAllowList = servicesFilter.stream()
                        .filter(s -> s != null && !s.isBlank())
                        .map(String::trim)
                        .distinct()
                        .toList();
                if (serviceAllowList.isEmpty()) {
                    serviceAllowList = null;
                }
            }
            String envNorm = normalizeEnvForRangeFilter(envFilter);

            List<ReleveManualEntity> rows;
            if (country != null || serviceAllowList != null) {
                rows = releveManualRepository.findForReportRange(start, end, country, serviceAllowList);
            } else {
                rows = releveManualRepository.findByDateBetween(start, end);
            }

            List<Map<String, Object>> out = new ArrayList<>();
            for (ReleveManualEntity e : rows) {
                if (country != null && !country.equals(e.getCountry())) {
                    continue;
                }
                if (serviceAllowList != null && !serviceAllowList.contains(e.getService())) {
                    continue;
                }
                if (envNorm != null && !envNorm.equals(normalizeStoredEnvForRange(e.getEnv()))) {
                    continue;
                }
                Map<String, Object> m = new HashMap<>();
                m.put("date", e.getDate().toString());
                m.put("service", e.getService());
                m.put("country", e.getCountry());
                m.put("env", e.getEnv());
                m.put("manualNombre", e.getManualNombre() != null ? e.getManualNombre() : 0L);
                m.put("manualVolume", e.getManualVolume() != null ? e.getManualVolume() : 0.0);
                m.put("rembourseNombre", e.getRembourseNombre() != null ? e.getRembourseNombre() : 0L);
                m.put("rembourseVolume", e.getRembourseVolume() != null ? e.getRembourseVolume() : 0.0);
                out.add(m);
            }
            return ResponseEntity.ok(out);
        } catch (DateTimeParseException ex) {
            log.warn("Invalid date in /manual-trx/range: {} {}", startDateStr, endDateStr, ex);
            return ResponseEntity.badRequest().body(Map.of("error", "Format de date invalide, attendu YYYY-MM-DD"));
        } catch (Exception e) {
            log.error("Error in listManualTrxByRange", e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /** Paramètre requête : ALL → pas de filtre env ; sinon clé comparable aux lignes stockées. */
    private static String normalizeEnvForRangeFilter(String env) {
        if (env == null || env.isBlank() || "ALL".equalsIgnoreCase(env.trim())) {
            return null;
        }
        return normalizeStoredEnvForRange(env);
    }

    /** Ligne releve_manual : env null / TOTAL / T-E regroupés comme le front (T-E). */
    private static String normalizeStoredEnvForRange(String env) {
        if (env == null || env.isBlank()) {
            return "T-E";
        }
        String u = env.trim().toUpperCase();
        if ("TOTAL".equals(u) || "T-E".equals(u) || "T_E".equals(u)) {
            return "T-E";
        }
        return u;
    }

    @PostMapping("/manual-trx")
    public ResponseEntity<?> saveManualTrx(@RequestBody ReleveManualDto dto) {
        if (dto == null || dto.date == null || dto.service == null || dto.country == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "date, service et country sont obligatoires"));
        }

        try {
            LocalDate date = LocalDate.parse(dto.date);
            String normalizedEnv = (dto.env == null || dto.env.isBlank()) ? "TOTAL" : dto.env.trim();

            ReleveManualEntity entity = releveManualRepository
                    .findByReleveKey(date, dto.service, dto.country, normalizedEnv)
                    .orElseGet(ReleveManualEntity::new);

            entity.setDate(date);
            entity.setService(dto.service);
            entity.setCountry(dto.country);
            entity.setEnv(normalizedEnv);
            entity.setManualNombre(dto.manualNombre != null ? dto.manualNombre : 0L);
            entity.setManualVolume(dto.manualVolume != null ? dto.manualVolume : 0.0);
            entity.setRembourseNombre(dto.rembourseNombre != null ? dto.rembourseNombre : 0L);
            entity.setRembourseVolume(dto.rembourseVolume != null ? dto.rembourseVolume : 0.0);
            entity.setUpdatedAt(LocalDateTime.now());

            ReleveManualEntity saved = releveManualRepository.save(entity);

            Map<String, Object> body = new HashMap<>();
            body.put("id", saved.getId());
            body.put("manualNombre", saved.getManualNombre());
            body.put("manualVolume", saved.getManualVolume());
            body.put("rembourseNombre", saved.getRembourseNombre());
            body.put("rembourseVolume", saved.getRembourseVolume());

            return ResponseEntity.ok(body);
        } catch (DateTimeParseException ex) {
            log.warn("Invalid date format for /manual-trx save: {}", dto.date, ex);
            return ResponseEntity.badRequest().body(Map.of("error", "Format de date invalide, attendu YYYY-MM-DD"));
        } catch (Exception e) {
            log.error("Error in saveManualTrx", e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * KPI mensuels de réconciliation (basé sur result8rec), utilisable pour générer un rapport
     * type "pilote" (Transactions, Volume, Écarts traités, Taux de correspondance).
     *
     * Paramètres:
     * - startYm / endYm: bornes inclusives au format YYYY-MM
     * - country/service/env: filtres optionnels
     */
    @GetMapping("/monthly-kpis")
    public ResponseEntity<?> getMonthlyKpis(
            @RequestParam(value = "startYm", required = false) String startYm,
            @RequestParam(value = "endYm", required = false) String endYm,
            @RequestParam(value = "country", required = false) String country,
            @RequestParam(value = "service", required = false) String service,
            @RequestParam(value = "env", required = false) String env
    ) {
        try {
            String username = RequestContextUtil.getUsernameFromRequest();

            // Cloisonnement pays
            List<String> allowedCountries = null;
            if (username != null && !username.isEmpty()) {
                allowedCountries = paysFilterService.getAllowedPaysCodes(username);
            }
            List<String> allowedCountriesLower = null;
            if (allowedCountries != null) {
                allowedCountriesLower = allowedCountries.stream()
                        .filter(c -> c != null && !c.isBlank())
                        .map(c -> c.trim().toLowerCase())
                        .distinct()
                        .toList();
            }
            // Aucun pays autorisé => aucune donnée retournée (évite IN () côté JPA)
            if (allowedCountriesLower != null && allowedCountriesLower.isEmpty()) {
                return ResponseEntity.ok(List.of());
            }

            String envNorm = (env == null || env.isBlank()) ? null : env.trim();
            String serviceNorm = (service == null || service.isBlank()) ? null : service.trim();
            String countryNorm = (country == null || country.isBlank()) ? null : country.trim();

            // Si un filtre country est fourni et qu'on a une allow-list, on réduit la liste
            if (countryNorm != null && allowedCountriesLower != null && !allowedCountriesLower.isEmpty()) {
                String cLower = countryNorm.toLowerCase();
                if (!allowedCountriesLower.contains(cLower)) {
                    return ResponseEntity.ok(List.of());
                }
                allowedCountriesLower = List.of(cLower);
            }

            List<Object[]> rows = result8RecRepository.aggregateMonthlyKpis(
                    startYm, endYm, serviceNorm, envNorm, countryNorm, allowedCountriesLower
            );

            List<MonthlyReconciliationKpiDto> out = new ArrayList<>();
            for (Object[] r : rows) {
                String ym = (String) r[0];
                long totalTransactions = r[1] == null ? 0L : ((Number) r[1]).longValue();
                double totalVolume = r[2] == null ? 0.0 : ((Number) r[2]).doubleValue();
                long matches = r[3] == null ? 0L : ((Number) r[3]).longValue();

                long ecarts = Math.max(0L, totalTransactions - matches);
                double rate = totalTransactions > 0 ? ((double) matches / (double) totalTransactions) * 100.0 : 0.0;

                out.add(new MonthlyReconciliationKpiDto(ym, totalTransactions, totalVolume, matches, ecarts, rate));
            }

            return ResponseEntity.ok(out);
        } catch (Exception e) {
            log.error("Error in getMonthlyKpis", e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Génère un rapport complet inspiré des captures (mais basé sur les données de l'application).
     * format:
     * - json (défaut): structure exploitable par le frontend
     * - markdown: texte copiable dans Word/PPT
     */
    @GetMapping("/pilot-report")
    public ResponseEntity<?> getPilotReport(
            @RequestParam(value = "startYm", required = false) String startYm,
            @RequestParam(value = "endYm", required = false) String endYm,
            @RequestParam(value = "country", required = false) String country,
            @RequestParam(value = "service", required = false) String service,
            @RequestParam(value = "env", required = false) String env,
            @RequestParam(value = "format", required = false, defaultValue = "json") String format
    ) {
        try {
            // Réutiliser la logique monthly-kpis (mêmes règles de cloisonnement)
            ResponseEntity<?> monthlyResp = getMonthlyKpis(startYm, endYm, country, service, env);
            Object body = monthlyResp.getBody();
            if (!(body instanceof List<?> list)) {
                return ResponseEntity.internalServerError().body(Map.of("error", "Réponse monthly-kpis inattendue"));
            }

            List<MonthlyReconciliationKpiDto> monthly = new ArrayList<>();
            for (Object o : list) {
                if (o instanceof MonthlyReconciliationKpiDto dto) {
                    monthly.add(dto);
                }
            }

            String username = RequestContextUtil.getUsernameFromRequest();
            List<String> allowedCountries = null;
            if (username != null && !username.isEmpty()) {
                allowedCountries = paysFilterService.getAllowedPaysCodes(username);
            }
            List<String> allowedCountriesLower = null;
            if (allowedCountries != null) {
                allowedCountriesLower = allowedCountries.stream()
                        .filter(c -> c != null && !c.isBlank())
                        .map(c -> c.trim().toLowerCase())
                        .distinct()
                        .toList();
            }
            // Aucun pays autorisé => rapport vide (évite IN () côté JPA)
            if (allowedCountriesLower != null && allowedCountriesLower.isEmpty()) {
                if ("markdown".equalsIgnoreCase(format)) {
                    return ResponseEntity.ok("");
                }
                return ResponseEntity.ok(new PilotReportDto());
            }

            String envNorm = (env == null || env.isBlank()) ? null : env.trim();
            String serviceNorm = (service == null || service.isBlank()) ? null : service.trim();
            String countryNorm = (country == null || country.isBlank()) ? null : country.trim();

            if (countryNorm != null && allowedCountriesLower != null && !allowedCountriesLower.isEmpty()) {
                String cLower = countryNorm.toLowerCase();
                if (!allowedCountriesLower.contains(cLower)) {
                    if ("markdown".equalsIgnoreCase(format)) {
                        return ResponseEntity.ok("");
                    }
                    return ResponseEntity.ok(new PilotReportDto());
                }
                allowedCountriesLower = List.of(cLower);
            }

            Map<String, Integer> distinct = pilotReportService.getDistinctCounts(
                    startYm, endYm, serviceNorm, envNorm, countryNorm, allowedCountriesLower
            );

            Map<String, Object> filters = new HashMap<>();
            if (startYm != null) filters.put("startYm", startYm);
            if (endYm != null) filters.put("endYm", endYm);
            if (countryNorm != null) filters.put("country", countryNorm);
            if (serviceNorm != null) filters.put("service", serviceNorm);
            if (envNorm != null) filters.put("env", envNorm);

            PilotReportDto report = pilotReportService.buildPilotReport(
                    monthly,
                    filters,
                    distinct.get("services"),
                    distinct.get("countries"),
                    distinct.get("agencies")
            );

            if ("markdown".equalsIgnoreCase(format)) {
                String md = pilotReportService.toMarkdown(report);
                return ResponseEntity.ok(md);
            }
            return ResponseEntity.ok(report);
        } catch (Exception e) {
            log.error("Error in getPilotReport", e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Envoie un email de notification pour la validation d'un relevé
     * (à partir du niveau Responsable CDO)
     */
    @PostMapping("/send-validation-email")
    public ResponseEntity<Map<String, String>> sendReleveValidationEmail(
            @RequestBody SendReleveValidationEmailRequest request,
            HttpServletRequest httpRequest) {
        try {
            String username = RequestContextUtil.getUsernameFromRequest();
            if (username == null || username.isBlank()) {
                return ResponseEntity.status(401).body(Map.of(
                    "status", "ERROR",
                    "message", "Non authentifié"
                ));
            }

            log.info("📧 Envoi d'email de validation du relevé - Service: {}, Date: {}, Pays: {}, Env: {}, Traitement: {} par utilisateur: {}",
                    request.getService(), request.getDate(), request.getCountry(), request.getEnv(), request.getTraitement(), username);

            Optional<UserEntity> userOpt = userRepository.findByUsername(username);
            if (userOpt.isEmpty() || userOpt.get().getEmail() == null || userOpt.get().getEmail().trim().isEmpty()) {
                log.warn("Utilisateur non trouvé ou sans email: {}", username);
            }

            boolean isRejet = "REJET".equalsIgnoreCase(request.getTraitement()) || 
                             (request.getCommentaire() != null && request.getCommentaire().toUpperCase().contains("REJET"));
            
            String emailSubject = isRejet 
                ? "Rejet de relevé de service - " + (request.getService() != null ? request.getService() : "")
                : "Validation de relevé de service - " + (request.getService() != null ? request.getService() : "");
            
            String actionText = isRejet 
                ? "La réconciliation du service a été rejetée." 
                : "La réconciliation du service a été validée.";
            
            String emailBody = String.format(
                "Bonjour,\n\n" +
                "%s\n\n" +
                "Détails :\n" +
                "-------------------\n" +
                "Service : %s\n" +
                "Date : %s\n" +
                "Pays : %s\n" +
                "Environnement : %s\n" +
                "Niveau de traitement : %s\n\n" +
                "%s\n\n" +
                "Date : %s\n" +
                "%s par : %s\n\n" +
                "Cordialement,\n" +
                "L'équipe de réconciliation",
                actionText,
                request.getService() != null ? request.getService() : "-",
                request.getDate() != null ? request.getDate() : "-",
                request.getCountry() != null ? request.getCountry() : "-",
                request.getEnv() != null ? request.getEnv() : "-",
                request.getTraitement() != null ? request.getTraitement() : "-",
                request.getCommentaire() != null && !request.getCommentaire().isBlank() ? (isRejet ? "Motif du rejet : " : "Commentaire : ") + request.getCommentaire() : "",
                LocalDateTime.now().toString().replace('T', ' '),
                isRejet ? "Rejeté" : "Validé",
                username
            );

            try {
                // Collect all recipients: user + destinataires + copie
                Set<String> allRecipients = new LinkedHashSet<>();
                if (userOpt.isPresent() && userOpt.get().getEmail() != null && !userOpt.get().getEmail().trim().isEmpty()) {
                    allRecipients.add(userOpt.get().getEmail().trim());
                }
                if (request.getDestinataires() != null) {
                    for (String dest : request.getDestinataires()) {
                        if (dest != null && !dest.isBlank() && dest.contains("@")) {
                            allRecipients.add(dest.trim());
                        }
                    }
                }
                if (request.getCopie() != null) {
                    for (String cc : request.getCopie()) {
                        if (cc != null && !cc.isBlank() && cc.contains("@")) {
                            allRecipients.add(cc.trim());
                        }
                    }
                }
                
                for (String recipient : allRecipients) {
                    try {
                        emailService.sendControleInterneCommentEmail(recipient, emailSubject, emailBody);
                        log.info("Email {} envoyé à : {}", isRejet ? "de rejet" : "de validation", recipient);
                    } catch (Exception ex) {
                        log.warn("Échec envoi email à {}: {}", recipient, ex.getMessage());
                    }
                }
            } catch (Exception e) {
                log.error("Erreur lors de l'envoi de l'email: {}", e.getMessage(), e);
            }

            return ResponseEntity.ok(Map.of(
                "status", "OK",
                "message", "Email envoyé avec succès",
                "timestamp", LocalDateTime.now().toString()
            ));
        } catch (Exception e) {
            log.error("❌ Erreur lors de l'envoi de l'email: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body(Map.of(
                "status", "ERROR",
                "message", "Erreur lors de l'envoi de l'email: " + e.getMessage(),
                "timestamp", LocalDateTime.now().toString()
            ));
        }
    }

    /**
     * Rejette un relevé de service avec un titre et un commentaire
     * Envoie un email à l'utilisateur connecté
     */
    @PostMapping("/reject")
    public ResponseEntity<Map<String, String>> rejectReleve(
            @RequestBody RejectReleveRequest request,
            HttpServletRequest httpRequest) {
        try {
            String username = RequestContextUtil.getUsernameFromRequest();
            if (username == null || username.isBlank()) {
                return ResponseEntity.status(401).body(Map.of(
                    "status", "ERROR",
                    "message", "Non authentifié"
                ));
            }

            log.info("❌ Rejet du relevé de service - Service: {}, Date: {}, Pays: {}, Env: {} par utilisateur: {}", 
                     request.getService(), request.getDate(), request.getCountry(), request.getEnv(), username);

            // Récupérer l'utilisateur pour son email
            Optional<UserEntity> userOpt = userRepository.findByUsername(username);
            if (userOpt.isEmpty() || userOpt.get().getEmail() == null || userOpt.get().getEmail().trim().isEmpty()) {
                log.warn("Utilisateur non trouvé ou sans email: {}", username);
            }

            // Construire l'email
            String emailSubject = "Rejet de relevé de service - " + request.getTitre();
            String emailBody = String.format(
                "Bonjour %s,\n\n" +
                "Un relevé de service a été rejeté.\n\n" +
                "Détails du rejet :\n" +
                "-------------------\n" +
                "Service : %s\n" +
                "Date : %s\n" +
                "Pays : %s\n" +
                "Environnement : %s\n\n" +
                "Titre du rejet : %s\n" +
                "Commentaire : %s\n\n" +
                "Date du rejet : %s\n" +
                "Rejeté par : %s\n\n" +
                "Cordialement,\n" +
                "L'équipe de réconciliation",
                username,
                request.getService(),
                request.getDate(),
                request.getCountry(),
                request.getEnv(),
                request.getTitre(),
                request.getCommentaire(),
                LocalDateTime.now().toString().replace('T', ' '),
                username
            );

            // Envoyer l'email
            try {
                if (userOpt.isPresent() && userOpt.get().getEmail() != null && !userOpt.get().getEmail().trim().isEmpty()) {
                    emailService.sendControleInterneCommentEmail(userOpt.get().getEmail(), emailSubject, emailBody);
                    log.info("Email de rejet de relevé envoyé à : {}", userOpt.get().getEmail());
                }
            } catch (Exception e) {
                log.error("Erreur lors de l'envoi de l'email de rejet: {}", e.getMessage(), e);
                // On ne fait pas échouer le rejet si l'email échoue
            }

            log.info("✅ Rejet de relevé réussi pour Service: {}", request.getService());
            return ResponseEntity.ok(Map.of(
                "status", "OK",
                "message", "Relevé rejeté avec succès",
                "timestamp", LocalDateTime.now().toString()
            ));

        } catch (Exception e) {
            log.error("❌ Erreur lors du rejet du relevé: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body(Map.of(
                "status", "ERROR",
                "message", "Erreur lors du rejet: " + e.getMessage(),
                "timestamp", LocalDateTime.now().toString()
            ));
        }
    }

    /**
     * Classe de requête pour l'envoi d'email de validation de relevé
     */
    public static class SendReleveValidationEmailRequest {
        private String service;
        private String date;
        private String country;
        private String env;
        private String traitement;
        private String commentaire;
        private java.util.List<String> destinataires;
        private java.util.List<String> copie;

        public SendReleveValidationEmailRequest() {}

        public String getService() { return service; }
        public void setService(String service) { this.service = service; }

        public String getDate() { return date; }
        public void setDate(String date) { this.date = date; }

        public String getCountry() { return country; }
        public void setCountry(String country) { this.country = country; }

        public String getEnv() { return env; }
        public void setEnv(String env) { this.env = env; }

        public String getTraitement() { return traitement; }
        public void setTraitement(String traitement) { this.traitement = traitement; }

        public String getCommentaire() { return commentaire; }
        public void setCommentaire(String commentaire) { this.commentaire = commentaire; }

        public java.util.List<String> getDestinataires() { return destinataires; }
        public void setDestinataires(java.util.List<String> destinataires) { this.destinataires = destinataires; }

        public java.util.List<String> getCopie() { return copie; }
        public void setCopie(java.util.List<String> copie) { this.copie = copie; }
    }

    /**
     * Classe de requête pour le rejet de relevé
     */
    public static class RejectReleveRequest {
        private String service;
        private String date;
        private String country;
        private String env;
        private String titre;
        private String commentaire;

        public RejectReleveRequest() {}

        public String getService() { return service; }
        public void setService(String service) { this.service = service; }

        public String getDate() { return date; }
        public void setDate(String date) { this.date = date; }

        public String getCountry() { return country; }
        public void setCountry(String country) { this.country = country; }

        public String getEnv() { return env; }
        public void setEnv(String env) { this.env = env; }

        public String getTitre() { return titre; }
        public void setTitre(String titre) { this.titre = titre; }

        public String getCommentaire() { return commentaire; }
        public void setCommentaire(String commentaire) { this.commentaire = commentaire; }
    }
}

