package com.reconciliation.service;

import com.reconciliation.entity.EcartBoSummaryEntity;
import com.reconciliation.model.EcartBoSummary;
import com.reconciliation.model.EcartBoSummaryDTO;
import com.reconciliation.model.EcartBoSummaryStatusLinkUpdateDTO;
import com.reconciliation.repository.EcartBoSummaryRepository;
import com.reconciliation.util.CountryNormalizationUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.Optional;

@Service
public class EcartBoSummaryService {
    
    @Autowired
    private EcartBoSummaryRepository ecartBoSummaryRepository;
    
    public List<EcartBoSummary> getAllEcartBoSummaries() {
        return ecartBoSummaryRepository.findAllOrderByDateImportDesc().stream()
                .map(this::convertToModel)
                .collect(Collectors.toList());
    }
    
    public Optional<EcartBoSummary> getEcartBoSummaryById(Long id) {
        return ecartBoSummaryRepository.findById(id)
                .map(this::convertToModel);
    }
    
    public List<EcartBoSummary> getEcartBoSummaries(
            String agence,
            String service,
            String pays,
            String statut,
            String token,
            String startDate,
            String endDate,
            String env,
            String platform) {
        List<EcartBoSummaryEntity> entities;

        if (token != null && !token.trim().isEmpty()) {
            String tokenQuery = token.trim();
            entities = ecartBoSummaryRepository.findByTokenContaining(tokenQuery);
        } else if (hasAdvancedFilter(agence, service, pays, statut, startDate, endDate, env, platform)) {
            entities = ecartBoSummaryRepository.findByFilters(
                    blankToNull(agence),
                    blankToNull(service),
                    CountryNormalizationUtil.expandCountryFilterValues(pays),
                    blankToNull(statut),
                    normalizePlatformForQuery(platform),
                    parseDateStart(startDate),
                    parseDateEnd(endDate),
                    normalizeEnvForQuery(env)
            );
        } else if (agence != null && service != null && pays != null) {
            entities = ecartBoSummaryRepository.findByAgenceAndServiceAndPays(agence, service, pays);
        } else if (agence != null) {
            entities = ecartBoSummaryRepository.findByAgence(agence);
        } else if (service != null) {
            entities = ecartBoSummaryRepository.findByService(service);
        } else if (pays != null) {
            entities = ecartBoSummaryRepository.findByPays(pays);
        } else if (statut != null) {
            entities = ecartBoSummaryRepository.findByStatut(statut);
        } else {
            entities = ecartBoSummaryRepository.findAllOrderByDateImportDesc();
        }

        // Filtrer par statut si spécifié (et pas de filtre token)
        if (statut != null && (agence == null && service == null && pays == null) && (token == null || token.trim().isEmpty())) {
            entities = entities.stream()
                    .filter(e -> statut.equals(e.getStatut()))
                    .collect(Collectors.toList());
        }

        return entities.stream()
                .map(this::convertToModel)
                .collect(Collectors.toList());
    }

    private static boolean hasAdvancedFilter(
            String agence,
            String service,
            String pays,
            String statut,
            String startDate,
            String endDate,
            String env,
            String platform) {
        return blankToNull(agence) != null
                || blankToNull(service) != null
                || blankToNull(pays) != null
                || blankToNull(statut) != null
                || blankToNull(startDate) != null
                || blankToNull(endDate) != null
                || normalizeEnvForQuery(env) != null
                || normalizePlatformForQuery(platform) != null;
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

    private static String normalizePlatformForQuery(String platform) {
        String trimmed = blankToNull(platform);
        if (trimmed == null || "ALL".equalsIgnoreCase(trimmed)) {
            return null;
        }
        String upper = trimmed.toUpperCase();
        return ("BO".equals(upper) || "PARTENAIRE".equals(upper)) ? upper : null;
    }

    private static LocalDateTime parseDateStart(String value) {
        String trimmed = blankToNull(value);
        return trimmed == null ? null : LocalDate.parse(trimmed).atStartOfDay();
    }

    private static LocalDateTime parseDateEnd(String value) {
        String trimmed = blankToNull(value);
        return trimmed == null ? null : LocalDate.parse(trimmed).atTime(23, 59, 59);
    }
    
    @Transactional
    public java.util.Map<String, Object> saveEcartBoSummary(List<EcartBoSummaryDTO> summaryData) {
        System.out.println("=== DÉBUT saveEcartBoSummary ===");
        System.out.println("DEBUG: Nombre de résumés à sauvegarder: " + summaryData.size());
        
        List<EcartBoSummaryEntity> entitiesToSave = new java.util.ArrayList<>();
        List<Map<String, Object>> duplicateRecords = new java.util.ArrayList<>();
        Set<String> batchSignatures = new HashSet<>();
        DateTimeFormatter formatter = DateTimeFormatter.ISO_DATE_TIME;
        
        for (EcartBoSummaryDTO summary : summaryData) {
            try {
                // Parser la date
                LocalDateTime dateTransaction;
                if (summary.getDate() != null && !summary.getDate().trim().isEmpty()) {
                    try {
                        if (summary.getDate().contains("T")) {
                            dateTransaction = LocalDateTime.parse(summary.getDate(), formatter);
                        } else {
                            dateTransaction = LocalDateTime.parse(summary.getDate() + "T00:00:00", formatter);
                        }
                    } catch (Exception e) {
                        System.out.println("DEBUG: Erreur de parsing de date, utilisation de la date actuelle: " + summary.getDate());
                        dateTransaction = LocalDateTime.now();
                    }
                } else {
                    dateTransaction = LocalDateTime.now();
                }

                // Créer une variable finale pour la lambda (après avoir déterminé la valeur)
                final LocalDateTime finalDateTransaction = dateTransaction;
                final String finalStatut = summary.getStatut();
                final String finalAgence = summary.getAgence();
                final String finalService = summary.getService();
                final String finalPays = summary.getPays();
                final Integer finalNombreTransactions = summary.getNombreTransactions() != null ? summary.getNombreTransactions() : 0;
                final Double finalMontant = summary.getMontant() != null ? summary.getMontant() : 0.0;
                final String finalEnv = summary.getEnv() != null && !summary.getEnv().trim().isEmpty()
                        ? summary.getEnv().trim().toUpperCase()
                        : "BO";
                final String finalEnvCode = summary.getEnvCode() != null && !summary.getEnvCode().trim().isEmpty()
                        ? summary.getEnvCode().trim()
                        : null;

                String batchSignature = buildDuplicateSignature(
                        finalDateTransaction.toLocalDate(),
                        finalAgence,
                        finalService,
                        finalPays,
                        finalNombreTransactions,
                        finalMontant,
                        finalEnv,
                        finalEnvCode
                );
                if (!batchSignatures.add(batchSignature)) {
                    Map<String, Object> duplicateInfo = new HashMap<>();
                    duplicateInfo.put("agence", finalAgence);
                    duplicateInfo.put("service", finalService);
                    duplicateInfo.put("pays", finalPays);
                    duplicateInfo.put("dateTransaction", finalDateTransaction.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
                    duplicateInfo.put("statut", finalStatut);
                    duplicateInfo.put("montant", finalMontant);
                    duplicateInfo.put("nombreTransactions", finalNombreTransactions);
                    duplicateInfo.put("env", finalEnv);
                    duplicateInfo.put("envCode", finalEnvCode);
                    duplicateInfo.put("message", "Doublon dans le lot envoyé (même date, agence, service, pays, ENV, nombre et montant).");
                    duplicateInfo.put("idExistant", null);
                    duplicateRecords.add(duplicateInfo);
                    continue;
                }

                // Vérifier si un enregistrement similaire existe déjà en base
                List<EcartBoSummaryEntity> existing = ecartBoSummaryRepository.findByAgenceAndServiceAndPays(
                    finalAgence, finalService, finalPays);
                
                EcartBoSummaryEntity duplicateEntity = existing.stream()
                    .filter(e -> matchesDuplicateSignature(
                            e,
                            finalDateTransaction.toLocalDate(),
                            finalNombreTransactions,
                            finalMontant,
                            finalEnv,
                            finalEnvCode,
                            null
                    ))
                    .findFirst()
                    .orElse(null);
                
                if (duplicateEntity != null) {
                    String duplicateMessage = String.format(
                        "❌ DOUBLON DÉTECTÉ: Un enregistrement identique existe déjà dans la base de données!\n" +
                        "   📋 Détails du doublon (Date, Agence, Service, Pays, Nombre):\n" +
                        "   • Date de transaction: %s\n" +
                        "   • Agence: %s\n" +
                        "   • Service: %s\n" +
                        "   • Pays: %s\n" +
                        "   • Nombre de transactions: %d\n" +
                        "   • Statut existant: %s\n" +
                        "   • Montant total existant: %.2f\n" +
                        "   • Date d'import existante: %s\n" +
                        "   • ID de l'enregistrement existant: %d\n" +
                        "   ⚠️ Cet enregistrement ne sera pas sauvegardé pour éviter les doublons.",
                        finalDateTransaction.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")),
                        finalAgence,
                        finalService,
                        finalPays,
                        finalNombreTransactions,
                        duplicateEntity.getStatut() != null ? duplicateEntity.getStatut() : "N/A",
                        duplicateEntity.getMontantTotal(),
                        duplicateEntity.getDateImport() != null ? 
                            duplicateEntity.getDateImport().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")) : "N/A",
                        duplicateEntity.getId()
                    );
                    
                    System.out.println("DEBUG: " + duplicateMessage);
                    
                    Map<String, Object> duplicateInfo = new HashMap<>();
                    duplicateInfo.put("agence", finalAgence);
                    duplicateInfo.put("service", finalService);
                    duplicateInfo.put("pays", finalPays);
                    duplicateInfo.put("dateTransaction", finalDateTransaction.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
                    duplicateInfo.put("statut", finalStatut);
                    duplicateInfo.put("montant", summary.getMontant());
                    duplicateInfo.put("nombreTransactions", summary.getNombreTransactions());
                    duplicateInfo.put("message", duplicateMessage);
                    duplicateInfo.put("idExistant", duplicateEntity.getId());
                    duplicateRecords.add(duplicateInfo);
                    continue;
                }

                // Créer l'entité
                EcartBoSummaryEntity entity = new EcartBoSummaryEntity();
                entity.setDateTransaction(finalDateTransaction);
                entity.setAgence(finalAgence);
                entity.setService(finalService);
                entity.setPays(finalPays);
                entity.setNombreTransactions(summary.getNombreTransactions() != null ? summary.getNombreTransactions() : 0);
                entity.setMontantTotal(summary.getMontant() != null ? summary.getMontant() : 0.0);
                entity.setStatut(finalStatut != null ? finalStatut : "EN_COURS");
                entity.setEnv(summary.getEnv() != null && !summary.getEnv().trim().isEmpty() ? summary.getEnv() : "BO");
                if (summary.getEnvCode() != null && !summary.getEnvCode().trim().isEmpty()) {
                    entity.setEnvCode(summary.getEnvCode().trim());
                }
                // Utiliser le commentaire fourni ou générer un commentaire par défaut
                if (summary.getCommentaire() != null && !summary.getCommentaire().trim().isEmpty()) {
                    entity.setCommentaire(summary.getCommentaire());
                } else {
                    entity.setCommentaire("Résumé des écarts BO - " +
                        (summary.getNombreTransactions() != null ? summary.getNombreTransactions() : 0) +
                        " transaction(s)");
                }
                if (summary.getToken() != null && !summary.getToken().trim().isEmpty()) {
                    entity.setToken(summary.getToken().trim());
                }
                entity.setDateImport(LocalDateTime.now());

                entitiesToSave.add(entity);
                System.out.println("DEBUG: Résumé préparé pour agence: " + finalAgence + 
                    ", service: " + finalService + ", montant: " + summary.getMontant());
            } catch (Exception e) {
                System.err.println("DEBUG: Erreur lors du traitement du résumé: " + e.getMessage());
                e.printStackTrace();
            }
        }

        // Sauvegarder tous les enregistrements
        int savedCount = 0;
        if (!entitiesToSave.isEmpty()) {
            List<EcartBoSummaryEntity> savedEntities = ecartBoSummaryRepository.saveAll(entitiesToSave);
            savedCount = savedEntities.size();
            System.out.println("DEBUG: " + savedCount + " résumé(s) sauvegardé(s) avec succès");
        }

        Map<String, Object> result = new HashMap<>();
        result.put("count", savedCount);
        result.put("totalReceived", summaryData.size());
        result.put("duplicates", duplicateRecords.size());
        result.put("duplicateRecords", duplicateRecords);
        
        if (duplicateRecords.isEmpty()) {
            System.out.println("=== FIN saveEcartBoSummary ===");
        } else {
            System.out.println("=== FIN saveEcartBoSummary - " + duplicateRecords.size() + " doublon(s) détecté(s) ===");
        }
        
        return result;
    }
    
    @Transactional
    public EcartBoSummary updateEcartBoSummary(Long id, EcartBoSummary ecartBoSummary) {
        EcartBoSummaryEntity entity = ecartBoSummaryRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Résumé d'écart BO non trouvé"));

        // Mise à jour partielle : ne modifier que les champs fournis (non null)
        if (ecartBoSummary.getDateTransaction() != null) {
            entity.setDateTransaction(ecartBoSummary.getDateTransaction());
        }
        if (ecartBoSummary.getAgence() != null) {
            entity.setAgence(ecartBoSummary.getAgence());
        }
        if (ecartBoSummary.getService() != null) {
            entity.setService(ecartBoSummary.getService());
        }
        if (ecartBoSummary.getPays() != null) {
            entity.setPays(ecartBoSummary.getPays());
        }
        if (ecartBoSummary.getNombreTransactions() != null) {
            entity.setNombreTransactions(ecartBoSummary.getNombreTransactions());
        }
        if (ecartBoSummary.getMontantTotal() != null) {
            entity.setMontantTotal(ecartBoSummary.getMontantTotal());
        }
        if (ecartBoSummary.getStatut() != null) {
            entity.setStatut(ecartBoSummary.getStatut());
        }
        if (ecartBoSummary.getCommentaire() != null) {
            entity.setCommentaire(ecartBoSummary.getCommentaire());
        }
        if (ecartBoSummary.getEnv() != null && !ecartBoSummary.getEnv().trim().isEmpty()) {
            entity.setEnv(ecartBoSummary.getEnv().trim());
        }
        if (ecartBoSummary.getEnvCode() != null) {
            String code = ecartBoSummary.getEnvCode().trim();
            entity.setEnvCode(code.isEmpty() ? null : code);
        }
        if (ecartBoSummary.getToken() != null) {
            entity.setToken(ecartBoSummary.getToken().trim().isEmpty() ? null : ecartBoSummary.getToken().trim());
        }

        List<EcartBoSummaryEntity> existing = ecartBoSummaryRepository.findByAgenceAndServiceAndPays(
                entity.getAgence(), entity.getService(), entity.getPays());
        if (entity.getDateTransaction() != null) {
            final Long entityId = entity.getId();
            final String updatedSignature = buildDuplicateSignature(
                    entity.getDateTransaction().toLocalDate(),
                    entity.getAgence(),
                    entity.getService(),
                    entity.getPays(),
                    entity.getNombreTransactions(),
                    entity.getMontantTotal(),
                    entity.getEnv(),
                    entity.getEnvCode()
            );
            boolean duplicate = existing.stream()
                    .filter(other -> other.getId() != null && !other.getId().equals(entityId))
                    .filter(other -> other.getDateTransaction() != null)
                    .anyMatch(other -> updatedSignature.equals(buildDuplicateSignature(
                            other.getDateTransaction().toLocalDate(),
                            other.getAgence(),
                            other.getService(),
                            other.getPays(),
                            other.getNombreTransactions(),
                            other.getMontantTotal(),
                            other.getEnv(),
                            other.getEnvCode()
                    )));
            if (duplicate) {
                throw new IllegalArgumentException(
                        "Un enregistrement identique existe déjà (date, agence, service, pays, ENV, nombre et montant).");
            }
        }

        entity = ecartBoSummaryRepository.save(entity);
        return convertToModel(entity);
    }

    private String buildDuplicateSignature(
            LocalDate date,
            String agence,
            String service,
            String pays,
            Integer nombreTransactions,
            Double montantTotal,
            String env,
            String envCode) {
        String datePart = date != null ? date.toString() : "";
        String envNorm = env != null && !env.trim().isEmpty() ? env.trim().toUpperCase() : "BO";
        String envCodeNorm = envCode != null && !envCode.trim().isEmpty() ? envCode.trim().toUpperCase() : "";
        String montantPart = montantTotal != null ? String.format(java.util.Locale.US, "%.2f", montantTotal) : "0.00";
        int nombre = nombreTransactions != null ? nombreTransactions : 0;
        return String.join("|",
                datePart,
                safeTrim(agence),
                safeTrim(service),
                safeTrim(pays),
                envNorm,
                envCodeNorm,
                String.valueOf(nombre),
                montantPart);
    }

    private boolean matchesDuplicateSignature(
            EcartBoSummaryEntity entity,
            LocalDate date,
            Integer nombreTransactions,
            Double montantTotal,
            String env,
            String envCode,
            Long excludeId) {
        if (excludeId != null && excludeId.equals(entity.getId())) {
            return false;
        }
        if (entity.getDateTransaction() == null || date == null) {
            return false;
        }
        String left = buildDuplicateSignature(
                entity.getDateTransaction().toLocalDate(),
                entity.getAgence(),
                entity.getService(),
                entity.getPays(),
                entity.getNombreTransactions(),
                entity.getMontantTotal(),
                entity.getEnv(),
                entity.getEnvCode()
        );
        String right = buildDuplicateSignature(
                date,
                entity.getAgence(),
                entity.getService(),
                entity.getPays(),
                nombreTransactions,
                montantTotal,
                env,
                envCode
        );
        return left.equals(right);
    }

    private static String safeTrim(String value) {
        return value != null ? value.trim() : "";
    }

    @Transactional
    public Map<String, Object> updateStatusLinks(List<EcartBoSummaryStatusLinkUpdateDTO> updates) {
        List<Long> ids = updates.stream()
                .map(EcartBoSummaryStatusLinkUpdateDTO::getId)
                .filter(id -> id != null && id > 0)
                .distinct()
                .collect(Collectors.toList());

        Map<Long, EcartBoSummaryEntity> entitiesById = new HashMap<>();
        ecartBoSummaryRepository.findAllById(ids)
                .forEach(entity -> entitiesById.put(entity.getId(), entity));

        Map<Long, EcartBoSummaryEntity> entitiesToSave = new LinkedHashMap<>();
        int skipped = 0;

        for (EcartBoSummaryStatusLinkUpdateDTO update : updates) {
            Long id = update.getId();
            if (id == null || id <= 0) {
                skipped++;
                continue;
            }

            EcartBoSummaryEntity entity = entitiesById.get(id);
            if (entity == null) {
                skipped++;
                continue;
            }

            if (update.getStatut() != null && !update.getStatut().trim().isEmpty()) {
                entity.setStatut(update.getStatut().trim());
            }

            if (update.getEnv() != null && !update.getEnv().trim().isEmpty()) {
                entity.setEnv(update.getEnv().trim());
            }

            if (update.getEnvCode() != null) {
                String code = update.getEnvCode().trim();
                entity.setEnvCode(code.isEmpty() ? null : code);
            }

            if (update.getToken() != null) {
                String tokenValue = update.getToken().trim();
                entity.setToken(tokenValue.isEmpty() ? null : truncateToken(tokenValue));
            }

            entitiesToSave.put(id, entity);
        }

        if (!entitiesToSave.isEmpty()) {
            ecartBoSummaryRepository.saveAll(new ArrayList<>(entitiesToSave.values()));
        }

        Map<String, Object> result = new HashMap<>();
        result.put("updated", entitiesToSave.size());
        result.put("skipped", skipped);
        return result;
    }

    private static String truncateToken(String token) {
        if (token == null) {
            return null;
        }
        return token.length() <= 64 ? token : token.substring(0, 64);
    }

    private Long toLong(Object value) {
        if (value == null) return null;
        if (value instanceof Number) {
            return ((Number) value).longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException e) {
            return null;
        }
    }
    
    @Transactional
    public boolean deleteEcartBoSummary(Long id) {
        if (ecartBoSummaryRepository.existsById(id)) {
            ecartBoSummaryRepository.deleteById(id);
            return true;
        }
        return false;
    }
    
    public List<String> getDistinctAgences() {
        return ecartBoSummaryRepository.findDistinctAgence();
    }
    
    public List<String> getDistinctServices() {
        return ecartBoSummaryRepository.findDistinctService();
    }
    
    public List<String> getDistinctPays() {
        return ecartBoSummaryRepository.findDistinctPays();
    }
    
    // Méthodes de conversion
    private EcartBoSummary convertToModel(EcartBoSummaryEntity entity) {
        EcartBoSummary model = new EcartBoSummary();
        model.setId(entity.getId());
        model.setDateTransaction(entity.getDateTransaction());
        model.setAgence(entity.getAgence());
        model.setService(entity.getService());
        model.setPays(entity.getPays());
        model.setNombreTransactions(entity.getNombreTransactions());
        model.setMontantTotal(entity.getMontantTotal());
        model.setStatut(entity.getStatut());
        model.setDateImport(entity.getDateImport());
        model.setCommentaire(entity.getCommentaire());
        model.setEnv(entity.getEnv() != null ? entity.getEnv() : "BO");
        model.setEnvCode(entity.getEnvCode());
        model.setToken(entity.getToken());
        return model;
    }
}
