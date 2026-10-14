package com.reconciliation.service;

import com.reconciliation.dto.DeleteOperationsResponse;
import com.reconciliation.dto.ServiceCountryVolumeDto;
import com.reconciliation.dto.ServiceReferenceImportBatchItem;
import com.reconciliation.dto.ServiceReferenceImportBatchResponse;
import com.reconciliation.dto.ServiceReferenceDashboardDto;
import com.reconciliation.entity.Result8RecEntity;
import com.reconciliation.entity.ServiceReferenceEntity;
import com.reconciliation.repository.AgencySummaryRepository;
import com.reconciliation.repository.Result8RecRepository;
import com.reconciliation.repository.ServiceReferenceRepository;
import jakarta.persistence.EntityNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class ServiceReferenceService {

    private static final Logger log = LoggerFactory.getLogger(ServiceReferenceService.class);
    private static final int DEFAULT_DASHBOARD_PERIOD_MONTHS = 3;
    private static final int SERVICE_ALIAS_QUERY_BATCH_SIZE = 400;
    private static final DateTimeFormatter AGENCY_DATE_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE;

    private static final class DashboardDateRange {
        private final String startDate;
        private final String endDate;

        private DashboardDateRange(String startDate, String endDate) {
            this.startDate = startDate;
            this.endDate = endDate;
        }
    }

    @Autowired
    private ServiceReferenceRepository repository;

    @Autowired
    private PaysFilterService paysFilterService;

    @Autowired
    private AgencySummaryRepository agencySummaryRepository;

    @Autowired
    private Result8RecRepository result8RecRepository;

    public List<ServiceReferenceEntity> getAll(String username) {
        List<String> allowedPays = getAllowedPays(username);
        if (allowedPays == null) {
            return applyComputedStatus(repository.findAll());
        }
        if (allowedPays.isEmpty()) {
            return Collections.emptyList();
        }
        return applyComputedStatus(repository.findByPaysIn(allowedPays));
    }

    public Optional<ServiceReferenceEntity> getById(Long id, String username) {
        return repository.findById(id)
                .filter(entity -> canAccessPays(username, entity.getPays()))
                .map(this::refreshStatusFromAgencySummary);
    }

    public List<ServiceReferenceEntity> getByPays(String pays, String username) {
        if (!canAccessPays(username, pays)) {
            return Collections.emptyList();
        }
        return applyComputedStatus(repository.findByPays(pays));
    }

    public Optional<ServiceReferenceEntity> getByCodeReco(String codeReco, String username) {
        return repository.findByCodeReco(codeReco)
                .filter(entity -> canAccessPays(username, entity.getPays()))
                .map(this::refreshStatusFromAgencySummary);
    }

    /**
     * Tous les codes RECO déjà présents en base (normalisés en majuscules), pour l’import côté UI.
     * Indispensable quand {@link #getAll(String)} ne renvoie pas le référentiel complet (filtrage par pays).
     */
    public Set<String> getAllUsedCodeRecosNormalized() {
        return repository.findAllCodeRecoValues().stream()
                .filter(cr -> cr != null && !cr.isBlank())
                .map(cr -> cr.trim().toUpperCase())
                .collect(Collectors.toSet());
    }

    /** Codes service déjà en base — filtre d’import (unicité métier demandée sur cette colonne seule). */
    public Set<String> getAllUsedCodeServicesNormalized() {
        return repository.findAllCodeServiceValues().stream()
                .filter(cs -> cs != null && !cs.isBlank())
                .map(cs -> cs.trim().toUpperCase())
                .collect(Collectors.toSet());
    }

    /**
     * Clés pays|service présentes dans result8rec (rapport de réconciliation, statut ACTIF).
     * Format : {@code PAYS|service} (pays majuscules, service minuscules).
     */
    public Set<String> getActiveCountryServiceKeys(String username) {
        return getActiveCountryServiceKeys(username, null, null, DEFAULT_DASHBOARD_PERIOD_MONTHS);
    }

    public Set<String> getActiveCountryServiceKeys(
            String username,
            String startDate,
            String endDate,
            Integer periodMonths) {
        List<String> allowedPays = normalizePays(getAllowedPays(username));
        if (allowedPays != null && allowedPays.isEmpty()) {
            return Collections.emptySet();
        }
        DashboardDateRange range = resolveStatusDateRange(startDate, endDate, periodMonths);
        List<Object[]> rows = queryDistinctCountryServices(allowedPays, range.startDate, range.endDate);
        Set<String> keys = new HashSet<>();
        for (Object[] row : rows) {
            if (row == null || row.length < 2 || row[0] == null || row[1] == null) {
                continue;
            }
            keys.add(statusKey(String.valueOf(row[0]), String.valueOf(row[1])));
        }
        return keys;
    }

    public ServiceReferenceEntity create(ServiceReferenceEntity entity, String username) {
        if (!canAccessPays(username, entity.getPays())) {
            throw new SecurityException("Utilisateur non autorisé pour ce pays");
        }
        normalizeCodeRecoField(entity);
        validateUniqueCombination(
            entity.getPays(), 
            entity.getCodeService(), 
            entity.getServiceLabel(), 
            entity.getCodeReco(), 
            null
        );
        assertCodeRecoGloballyAvailable(entity.getCodeReco(), null);
        ensureStatusDefault(entity);
        return repository.save(entity);
    }

    public ServiceReferenceEntity update(Long id, ServiceReferenceEntity payload, String username) {
        ServiceReferenceEntity existing = repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Référence introuvable"));

        if (!canAccessPays(username, existing.getPays())) {
            throw new SecurityException("Utilisateur non autorisé pour ce pays");
        }

        if (payload.getPays() != null && !payload.getPays().equals(existing.getPays())) {
            if (!canAccessPays(username, payload.getPays())) {
                throw new SecurityException("Utilisateur non autorisé pour ce pays");
            }
            existing.setPays(payload.getPays());
        }

        if (payload.getCodeService() != null) {
            existing.setCodeService(payload.getCodeService());
        }
        if (payload.getServiceLabel() != null) {
            existing.setServiceLabel(payload.getServiceLabel());
        }
        if (payload.getCodeReco() != null) {
            existing.setCodeReco(normalizeCodeRecoValue(payload.getCodeReco()));
        }
        if (payload.getServiceType() != null) {
            existing.setServiceType(payload.getServiceType());
        }
        if (payload.getOperateur() != null) {
            existing.setOperateur(payload.getOperateur());
        }
        if (payload.getReseau() != null) {
            existing.setReseau(payload.getReseau());
        }
        if (payload.getReconciliable() != null) {
            existing.setReconciliable(payload.getReconciliable());
        }
        if (payload.getMotif() != null) {
            existing.setMotif(payload.getMotif());
        }
        if (payload.getRetenuOperateur() != null) {
            existing.setRetenuOperateur(payload.getRetenuOperateur());
        }

        normalizeCodeRecoField(existing);

        validateUniqueCombination(
            existing.getPays(), 
            existing.getCodeService(), 
            existing.getServiceLabel(), 
            existing.getCodeReco(), 
            existing.getId()
        );
        assertCodeRecoGloballyAvailable(existing.getCodeReco(), existing.getId());
        ensureStatusDefault(existing);

        return repository.save(existing);
    }

    /**
     * La colonne {@code code_reco} est unique en base (toute la table), indépendamment du quadruplet métier.
     */
    private void assertCodeRecoGloballyAvailable(String codeReco, Long excludeId) {
        if (codeReco == null || codeReco.isBlank()) {
            return;
        }
        String normalized = normalizeCodeRecoValue(codeReco);
        repository.findByCodeRecoIgnoreCase(normalized).ifPresent(other -> {
            if (excludeId == null || !other.getId().equals(excludeId)) {
                throw new IllegalArgumentException(
                    "Le code RECO \"" + normalized + "\" est déjà utilisé par une autre référence.");
            }
        });
    }

    private static String normalizeCodeRecoValue(String codeReco) {
        return codeReco == null ? null : codeReco.trim().toUpperCase();
    }

    private static void normalizeCodeRecoField(ServiceReferenceEntity entity) {
        if (entity.getCodeReco() != null) {
            entity.setCodeReco(normalizeCodeRecoValue(entity.getCodeReco()));
        }
    }

    public void delete(Long id, String username) {
        ServiceReferenceEntity existing = repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Référence introuvable"));
        if (!canAccessPays(username, existing.getPays())) {
            throw new SecurityException("Utilisateur non autorisé pour ce pays");
        }
        repository.delete(existing);
    }

    /**
     * Import fichier en une seule requête HTTP (ou quelques paquets côté client) pour éviter le rate limiting
     * sur des centaines de POST {@code /api/service-references}.
     */
    public ServiceReferenceImportBatchResponse importBatch(List<ServiceReferenceImportBatchItem> items, String username) {
        return importBatch(items, username, false);
    }

    /**
     * @param upsert si {@code true} (ex. vue dashboard) : même pays + code service → mise à jour au lieu d’échec doublon.
     */
    public ServiceReferenceImportBatchResponse importBatch(List<ServiceReferenceImportBatchItem> items, String username, boolean upsert) {
        if (items == null || items.isEmpty()) {
            return new ServiceReferenceImportBatchResponse(0, List.of());
        }
        int successCount = 0;
        List<String> errors = new ArrayList<>();
        Set<String> batchCodeServices = new HashSet<>();
        for (ServiceReferenceImportBatchItem item : items) {
            int row = item != null && item.getRowNumber() != null ? item.getRowNumber() : 0;
            String rowLabel = row > 0 ? String.valueOf(row) : "?";
            if (item == null || item.getPayload() == null) {
                errors.add("Ligne " + rowLabel + " : données manquantes");
                continue;
            }
            ServiceReferenceEntity entity = item.getPayload();
            String csRaw = entity.getCodeService();
            String cs = csRaw != null ? csRaw.trim().toUpperCase() : "";
            if (!upsert && !cs.isEmpty() && batchCodeServices.contains(cs)) {
                errors.add("Ligne " + rowLabel + " : code service déjà présent dans ce lot d'import");
                continue;
            }
            try {
                if (upsert && !cs.isEmpty() && entity.getPays() != null && !entity.getPays().isBlank()) {
                    String pays = entity.getPays().trim();
                    Optional<ServiceReferenceEntity> existing = repository
                            .findFirstByPaysIgnoreCaseAndCodeServiceIgnoreCaseOrderByIdDesc(pays, cs);
                    if (existing.isPresent()) {
                        update(existing.get().getId(), entity, username);
                        successCount++;
                        continue;
                    }
                }
                create(entity, username);
                successCount++;
                if (!cs.isEmpty()) {
                    batchCodeServices.add(cs);
                }
            } catch (IllegalArgumentException | SecurityException e) {
                errors.add("Ligne " + rowLabel + " (" + importBriefContext(entity) + ") : " + e.getMessage());
            } catch (DataIntegrityViolationException e) {
                errors.add("Ligne " + rowLabel + " (" + importBriefContext(entity)
                        + ") : doublon ou contrainte en base");
            } catch (Exception e) {
                String msg = e.getMessage() != null ? e.getMessage() : "erreur inattendue";
                errors.add("Ligne " + rowLabel + " (" + importBriefContext(entity) + ") : " + msg);
            }
        }
        return new ServiceReferenceImportBatchResponse(successCount, errors);
    }

    private static String importBriefContext(ServiceReferenceEntity e) {
        if (e == null) {
            return "N/A";
        }
        String p = e.getPays() != null ? e.getPays() : "N/A";
        String c = e.getCodeReco() != null ? e.getCodeReco() : "N/A";
        return p + " / " + c;
    }

    /**
     * Suppression en lot : une seule requête HTTP côté client (évite le rate limiting sur N DELETE).
     */
    public DeleteOperationsResponse deleteBatch(List<Long> ids, String username) {
        if (ids == null || ids.isEmpty()) {
            return new DeleteOperationsResponse(true, 0, Collections.emptyList());
        }
        List<String> errors = new ArrayList<>();
        int deletedCount = 0;
        for (Long id : ids) {
            if (id == null) {
                continue;
            }
            try {
                delete(id, username);
                deletedCount++;
            } catch (Exception e) {
                errors.add("ID " + id + " : " + e.getMessage());
            }
        }
        boolean success = errors.isEmpty() || deletedCount > 0;
        return new DeleteOperationsResponse(success, deletedCount, errors);
    }

    public List<ServiceReferenceDashboardDto> getDashboardStats(String username) {
        return getDashboardStats(username, null, null, DEFAULT_DASHBOARD_PERIOD_MONTHS);
    }

    public List<ServiceReferenceDashboardDto> getDashboardStats(
            String username,
            String startDate,
            String endDate,
            Integer periodMonths) {
        List<String> allowedPays = normalizePays(getAllowedPays(username));
        if (allowedPays != null && allowedPays.isEmpty()) {
            return Collections.emptyList();
        }

        DashboardDateRange range = resolveDashboardDateRange(startDate, endDate, periodMonths);

        List<Object[]> agencySummaryByCountry = queryAggregateByCountry(
                allowedPays, range.startDate, range.endDate);

        List<Object[]> agencySummaryByCountryAndService = queryAggregateByCountryAndService(
                allowedPays, range.startDate, range.endDate);
        // Construire la map des services actifs et réconciliables
        Map<String, Boolean> activeReconcilableServices = buildActiveReconcilableServiceMap(allowedPays);

        Map<String, DashboardAccumulator> accumulatorMap = new HashMap<>();

        // Traiter les données par pays pour trx_recon_brut (tous les services depuis agency_summary)
        for (Object[] row : agencySummaryByCountry) {
            String country = (String) row[0];
            if (country == null || country.isEmpty()) {
                continue;
            }
            if (allowedPays != null && !allowedPays.contains(country)) {
                continue;
            }

            DashboardAccumulator accumulator = accumulatorMap.computeIfAbsent(country, c -> new DashboardAccumulator());
            Double totalVolume = ((Number) row[1]).doubleValue();
            Long totalTransactions = ((Number) row[2]).longValue();

            // Volume total depuis agency_summary_entity (tous les services) - base pour trx_recon_brut
            accumulator.totalVolume = totalVolume;
            accumulator.totalTransactions = totalTransactions;
        }

        // Traiter les données par pays et service pour trx_recon_net (services actifs et réconciliables uniquement)
        for (Object[] row : agencySummaryByCountryAndService) {
            String country = (String) row[0];
            String service = (String) row[1];
            if (country == null || country.isEmpty() || service == null || service.isEmpty()) {
                continue;
            }
            if (allowedPays != null && !allowedPays.contains(country)) {
                continue;
            }

            DashboardAccumulator accumulator = accumulatorMap.computeIfAbsent(country, c -> new DashboardAccumulator());
            // Chaque ligne = un service distinct pour ce pays (GROUP BY country, service)
            accumulator.totalServiceCount++;

            // Vérifier si le service est actif et réconciliable (réconciliable = OUI)
            if (!isActiveReconcilableService(service, activeReconcilableServices)) {
                continue;
            }

            accumulator.reconcilableServiceCount++;

            Double volume = ((Number) row[2]).doubleValue();
            // SUM() peut retourner BigInteger, on convertit en long
            Number transactionsNumber = (Number) row[3];
            long transactions = transactionsNumber != null ? transactionsNumber.longValue() : 0L;

            // Volume total depuis agency_summary_entity (services actifs et réconciliables uniquement) - base pour trx_recon_net
            accumulator.reconcilableVolume += volume;
            accumulator.reconcilableTransactions += transactions;
        }

        List<ServiceReferenceDashboardDto> response = new ArrayList<>();
        for (Map.Entry<String, DashboardAccumulator> entry : accumulatorMap.entrySet()) {
            DashboardAccumulator accumulator = entry.getValue();
            ServiceReferenceDashboardDto dto = new ServiceReferenceDashboardDto();
            dto.setCountry(entry.getKey());
            dto.setTotalVolume(round(accumulator.totalVolume));
            dto.setTotalTransactions(accumulator.totalTransactions);
            dto.setReconcilableVolume(round(accumulator.reconcilableVolume));
            dto.setReconcilableTransactions(accumulator.reconcilableTransactions);
            dto.setTotalServiceCount(accumulator.totalServiceCount);
            dto.setReconcilableServiceCount(accumulator.reconcilableServiceCount);
            
            // Volume non réconciliable = volume total - volume réconciliable
            double nonReconcilableVolume = accumulator.totalVolume - accumulator.reconcilableVolume;
            dto.setNonReconcilableVolume(round(nonReconcilableVolume));
            
            // Transactions non réconciliables = transactions totales - transactions réconciliables
            long nonReconcilableTransactions = accumulator.totalTransactions - accumulator.reconcilableTransactions;
            dto.setNonReconcilableTransactions(nonReconcilableTransactions);
            
            // trx_recon_brut = 100% (toujours, c'est la base de référence)
            dto.setTrxReconBrut(100.0);
            
            // trx_recon_net = (volume réconciliable / volume total brut) * 100
            // Représente le pourcentage du volume brut qui est réconciliable
            dto.setTrxReconNet(calculatePercentage(accumulator.reconcilableVolume, accumulator.totalVolume));
            
            response.add(dto);
        }

        response.sort((a, b) -> a.getCountry().compareToIgnoreCase(b.getCountry()));
        return response;
    }

    public List<ServiceCountryVolumeDto> getDashboardServiceVolumes(String username) {
        return getDashboardServiceVolumes(username, null, null, DEFAULT_DASHBOARD_PERIOD_MONTHS);
    }

    public List<ServiceCountryVolumeDto> getDashboardServiceVolumes(
            String username,
            String startDate,
            String endDate,
            Integer periodMonths) {
        List<String> allowedPays = normalizePays(getAllowedPays(username));
        if (allowedPays != null && allowedPays.isEmpty()) {
            return Collections.emptyList();
        }

        DashboardDateRange range = resolveDashboardDateRange(startDate, endDate, periodMonths);
        List<Object[]> rows = queryAggregateByCountryAndService(
                allowedPays, range.startDate, range.endDate);
        List<ServiceCountryVolumeDto> response = new ArrayList<>();
        for (Object[] row : rows) {
            String country = (String) row[0];
            String service = (String) row[1];
            if (country == null || country.isBlank() || service == null || service.isBlank()) {
                continue;
            }
            if (allowedPays != null && !allowedPays.contains(normalizeCountryCode(country))) {
                continue;
            }
            ServiceCountryVolumeDto dto = new ServiceCountryVolumeDto();
            dto.setCountry(normalizeCountryCode(country));
            dto.setService(service.trim());
            dto.setVolume(round(((Number) row[2]).doubleValue()));
            Number transactionsNumber = (Number) row[3];
            dto.setTransactions(transactionsNumber != null ? transactionsNumber.longValue() : 0L);
            response.add(dto);
        }
        return response;
    }

    private List<String> getAllowedPays(String username) {
        if (username == null || username.isBlank()) {
            return null;
        }
        return paysFilterService.getAllowedPaysCodes(username);
    }

    private boolean canAccessPays(String username, String pays) {
        return username == null || username.isBlank() || paysFilterService.canAccessPays(username, pays);
    }

    private void validateUniqueCombination(String pays, String codeService, String serviceLabel, String codeReco, Long excludeId) {
        repository.findByPaysAndCodeServiceAndServiceLabelAndCodeReco(pays, codeService, serviceLabel, codeReco)
            .ifPresent(duplicate -> {
                if (excludeId == null || !duplicate.getId().equals(excludeId)) {
                    throw new IllegalArgumentException(
                        String.format("Une référence existe déjà pour le pays %s, le code service %s, le service %s et le code RECO %s", 
                            pays, codeService, serviceLabel, codeReco)
                    );
                }
            });
    }

    private void ensureStatusDefault(ServiceReferenceEntity entity) {
        entity.setStatus(computeStatusFromReconciliationReport(entity));
    }

    private List<ServiceReferenceEntity> applyComputedStatus(List<ServiceReferenceEntity> entities) {
        refreshStatusesFromAgencySummary(entities);
        return entities;
    }

    private ServiceReferenceEntity refreshStatusFromAgencySummary(ServiceReferenceEntity entity) {
        if (entity == null) {
            return null;
        }
        String computedStatus = computeStatusFromReconciliationReport(entity);
        if (!computedStatus.equals(entity.getStatus())) {
            entity.setStatus(computedStatus);
            repository.save(entity);
        }
        return entity;
    }

    private void refreshStatusesFromAgencySummary(List<ServiceReferenceEntity> entities) {
        if (entities == null || entities.isEmpty()) {
            return;
        }
        try {
            java.util.Set<String> normalizedServices = new java.util.HashSet<>();
            for (ServiceReferenceEntity entity : entities) {
                collectServiceAliases(entity, normalizedServices);
            }
            if (normalizedServices.isEmpty()) {
                return;
            }
            DashboardDateRange range = defaultStatusDateRange();
            java.util.Set<String> activeKeys = loadActiveCountryServiceKeys(
                    new java.util.ArrayList<>(normalizedServices), range.startDate, range.endDate);

            List<ServiceReferenceEntity> toUpdate = new java.util.ArrayList<>();
            for (ServiceReferenceEntity entity : entities) {
                if (entity == null) {
                    continue;
                }
                String computedStatus = isActiveInReconciliationReport(entity, activeKeys) ? "ACTIF" : "INACTIF";
                if (!computedStatus.equals(entity.getStatus())) {
                    entity.setStatus(computedStatus);
                    toUpdate.add(entity);
                }
            }
            if (!toUpdate.isEmpty()) {
                repository.saveAll(toUpdate);
            }
        } catch (Exception e) {
            log.warn("Impossible de rafraîchir les statuts service_reference depuis result8rec: {}", e.getMessage());
        }
    }

    private String computeStatusFromReconciliationReport(ServiceReferenceEntity entity) {
        if (entity == null) {
            return "INACTIF";
        }
        DashboardDateRange range = defaultStatusDateRange();
        for (String alias : serviceAliases(entity)) {
            if (alias == null || alias.isBlank()) {
                continue;
            }
            if (entity.getPays() == null || entity.getPays().isBlank()) {
                if (result8RecRepository.existsByServiceIgnoreCase(alias, range.startDate, range.endDate)) {
                    return "ACTIF";
                }
                continue;
            }
            if (result8RecRepository.existsByCountryAndServiceIgnoreCase(
                    entity.getPays(), alias, range.startDate, range.endDate)) {
                return "ACTIF";
            }
        }
        return "INACTIF";
    }

    private boolean isActiveInReconciliationReport(ServiceReferenceEntity entity, Set<String> activeKeys) {
        if (entity == null || activeKeys == null || activeKeys.isEmpty()) {
            return false;
        }
        for (String alias : serviceAliases(entity)) {
            if (alias == null || alias.isBlank()) {
                continue;
            }
            if (activeKeys.contains(statusKey(entity.getPays(), alias))) {
                return true;
            }
        }
        return false;
    }

    private void collectServiceAliases(ServiceReferenceEntity entity, Set<String> target) {
        if (entity == null || target == null) {
            return;
        }
        for (String alias : serviceAliases(entity)) {
            String normalized = normalizeCode(alias);
            if (!normalized.isEmpty()) {
                target.add(normalized);
            }
        }
    }

    private List<String> serviceAliases(ServiceReferenceEntity entity) {
        if (entity == null) {
            return Collections.emptyList();
        }
        List<String> aliases = new ArrayList<>(3);
        aliases.add(entity.getCodeService());
        aliases.add(entity.getServiceLabel());
        aliases.add(entity.getCodeReco());
        return aliases;
    }

    private DashboardDateRange defaultStatusDateRange() {
        return resolveStatusDateRange(null, null, DEFAULT_DASHBOARD_PERIOD_MONTHS);
    }

    private DashboardDateRange resolveStatusDateRange(String startDate, String endDate, Integer periodMonths) {
        if (startDate != null && !startDate.isBlank() && endDate != null && !endDate.isBlank()) {
            return new DashboardDateRange(normalizeDateParam(startDate), normalizeDateParam(endDate));
        }
        if (periodMonths != null && periodMonths == 0) {
            return new DashboardDateRange(null, null);
        }
        int months = periodMonths != null && periodMonths > 0 ? periodMonths : DEFAULT_DASHBOARD_PERIOD_MONTHS;
        LocalDate end = parseAgencyDate(result8RecRepository.findMaxResultDate());
        if (end == null) {
            end = LocalDate.now();
        }
        LocalDate start = end.minusMonths(months);
        return new DashboardDateRange(start.format(AGENCY_DATE_FORMAT), end.format(AGENCY_DATE_FORMAT));
    }

    private DashboardDateRange resolveDashboardDateRange(String startDate, String endDate, Integer periodMonths) {
        if (startDate != null && !startDate.isBlank() && endDate != null && !endDate.isBlank()) {
            return new DashboardDateRange(normalizeDateParam(startDate), normalizeDateParam(endDate));
        }
        if (periodMonths != null && periodMonths == 0) {
            return new DashboardDateRange(null, null);
        }
        int months = periodMonths != null && periodMonths > 0 ? periodMonths : DEFAULT_DASHBOARD_PERIOD_MONTHS;
        LocalDate end = parseAgencyDate(agencySummaryRepository.findMaxDate());
        if (end == null) {
            end = LocalDate.now();
        }
        LocalDate start = end.minusMonths(months);
        return new DashboardDateRange(start.format(AGENCY_DATE_FORMAT), end.format(AGENCY_DATE_FORMAT));
    }

    private String normalizeDateParam(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim().length() >= 10 ? value.trim().substring(0, 10) : value.trim();
    }

    private LocalDate parseAgencyDate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = normalizeDateParam(value);
        try {
            return LocalDate.parse(normalized, AGENCY_DATE_FORMAT);
        } catch (Exception e) {
            log.warn("Date agency/result8rec non ISO ignorée: {}", value);
            return null;
        }
    }

    private List<Object[]> queryDistinctCountryServices(List<String> allowedPays, String startDate, String endDate) {
        if (allowedPays == null) {
            return result8RecRepository.findDistinctCountryServiceAll(startDate, endDate);
        }
        if (allowedPays.isEmpty()) {
            return Collections.emptyList();
        }
        return result8RecRepository.findDistinctCountryService(allowedPays, startDate, endDate);
    }

    private Set<String> loadActiveCountryServiceKeys(List<String> services, String startDate, String endDate) {
        Set<String> activeKeys = new HashSet<>();
        if (services == null || services.isEmpty()) {
            return activeKeys;
        }
        for (int i = 0; i < services.size(); i += SERVICE_ALIAS_QUERY_BATCH_SIZE) {
            List<String> batch = services.subList(i, Math.min(i + SERVICE_ALIAS_QUERY_BATCH_SIZE, services.size()));
            List<Object[]> countryServices = result8RecRepository.findDistinctCountryServiceByServices(
                    batch, startDate, endDate);
            for (Object[] row : countryServices) {
                if (row == null || row.length < 2 || row[0] == null || row[1] == null) {
                    continue;
                }
                activeKeys.add(statusKey(String.valueOf(row[0]), String.valueOf(row[1])));
            }
        }
        return activeKeys;
    }

    private List<Object[]> queryAggregateByCountry(List<String> allowedPays, String startDate, String endDate) {
        if (allowedPays == null) {
            return agencySummaryRepository.aggregateByCountryAll(startDate, endDate);
        }
        if (allowedPays.isEmpty()) {
            return Collections.emptyList();
        }
        return agencySummaryRepository.aggregateByCountry(allowedPays, startDate, endDate);
    }

    private List<Object[]> queryAggregateByCountryAndService(List<String> allowedPays, String startDate, String endDate) {
        if (allowedPays == null) {
            return agencySummaryRepository.aggregateByCountryAndServiceAll(startDate, endDate);
        }
        if (allowedPays.isEmpty()) {
            return Collections.emptyList();
        }
        return agencySummaryRepository.aggregateByCountryAndService(allowedPays, startDate, endDate);
    }

    private String statusKey(String pays, String codeService) {
        return normalizeCountryCode(pays) + "|" + normalizeCode(codeService);
    }

    private String normalizeCode(String code) {
        return code == null ? "" : code.trim().toLowerCase();
    }

    private String normalizeCountryCode(String country) {
        return country == null ? "" : country.trim().toUpperCase();
    }

    private List<String> normalizePays(List<String> pays) {
        if (pays == null) {
            return null;
        }
        List<String> normalized = new ArrayList<>();
        for (String value : pays) {
            if (value != null && !value.isBlank()) {
                normalized.add(value.trim().toUpperCase());
            }
        }
        return normalized;
    }

    private List<Result8RecEntity> fetchReconciliationData(List<String> allowedPays) {
        if (allowedPays == null) {
            return result8RecRepository.findAll();
        }
        List<String> normalized = new ArrayList<>();
        for (String pays : allowedPays) {
            normalized.add(pays.toLowerCase());
        }
        return result8RecRepository.findByCountryCodes(normalized);
    }

    private Map<String, Boolean> buildReconcilableServiceMap(List<String> allowedPays) {
        List<ServiceReferenceEntity> references;
        if (allowedPays == null) {
            references = repository.findAll();
        } else if (allowedPays.isEmpty()) {
            return Collections.emptyMap();
        } else {
            references = repository.findByPaysIn(allowedPays);
        }

        Map<String, Boolean> map = new HashMap<>();
        for (ServiceReferenceEntity reference : references) {
            boolean reconcilable = Boolean.TRUE.equals(reference.getReconciliable());
            addServiceKey(map, reference.getCodeService(), reconcilable);
            addServiceKey(map, reference.getServiceLabel(), reconcilable);
        }
        return map;
    }

    private Map<String, Boolean> buildActiveReconcilableServiceMap(List<String> allowedPays) {
        List<ServiceReferenceEntity> references;
        if (allowedPays == null) {
            references = repository.findAll();
        } else if (allowedPays.isEmpty()) {
            return Collections.emptyMap();
        } else {
            references = repository.findByPaysIn(allowedPays);
        }

        // S'assurer que les statuts sont à jour
        refreshStatusesFromAgencySummary(references);

        Map<String, Boolean> map = new HashMap<>();
        for (ServiceReferenceEntity reference : references) {
            // Vérifier que le service est actif ET réconciliable
            boolean isActive = "ACTIF".equalsIgnoreCase(reference.getStatus());
            boolean isReconcilable = Boolean.TRUE.equals(reference.getReconciliable());
            if (isActive && isReconcilable) {
                addServiceKey(map, reference.getCodeService(), true);
                addServiceKey(map, reference.getServiceLabel(), true);
            }
        }
        return map;
    }

    private boolean isActiveReconcilableService(String service, Map<String, Boolean> activeReconcilableMap) {
        if (service == null) {
            return false;
        }
        Boolean isActiveReconcilable = activeReconcilableMap.get(normalizeCode(service));
        return Boolean.TRUE.equals(isActiveReconcilable);
    }

    private Map<String, Set<String>> buildServicesByCountryMap(List<Object[]> agencySummaryByCountryAndService) {
        Map<String, Set<String>> map = new HashMap<>();
        for (Object[] row : agencySummaryByCountryAndService) {
            String country = (String) row[0];
            String service = (String) row[1];
            if (country == null || country.isEmpty() || service == null || service.isEmpty()) {
                continue;
            }
            String normalizedCountry = normalizeCountryCode(country);
            String normalizedService = normalizeCode(service);
            map.computeIfAbsent(normalizedCountry, k -> new HashSet<>()).add(normalizedService);
        }
        return map;
    }


    private void addServiceKey(Map<String, Boolean> map, String key, boolean value) {
        String normalized = normalizeCode(key);
        if (!normalized.isEmpty()) {
            map.put(normalized, value);
        }
    }

    private boolean isReconcilableService(String service, Map<String, Boolean> reconcilableMap) {
        if (service == null) {
            return false;
        }
        Boolean reconcilable = reconcilableMap.get(normalizeCode(service));
        return Boolean.TRUE.equals(reconcilable);
    }

    private double computeVolumePortion(double totalVolume, int portionCount, int totalCount) {
        if (totalVolume <= 0 || totalCount <= 0 || portionCount <= 0) {
            return 0;
        }
        return totalVolume * ((double) portionCount / totalCount);
    }

    private double calculatePercentage(double value, double base) {
        if (base <= 0 || value <= 0) {
            return 0;
        }
        return Math.round((value / base) * 10000d) / 100d;
    }

    private double round(double value) {
        return Math.round(value * 100d) / 100d;
    }

    private static class DashboardAccumulator {
        double totalVolume = 0;
        long totalTransactions = 0;
        double matchedVolume = 0;
        double reconcilableVolume = 0;
        long reconcilableTransactions = 0;
        long totalServiceCount = 0;
        long reconcilableServiceCount = 0;
        double netMatchedVolume = 0;
    }
}

