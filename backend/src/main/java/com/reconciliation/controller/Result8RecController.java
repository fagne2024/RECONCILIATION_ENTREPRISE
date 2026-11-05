package com.reconciliation.controller;

import com.reconciliation.dto.Result8RecBulkSaveResponse;
import com.reconciliation.dto.Result8RecAuditDto;
import com.reconciliation.dto.Result8RecAuditActionStatDto;
import com.reconciliation.dto.Result8RecReportDto;
import com.reconciliation.entity.Result8RecEntity;
import com.reconciliation.repository.Result8RecRepository;
import com.reconciliation.service.PaysFilterService;
import com.reconciliation.service.Result8RecAuditService;
import com.reconciliation.util.CountryNormalizationUtil;
import com.reconciliation.util.RequestContextUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/result8rec")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
@RequiredArgsConstructor
@Slf4j
public class Result8RecController {

    /** Plafond de lignes acceptées sans filtre pays (la protection payload reste active). */
    private static final int MAX_ROWS_WITHOUT_COUNTRY = 5_000;
    private static final int HARD_MAX_ROWS = 8_000;

    private final Result8RecRepository repository;
    private final JdbcTemplate jdbcTemplate;
    private final PaysFilterService paysFilterService;
    private final Result8RecAuditService result8RecAuditService;

    /**
     * Détermine le traitement par défaut selon la présence d'écarts
     * - Si écarts > 0 (au moins un écart) : "Niveau Support"
     * - Si pas d'écarts (tous à 0) : "Responsable CDO"
     */
    private String determineDefaultTraitement(Result8RecEntity entity) {
        // Calculer le total des écarts (boOnly + partnerOnly + mismatches)
        // Les types primitifs int ne peuvent pas être null, donc on utilise directement les valeurs
        int totalEcarts = entity.getBoOnly() + entity.getPartnerOnly() + entity.getMismatches();
        
        // Seulement "Niveau Support" si on a AU MOINS un écart
        return totalEcarts > 0 ? "Niveau Support" : "Responsable CDO";
    }

    @PostMapping
    public ResponseEntity<?> save(@RequestBody Result8RecEntity body) {
        if (repository.existsByDateAndAgencyAndServiceAndCountry(body.getDate(), body.getAgency(), body.getService(), body.getCountry())) {
            Result8RecEntity existing = repository.findFirstByDateAndAgencyAndServiceAndCountryOrderByIdDesc(
                    body.getDate(), body.getAgency(), body.getService(), body.getCountry()
            );
            log.info("❌ Doublon détecté result8rec {}/{}/{}/{}", body.getDate(), body.getAgency(), body.getService(), body.getCountry());
            return ResponseEntity.status(HttpStatus.CONFLICT).body(existing);
        }
        
        // Définir le traitement par défaut si non spécifié
        if (body.getTraitement() == null || body.getTraitement().trim().isEmpty()) {
            body.setTraitement(determineDefaultTraitement(body));
            log.info("🔄 Traitement par défaut défini: {}", body.getTraitement());
        }
        // Définir l'environnement par défaut si non spécifié
        if (body.getEnv() == null || body.getEnv().trim().isEmpty()) {
            body.setEnv("T-E");
            log.info("🔄 Env par défaut défini: T-E");
        }
        
        // Définir le username depuis le contexte de la requête
        String username = RequestContextUtil.getUsernameFromRequest();
        if (username != null && !username.isEmpty()) {
            body.setUsername(username);
        }
        
        body.setCreatedAt(Instant.now().toString());
        Result8RecEntity saved = repository.save(body);
        log.info("✅ result8rec sauvegardé id={}", saved.getId());
        result8RecAuditService.logCreation(saved, RequestContextUtil.getUsernameFromRequest());
        return ResponseEntity.ok(saved);
    }

    @GetMapping
    public ResponseEntity<?> list(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false) String country,
            @RequestParam(required = false) String env,
            @RequestParam(required = false) String fields) {
        // Récupérer le username pour le filtrage par pays
        String username = RequestContextUtil.getUsernameFromRequest();
        
        // Récupérer les pays autorisés pour l'utilisateur
        List<String> allowedCountriesTemp = null;
        if (username != null && !username.isEmpty()) {
            allowedCountriesTemp = paysFilterService.getAllowedPaysCodes(username);
            // null signifie tous les pays (GNL ou admin)
        }
        
        // Variable finale pour utilisation dans lambda
        final List<String> allowedCountries = allowedCountriesTemp;
        
        String start = blankToNull(startDate);
        String end = blankToNull(endDate);
        String countryFilter = blankToNull(country);
        String envFilter = normalizeEnvForQuery(env);
        List<String> countryVariants = CountryNormalizationUtil.expandCountryFilterValues(countryFilter);

        log.debug(
            "Result8Rec list user={} country={} env={} periode={}..{} variants={}",
            username, countryFilter, envFilter, start, end, countryVariants
        );

        if (countryVariants == null) {
            long rowCount = repository.countForReport(start, end, null, envFilter);
            // Plages multi-jours autorisées (le frontend charge la période en une
            // seule requête au lieu d'une requête par jour, ce qui déclenchait des
            // 429 rate limiting). La protection payload est gardée via le plafond
            // de lignes ; HARD_MAX_ROWS reste le garde-fou ultime sur la réponse.
            if (rowCount > MAX_ROWS_WITHOUT_COUNTRY) {
                log.warn(
                    "Result8Rec refuse sans filtre pays: user={}, periode {}..{}, {} lignes",
                    username, start, end, rowCount
                );
                Map<String, Object> body = new HashMap<>();
                body.put("error", "country_required");
                body.put(
                    "message",
                    "Le parametre country est obligatoire pour cette periode ("
                        + rowCount
                        + " lignes sans filtre pays)."
                );
                body.put("rowCount", rowCount);
                return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(body);
            }
        }

        List<Result8RecEntity> all = repository.findForReport(start, end, countryVariants, envFilter);

        if (all.size() > HARD_MAX_ROWS) {
            log.error(
                "Result8Rec plafond depasse: user={}, country={}, periode {}..{}, {} lignes",
                username, countryFilter, start, end, all.size()
            );
            Map<String, Object> body = new HashMap<>();
            body.put("error", "result_set_too_large");
            body.put(
                "message",
                "Trop de lignes (" + all.size() + "). Precisez country, env ou une periode plus courte."
            );
            body.put("rowCount", all.size());
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(body);
        }
        
        // Filtrer par pays autorisés si nécessaire
        if (allowedCountries == null) {
            // GNL ou admin : tous les pays
            log.info("🌍 Cloisonnement Result8Rec: Admin/GNL détecté, retour de {} enregistrements", all.size());
            return ResponseEntity.ok(toListResponse(all, fields));
        } else if (allowedCountries.isEmpty()) {
            // Aucun pays autorisé
            log.info("🌍 Cloisonnement Result8Rec: Aucun pays autorisé pour l'utilisateur {}", username);
            return ResponseEntity.ok(new ArrayList<>());
        } else {
            // Filtrer par pays autorisés
            log.info("🌍 Cloisonnement Result8Rec: Filtrage pour utilisateur {} - Pays autorisés: {}", username, allowedCountries);
            log.info("🌍 Cloisonnement Result8Rec: Total enregistrements avant filtrage: {}", all.size());
            
            List<Result8RecEntity> filtered = all.stream()
                .filter(entity -> {
                    if (entity.getCountry() == null) {
                        log.warn("⚠️ Enregistrement Result8Rec sans pays: {}/{}/{}", entity.getAgency(), entity.getService(), entity.getDate());
                        return false;
                    }
                    // Convertir le nom du pays en code pays si nécessaire
                    String countryCode = getCountryCode(entity.getCountry());
                    boolean included = allowedCountries.contains(countryCode);
                    if (!included) {
                        log.debug("🚫 Enregistrement Result8Rec exclu: {} (code: {}) - Pays autorisés: {}", 
                            entity.getCountry(), countryCode, allowedCountries);
                    }
                    return included;
                })
                .collect(Collectors.toList());
            
            log.info("🌍 Cloisonnement Result8Rec: Total enregistrements après filtrage: {}", filtered.size());
            return ResponseEntity.ok(toListResponse(filtered, fields));
        }
    }

    private static List<?> toListResponse(List<Result8RecEntity> entities, String fields) {
        if ("slim".equalsIgnoreCase(blankToNull(fields))) {
            return entities.stream().map(Result8RecReportDto::fromEntity).collect(Collectors.toList());
        }
        return entities;
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String normalizeEnvForQuery(String env) {
        String trimmed = blankToNull(env);
        if (trimmed == null || "ALL".equalsIgnoreCase(trimmed)) {
            return null;
        }
        String upper = trimmed.toUpperCase();
        return "TOTAL".equals(upper) ? "T-E" : upper;
    }

    /**
     * Convertit un nom de pays en code pays pour le filtrage
     */
    private String getCountryCode(String countryName) {
        if (countryName == null || countryName.trim().isEmpty()) {
            return "";
        }
        
        String normalizedName = countryName.trim().toUpperCase();
        
        // Gérer les variantes spéciales comme "CITCH" qui signifie "CI" (Côte d'Ivoire)
        if (normalizedName.equals("CITCH") || normalizedName.startsWith("CITCH")) {
            return "CI";
        }
        
        // Mapping des noms de pays vers leurs codes
        java.util.Map<String, String> countryMap = new java.util.HashMap<>();
        countryMap.put("CAMEROUN", "CM");
        countryMap.put("CAMEROON", "CM");
        countryMap.put("CÔTE D'IVOIRE", "CI");
        countryMap.put("COTE D'IVOIRE", "CI");
        countryMap.put("COTE DIVOIRE", "CI");
        countryMap.put("CÔTE DIVOIRE", "CI");
        countryMap.put("SÉNÉGAL", "SN");
        countryMap.put("SENEGAL", "SN");
        countryMap.put("BURKINA FASO", "BF");
        countryMap.put("BURKINA", "BF");
        countryMap.put("MALI", "ML");
        countryMap.put("BÉNIN", "BJ");
        countryMap.put("BENIN", "BJ");
        countryMap.put("NIGER", "NE");
        countryMap.put("TCHAD", "TD");
        countryMap.put("TOGO", "TG");
        
        // Chercher par nom exact (insensible à la casse)
        for (java.util.Map.Entry<String, String> entry : countryMap.entrySet()) {
            if (entry.getKey().equalsIgnoreCase(normalizedName)) {
                return entry.getValue();
            }
        }
        
        // Chercher par contenu (pour gérer les cas comme "Côte d'Ivoire" dans "Côte d'Ivoire - Abidjan")
        if (normalizedName.contains("COTE") || normalizedName.contains("CÔTE") || normalizedName.contains("IVOIRE")) {
            return "CI";
        }
        if (normalizedName.contains("SENEGAL") || normalizedName.contains("SÉNÉGAL")) {
            return "SN";
        }
        if (normalizedName.contains("CAMEROUN") || normalizedName.contains("CAMEROON")) {
            return "CM";
        }
        if (normalizedName.contains("BURKINA")) {
            return "BF";
        }
        if (normalizedName.contains("MALI")) {
            return "ML";
        }
        if (normalizedName.contains("BENIN") || normalizedName.contains("BÉNIN")) {
            return "BJ";
        }
        if (normalizedName.contains("NIGER")) {
            return "NE";
        }
        if (normalizedName.contains("TCHAD")) {
            return "TD";
        }
        if (normalizedName.contains("TOGO")) {
            return "TG";
        }
        
        // Si c'est déjà un code (2 lettres), le retourner tel quel
        if (normalizedName.length() == 2) {
            return normalizedName;
        }
        
        // Si c'est un code de 4-5 lettres qui commence par un code pays connu, extraire les 2 premières lettres
        if (normalizedName.length() >= 4) {
            String firstTwo = normalizedName.substring(0, 2);
            // Vérifier si c'est un code pays valide
            List<String> validCodes = java.util.Arrays.asList("CM", "CI", "SN", "BF", "ML", "BJ", "NE", "TD", "TG");
            if (validCodes.contains(firstTwo)) {
                return firstTwo;
            }
        }
        
        // Sinon, retourner le nom tel quel pour comparaison (normalisé en majuscules)
        return normalizedName;
    }

    /**
     * Création en masse en une seule requête HTTP (évite le rate-limiting 429 côté reverse-proxy).
     * Une entrée dans {@code results} par ligne reçue, dans le même ordre.
     */
    @PostMapping("/bulk")
    @Transactional
    public ResponseEntity<Result8RecBulkSaveResponse> saveBulk(@RequestBody List<Result8RecEntity> rows) {
        Result8RecBulkSaveResponse response = new Result8RecBulkSaveResponse();
        if (rows == null || rows.isEmpty()) {
            return ResponseEntity.ok(response);
        }

        String username = RequestContextUtil.getUsernameFromRequest();
        int created = 0;
        int conflicts = 0;

        for (Result8RecEntity r : rows) {
            if (repository.existsByDateAndAgencyAndServiceAndCountry(
                    r.getDate(), r.getAgency(), r.getService(), r.getCountry())) {
                Result8RecEntity existing = repository.findFirstByDateAndAgencyAndServiceAndCountryOrderByIdDesc(
                        r.getDate(), r.getAgency(), r.getService(), r.getCountry());
                response.results.add(new Result8RecBulkSaveResponse.RowResult("CONFLICT", existing));
                conflicts++;
                continue;
            }

            if (r.getTraitement() == null || r.getTraitement().trim().isEmpty()) {
                r.setTraitement(determineDefaultTraitement(r));
            }
            if (r.getEnv() == null || r.getEnv().trim().isEmpty()) {
                r.setEnv("TOTAL");
            }
            if (username != null && !username.isEmpty()) {
                r.setUsername(username);
            }

            r.setCreatedAt(Instant.now().toString());
            Result8RecEntity saved = repository.save(r);
            result8RecAuditService.logCreation(saved, username);
            response.results.add(new Result8RecBulkSaveResponse.RowResult("CREATED", saved));
            created++;
        }

        log.info("✅ bulk result8rec: {} lignes reçues, {} créées, {} conflits (doublons)", rows.size(), created, conflicts);
        return ResponseEntity.ok(response);
    }

    /**
     * Retourne la liste des pays et services distincts présents dans result8rec,
     * ainsi qu'une map pays -> liste de services, après application éventuelle
     * du cloisonnement par pays.
     */
    /**
     * Dates distinctes du rapport, triées de la plus récente à la plus ancienne,
     * avec le même cloisonnement par pays que {@link #list}.
     */
    @GetMapping("/dates")
    public ResponseEntity<List<String>> listDistinctDates(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        String username = RequestContextUtil.getUsernameFromRequest();
        List<String> allowedCountriesTemp = null;
        if (username != null && !username.isEmpty()) {
            allowedCountriesTemp = paysFilterService.getAllowedPaysCodes(username);
        }
        final List<String> allowedCountries = allowedCountriesTemp;

        String start = blankToNull(startDate);
        String end = blankToNull(endDate);
        List<Object[]> pairs = repository.findDistinctDateCountryPairsForReport(start, end);

        if (allowedCountries == null) {
            java.util.LinkedHashSet<String> dates = new java.util.LinkedHashSet<>();
            for (Object[] pair : pairs) {
                if (pair[0] != null) {
                    dates.add(pair[0].toString());
                }
            }
            return ResponseEntity.ok(new ArrayList<>(dates));
        }
        if (allowedCountries.isEmpty()) {
            return ResponseEntity.ok(new ArrayList<>());
        }

        java.util.Map<String, Boolean> dateVisible = new java.util.LinkedHashMap<>();
        for (Object[] pair : pairs) {
            if (pair[0] == null) {
                continue;
            }
            String date = pair[0].toString();
            String countryName = pair[1] != null ? pair[1].toString() : "";
            String countryCode = getCountryCode(countryName);
            boolean allowed = allowedCountries.contains(countryCode);
            dateVisible.merge(date, allowed, (prev, next) -> prev || next);
        }

        List<String> result = dateVisible.entrySet().stream()
                .filter(java.util.Map.Entry::getValue)
                .map(java.util.Map.Entry::getKey)
                .collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    @GetMapping("/filters")
    public ResponseEntity<java.util.Map<String, Object>> getDistinctCountriesAndServices() {
        String username = RequestContextUtil.getUsernameFromRequest();
        List<String> allowedCountriesTemp = null;
        if (username != null && !username.isEmpty()) {
            allowedCountriesTemp = paysFilterService.getAllowedPaysCodes(username);
        }
        final List<String> allowedCountries = allowedCountriesTemp;

        List<Object[]> rows = repository.findDistinctCountryServiceEnvRows();

        java.util.Set<String> countries = new java.util.HashSet<>();
        java.util.Set<String> services = new java.util.HashSet<>();
        java.util.Map<String, java.util.Set<String>> countryServiceMap = new java.util.HashMap<>();
        java.util.Map<String, java.util.Map<String, java.util.Set<String>>> countryEnvServiceMap = new java.util.HashMap<>();

        for (Object[] row : rows) {
            String country = row[0] != null ? row[0].toString().trim() : "";
            String service = row[1] != null ? row[1].toString().trim() : "";
            String envRaw = row[2] != null ? row[2].toString() : "";

            if (country.isEmpty()) {
                continue;
            }
            if (allowedCountries != null) {
                if (allowedCountries.isEmpty()) {
                    continue;
                }
                String countryCode = getCountryCode(country);
                if (!allowedCountries.contains(countryCode)) {
                    continue;
                }
            }

            boolean isAgencyLike = !service.isEmpty() && service.toUpperCase().startsWith("AUCAT");
            if (isAgencyLike) {
                service = "";
            }

            countries.add(country);
            if (!service.isEmpty()) {
                services.add(service);
                countryServiceMap
                    .computeIfAbsent(country, k -> new java.util.HashSet<>())
                    .add(service);

                String envKey = envStrictKeyForResult8RecFilters(envRaw);
                countryEnvServiceMap
                    .computeIfAbsent(country, k -> new java.util.HashMap<>())
                    .computeIfAbsent(envKey, k -> new java.util.HashSet<>())
                    .add(service);
            }
        }

        java.util.List<String> countriesList = new java.util.ArrayList<>(countries);
        java.util.List<String> servicesList = new java.util.ArrayList<>(services);
        java.util.Collections.sort(countriesList);
        java.util.Collections.sort(servicesList);

        java.util.Map<String, java.util.List<String>> countryServiceListMap = new java.util.HashMap<>();
        for (java.util.Map.Entry<String, java.util.Set<String>> entry : countryServiceMap.entrySet()) {
            java.util.List<String> svcs = new java.util.ArrayList<>(entry.getValue());
            java.util.Collections.sort(svcs);
            countryServiceListMap.put(entry.getKey(), svcs);
        }

        java.util.Map<String, java.util.Map<String, java.util.List<String>>> countryEnvServiceListMap = new java.util.HashMap<>();
        for (java.util.Map.Entry<String, java.util.Map<String, java.util.Set<String>>> ce : countryEnvServiceMap.entrySet()) {
            java.util.Map<String, java.util.List<String>> inner = new java.util.HashMap<>();
            for (java.util.Map.Entry<String, java.util.Set<String>> ie : ce.getValue().entrySet()) {
                java.util.List<String> sv = new java.util.ArrayList<>(ie.getValue());
                java.util.Collections.sort(sv);
                inner.put(ie.getKey(), sv);
            }
            countryEnvServiceListMap.put(ce.getKey(), inner);
        }

        java.util.Map<String, Object> result = new java.util.HashMap<>();
        result.put("countries", countriesList);
        result.put("services", servicesList);
        result.put("countryServices", countryServiceListMap);
        result.put("countryEnvServices", countryEnvServiceListMap);

        return ResponseEntity.ok(result);
    }

    /** Aligné sur le front (T-E = vide, TOTAL ou T-E explicite). */
    private static String envStrictKeyForResult8RecFilters(String env) {
        if (env == null) {
            return "T-E";
        }
        String t = env.trim();
        if (t.isEmpty()) {
            return "T-E";
        }
        String u = t.toUpperCase();
        if ("TOTAL".equals(u) || "T-E".equals(u)) {
            return "T-E";
        }
        return u;
    }

    @DeleteMapping("/{id:\\d+}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        if (!repository.existsById(id)) return ResponseEntity.notFound().build();
        repository.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id:\\d+}/audit-history")
    public ResponseEntity<List<Result8RecAuditDto>> getAuditHistory(@PathVariable Long id) {
        if (!repository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(result8RecAuditService.listHistory(id));
    }

    /**
     * Agrégat des actions d'audit par utilisateur / type d'action / niveau, pour le
     * « Top 3 des utilisateurs » de l'État des réconciliations.
     *
     * <p>Respecte la période (dates de l'action), le pays, le service et l'ENV stricte,
     * ainsi que le cloisonnement pays de l'utilisateur connecté.</p>
     */
    @GetMapping("/audit-actions-summary")
    public ResponseEntity<List<Result8RecAuditActionStatDto>> auditActionsSummary(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false) String country,
            @RequestParam(required = false) String service,
            @RequestParam(required = false) String env) {

        LocalDateTime start = parseStartOfDay(startDate, LocalDateTime.of(1970, 1, 1, 0, 0));
        LocalDateTime endExclusive = parseStartOfDay(endDate, LocalDateTime.now()).plusDays(1);

        String serviceFilter = blankToNull(service);
        String envKey = strictEnvKey(env);
        List<String> requestedCountryVariants =
                CountryNormalizationUtil.expandCountryFilterValues(blankToNull(country));

        String username = RequestContextUtil.getUsernameFromRequest();
        List<String> allowedCountries = (username != null && !username.isEmpty())
                ? paysFilterService.getAllowedPaysCodes(username)
                : new ArrayList<>();

        List<Result8RecAuditActionStatDto> stats = result8RecAuditService.aggregateActions(
                start, endExclusive, serviceFilter, envKey, requestedCountryVariants, allowedCountries
        );
        return ResponseEntity.ok(stats);
    }

    /** Date-heure du début de journée pour une date YYYY-MM-DD, ou la valeur par défaut. */
    private static LocalDateTime parseStartOfDay(String isoDate, LocalDateTime fallback) {
        String value = blankToNull(isoDate);
        if (value == null) {
            return fallback;
        }
        try {
            return LocalDate.parse(value.substring(0, 10)).atStartOfDay();
        } catch (Exception e) {
            return fallback;
        }
    }

    /** Clé ENV stricte alignée sur le frontend : ALL/vide → null (pas de filtre), TOTAL/T-E → 'T-E'. */
    private static String strictEnvKey(String env) {
        String trimmed = blankToNull(env);
        if (trimmed == null || "ALL".equalsIgnoreCase(trimmed)) {
            return null;
        }
        String upper = trimmed.toUpperCase();
        return "TOTAL".equals(upper) ? "T-E" : upper;
    }

    @PutMapping("/{id:\\d+}")
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody Result8RecEntity body) {
        return repository.findById(id)
                .map(existing -> {
                    Result8RecAuditService.Result8RecSnapshot snapshotBefore =
                            Result8RecAuditService.Result8RecSnapshot.fromEntity(existing);

                    // Mettre à jour tous les champs modifiables
                    if (body.getDate() != null) existing.setDate(body.getDate());
                    if (body.getAgency() != null) existing.setAgency(body.getAgency());
                    if (body.getService() != null) existing.setService(body.getService());
                    if (body.getCountry() != null) existing.setCountry(body.getCountry());
                    if (body.getEnv() != null) existing.setEnv(body.getEnv());
                    
                    existing.setTotalTransactions(body.getTotalTransactions());
                    existing.setTotalVolume(body.getTotalVolume());
                    
                    // Mettre à jour les champs de réconciliation
                    existing.setMatches(body.getMatches());
                    existing.setBoOnly(body.getBoOnly());
                    existing.setPartnerOnly(body.getPartnerOnly());
                    existing.setMismatches(body.getMismatches());
                    existing.setMatchRate(body.getMatchRate());
                    
                    if (body.getStatus() != null) existing.setStatus(body.getStatus());
                    log.info("📝 Update reçu - Commentaire dans body: '{}'", body.getComment());
                    log.info("📝 Update reçu - Commentaire existant avant: '{}'", existing.getComment());
                    if (body.getComment() != null) {
                        existing.setComment(body.getComment());
                        log.info("✅ Commentaire mis à jour avec: '{}'", body.getComment());
                    } else {
                        log.warn("⚠️ Commentaire reçu est null, conservation de l'existant: '{}'", existing.getComment());
                    }
                    
                    // Définir le traitement par défaut si non spécifié lors de la mise à jour
                    if (body.getTraitement() != null && !body.getTraitement().trim().isEmpty()) {
                        existing.setTraitement(body.getTraitement());
                    } else if (existing.getTraitement() == null || existing.getTraitement().trim().isEmpty()) {
                        // Si le traitement n'est pas fourni et qu'il n'existe pas encore, définir la valeur par défaut
                        existing.setTraitement(determineDefaultTraitement(existing));
                    }
                    
                    if (body.getGlpiId() != null) existing.setGlpiId(body.getGlpiId());
                    
                    // Mettre à jour le username depuis le contexte de la requête
                    String username = RequestContextUtil.getUsernameFromRequest();
                    if (username != null && !username.isEmpty()) {
                        existing.setUsername(username);
                    }

                    try {
                        result8RecAuditService.appendFromDiff(snapshotBefore, existing, username);
                    } catch (Exception ex) {
                        log.warn("⚠️ Journalisation audit ignorée pour result8rec {}: {}", id, ex.getMessage());
                    }

                    Result8RecEntity saved = repository.save(existing);
                    log.info("✅ result8rec mis à jour id={} - Date: {}, Agency: {}, Service: {}, Country: {}, Env: {}, Transactions: {}, Volume: {}, Matches: {}, BoOnly: {}, PartnerOnly: {}, Mismatches: {}, MatchRate: {}, Comment: '{}'", 
                            saved.getId(), saved.getDate(), saved.getAgency(), saved.getService(), 
                            saved.getCountry(), saved.getEnv(), saved.getTotalTransactions(), saved.getTotalVolume(),
                            saved.getMatches(), saved.getBoOnly(), saved.getPartnerOnly(), saved.getMismatches(), saved.getMatchRate(), saved.getComment());
                    return ResponseEntity.ok(saved);
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/migrate/add-traitement-column")
    public ResponseEntity<?> addTraitementColumn() {
        try {
            // Vérifier si la colonne existe déjà
            String checkQuery = "SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS " +
                    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'result8rec' AND COLUMN_NAME = 'traitement'";
            
            Integer count = jdbcTemplate.queryForObject(checkQuery, Integer.class);
            
            if (count == null || count == 0) {
                log.info("🔄 Ajout de la colonne traitement à la table result8rec...");
                
                // Ajouter la colonne traitement après comment
                String alterTableQuery = "ALTER TABLE result8rec ADD COLUMN traitement VARCHAR(255) NULL AFTER comment";
                jdbcTemplate.execute(alterTableQuery);
                
                log.info("✅ Colonne traitement ajoutée avec succès!");
                return ResponseEntity.ok().body("Colonne traitement ajoutée avec succès à la table result8rec");
            } else {
                log.info("✅ Colonne traitement déjà présente dans la table result8rec");
                return ResponseEntity.ok().body("La colonne traitement existe déjà dans la table result8rec");
            }
            
        } catch (Exception e) {
            log.error("❌ Erreur lors de l'ajout de la colonne traitement: " + e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Erreur: " + e.getMessage());
        }
    }
}


