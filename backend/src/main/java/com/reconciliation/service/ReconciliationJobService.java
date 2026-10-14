package com.reconciliation.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.reconciliation.dto.ProgressUpdate;
import com.reconciliation.dto.ReconciliationConfig;
import com.reconciliation.dto.ReconciliationResponse;
import com.reconciliation.entity.ReconciliationJob;
import com.reconciliation.repository.ReconciliationJobRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
@Slf4j
public class ReconciliationJobService {
    
    private final ReconciliationJobRepository jobRepository;
    private final ObjectMapper objectMapper;
    
    /** Cache des résultats désérialisés par jobId pour éviter de re-parser le JSON à chaque requête paginée */
    private final ConcurrentHashMap<String, ReconciliationResponse> resultCache = new ConcurrentHashMap<>();
    /** Cache léger boOnly/mismatches — évite de re-sérialiser les matches pour ecart-bo-summary */
    private final ConcurrentHashMap<String, EcartsSlice> ecartsSliceCache = new ConcurrentHashMap<>();
    /** Timestamps d'accès pour implémenter une éviction LRU basée sur le temps */
    private final ConcurrentHashMap<String, Long> cacheAccessTimes = new ConcurrentHashMap<>();
    private static final int RESULT_CACHE_MAX_SIZE = 20;
    private static final long CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes TTL
    /** Nombre de sessions de chunk conservées au maximum (garde-fou anti-OOM si le DELETE n'arrive pas). */
    private static final int CHUNK_SESSIONS_KEPT = 2;

    public record EcartsSlice(List<Map<String, String>> boOnly, List<Map<String, String>> mismatches) {}
    
    private static final String UPLOAD_DIR = "uploads/reconciliation";
    
    /**
     * Crée un nouveau job de réconciliation
     */
    @Transactional
    public String createJob(MultipartFile boFile, MultipartFile partnerFile, 
                          ReconciliationConfig config, String clientId) throws IOException {
        
        // Créer le répertoire d'upload s'il n'existe pas
        Path uploadPath = Paths.get(UPLOAD_DIR);
        if (!Files.exists(uploadPath)) {
            Files.createDirectories(uploadPath);
        }
        
        // Générer un jobId unique
        String jobId = "job_" + System.currentTimeMillis() + "_" + UUID.randomUUID().toString().substring(0, 8);
        
        // Sauvegarder les fichiers
        String boFilePath = saveFile(boFile, jobId + "_bo");
        String partnerFilePath = saveFile(partnerFile, jobId + "_partner");
        
        // Créer le job
        ReconciliationJob job = new ReconciliationJob();
        job.setJobId(jobId);
        job.setStatus(ReconciliationJob.JobStatus.PENDING);
        job.setBoFilePath(boFilePath);
        job.setPartnerFilePath(partnerFilePath);
        job.setConfigJson(objectMapper.writeValueAsString(config));
        job.setClientId(clientId);
        
        jobRepository.save(job);
        
        log.info("Job créé: {} pour client: {}", jobId, clientId);
        
        // Job créé avec succès
        
        return jobId;
    }
    
    /**
     * Met à jour la progression d'un job
     */
    @Transactional
    public void updateProgress(String jobId, ProgressUpdate progress) {
        Optional<ReconciliationJob> jobOpt = jobRepository.findByJobId(jobId);
        if (jobOpt.isPresent()) {
            ReconciliationJob job = jobOpt.get();
            try {
                job.setProgressJson(objectMapper.writeValueAsString(progress));
                job.setStatus(ReconciliationJob.JobStatus.PROCESSING);
                jobRepository.save(job);
                
                // Progression mise à jour
                
                log.debug("Progression mise à jour pour job {}: {}%", jobId, progress.getPercentage());
            } catch (JsonProcessingException e) {
                log.error("Erreur lors de la sérialisation de la progression", e);
            }
        }
    }
    
    /**
     * Marque un job comme terminé avec succès
     */
    @Transactional
    public void completeJob(String jobId, ReconciliationResponse result) {
        Optional<ReconciliationJob> jobOpt = jobRepository.findByJobId(jobId);
        if (jobOpt.isPresent()) {
            ReconciliationJob job = jobOpt.get();
            try {
                log.info("💾 Sauvegarde des résultats pour le job: {}", jobId);
                log.info("📊 Détails des résultats:");
                log.info("  - totalMatches: {}", result.getTotalMatches());
                log.info("  - totalMismatches: {}", result.getTotalMismatches());
                log.info("  - totalBoOnly: {}", result.getTotalBoOnly());
                log.info("  - totalPartnerOnly: {}", result.getTotalPartnerOnly());
                log.info("  - totalBoRecords: {}", result.getTotalBoRecords());
                log.info("  - totalPartnerRecords: {}", result.getTotalPartnerRecords());
                log.info("  - matches size: {}", result.getMatches() != null ? result.getMatches().size() : 0);
                log.info("  - mismatches size: {}", result.getMismatches() != null ? result.getMismatches().size() : 0);
                log.info("  - boOnly size: {}", result.getBoOnly() != null ? result.getBoOnly().size() : 0);
                log.info("  - partnerOnly size: {}", result.getPartnerOnly() != null ? result.getPartnerOnly().size() : 0);
                
                job.setResultJson(objectMapper.writeValueAsString(result));
                job.setStatus(ReconciliationJob.JobStatus.COMPLETED);
                job.setCompletedAt(LocalDateTime.now());
                jobRepository.save(job);
                resultCache.put(jobId, result);
                evictResultCacheIfNeeded();
                log.info("✅ Job terminé avec succès: {} - Résultats sauvegardés", jobId);
            } catch (JsonProcessingException e) {
                log.error("❌ Erreur lors de la sérialisation du résultat", e);
            }
        } else {
            log.error("❌ Job non trouvé pour sauvegarde: {}", jobId);
        }
    }
    
    /**
     * Marque un job comme échoué
     */
    @Transactional
    public void failJob(String jobId, String error) {
        Optional<ReconciliationJob> jobOpt = jobRepository.findByJobId(jobId);
        if (jobOpt.isPresent()) {
            ReconciliationJob job = jobOpt.get();
            job.setErrorMessage(error);
            job.setStatus(ReconciliationJob.JobStatus.FAILED);
            job.setCompletedAt(LocalDateTime.now());
            jobRepository.save(job);
            
                            // Erreur enregistrée
            
            log.error("Job échoué: {} - Erreur: {}", jobId, error);
        }
    }
    
    /**
     * Annule un job
     */
    @Transactional
    public void cancelJob(String jobId) {
        Optional<ReconciliationJob> jobOpt = jobRepository.findByJobId(jobId);
        if (jobOpt.isPresent()) {
            ReconciliationJob job = jobOpt.get();
            job.setStatus(ReconciliationJob.JobStatus.CANCELLED);
            job.setCompletedAt(LocalDateTime.now());
            jobRepository.save(job);
            
            // Job annulé
            
            log.info("Job annulé: {}", jobId);
        }
    }
    
    /**
     * Récupère le statut d'un job
     */
    public Optional<ReconciliationJob> getJobStatus(String jobId) {
        return jobRepository.findByJobId(jobId);
    }
    
    /**
     * Récupère le résultat désérialisé d'un job (cache pour éviter de re-parser le JSON à chaque page).
     * Utilisé par getMatches, getBoOnly, getPartnerOnly, getMismatches pour des chargements paginés rapides.
     */
    /**
     * Cache un resultat de reconciliation synchrone (/reconcile) pour pagination HTTP.
     */
    public void cacheSyncResult(String sessionId, ReconciliationResponse result) {
        if (sessionId == null || sessionId.isBlank() || result == null) {
            return;
        }
        // Cle scopee par entreprise : evite toute fuite entre entreprises via un
        // identifiant de session devine.
        String key = tenantKey(sessionId);
        resultCache.put(key, result);
        cacheEcartsSlice(key, result);
        updateCacheAccess(key);
        evictResultCacheIfNeeded();
        log.info("Resultat sync mis en cache pour pagination: session={}, matches={}",
                sessionId, result.getMatches() != null ? result.getMatches().size() : 0);
    }

    private void cacheEcartsSlice(String sessionId, ReconciliationResponse result) {
        List<Map<String, String>> boOnly = result.getBoOnly() != null
            ? new ArrayList<>(result.getBoOnly())
            : new ArrayList<>();
        List<Map<String, String>> mismatches = result.getMismatches() != null
            ? new ArrayList<>(result.getMismatches())
            : new ArrayList<>();
        ecartsSliceCache.put(sessionId, new EcartsSlice(boOnly, mismatches));
    }

/**
     * Écarts BO légers (sans charger / sérialiser les matches).
     */
    public Optional<EcartsSlice> getCachedEcarts(String jobId) {
        String key = tenantKey(jobId);
        EcartsSlice cached = ecartsSliceCache.get(key);
        if (cached != null) {
            updateCacheAccess(key);
            return Optional.of(cached);
        }
        return getCachedResult(jobId).map(result -> {
            cacheEcartsSlice(key, result);
            return ecartsSliceCache.get(key);
        });
    }
    
    public Optional<ReconciliationResponse> getCachedResult(String jobId) {
        String key = tenantKey(jobId);
        ReconciliationResponse cached = resultCache.get(key);
        if (cached != null) {
            updateCacheAccess(key);
            return Optional.of(cached);
        }
        Optional<ReconciliationJob> jobOpt = jobRepository.findByJobId(jobId);
        if (jobOpt.isEmpty() || jobOpt.get().getResultJson() == null) {
            return Optional.empty();
        }
        try {
            ReconciliationResponse result = objectMapper.readValue(jobOpt.get().getResultJson(), ReconciliationResponse.class);
            resultCache.put(key, result);
            cacheEcartsSlice(key, result);
            updateCacheAccess(key);
            evictResultCacheIfNeeded();
            return Optional.of(result);
        } catch (JsonProcessingException e) {
            log.error("Erreur désérialisation résultat job {}: {}", jobId, e.getMessage());
            return Optional.empty();
        }
    }
    
    /**
     * Libère immédiatement un résultat (session de chunk) du cache de pagination.
     * Appelé par le frontend après avoir rechargé toutes les pages du chunk,
     * afin d'éviter que les résultats de chaque chunk (ex: 150k matches) restent
     * en heap pendant toute la durée du TTL et provoquent un OutOfMemoryError.
     */
    public boolean releaseSession(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            return false;
        }
        String key = tenantKey(sessionId);
        boolean removed = resultCache.remove(key) != null;
        ecartsSliceCache.remove(key);
        cacheAccessTimes.remove(key);
        if (removed) {
            log.info("Cache de pagination libéré pour la session: {} (taille cache restante: {})",
                    sessionId, resultCache.size());
        } else {
            log.warn("Session introuvable dans le cache de pagination: {} (taille cache actuelle: {}) — DELETE sans effet",
                    sessionId, resultCache.size());
        }
        return removed;
    }

    private void evictResultCacheIfNeeded() {
        long now = System.currentTimeMillis();
        
        // Éviction basée sur le TTL (entrées expirées)
        List<String> expiredKeys = cacheAccessTimes.entrySet().stream()
            .filter(entry -> now - entry.getValue() > CACHE_TTL_MS)
            .map(Map.Entry::getKey)
            .toList();
        
        for (String key : expiredKeys) {
            resultCache.remove(key);
            ecartsSliceCache.remove(key);
            cacheAccessTimes.remove(key);
            log.debug("Entrée de cache expirée supprimée: {}", key);
        }
        
        // Sessions de chunk : le frontend ne les recharge qu'une seule fois (juste après
        // chaque POST). En cas de DELETE HTTP jamais reçu (perdu/échoué), on limite quand
        // même l'accumulation en heap en évincant les entrées _chunk au-delà des 2 plus récentes.
        List<String> chunkKeys = cacheAccessTimes.entrySet().stream()
            .filter(entry -> isChunkSession(entry.getKey()))
            .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
            .map(Map.Entry::getKey)
            .toList();
        for (int i = CHUNK_SESSIONS_KEPT; i < chunkKeys.size(); i++) {
            String stale = chunkKeys.get(i);
            if (resultCache.remove(stale) != null) {
                ecartsSliceCache.remove(stale);
                cacheAccessTimes.remove(stale);
                log.warn("Session chunk évincée par garde-fou mémoire (cette session {} est restée en cache sans être libérée)", stale);
            }
        }
        
        // Éviction LRU si encore trop d'entrées
        while (resultCache.size() > RESULT_CACHE_MAX_SIZE) {
            String oldest = cacheAccessTimes.entrySet().stream()
                .min(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse(null);
            if (oldest == null) {
                break;
            }
            resultCache.remove(oldest);
            ecartsSliceCache.remove(oldest);
            cacheAccessTimes.remove(oldest);
            log.debug("Entrée de cache LRU supprimée: {}", oldest);
        }
    }

    private boolean isChunkSession(String sessionId) {
        return sessionId != null && sessionId.matches(".*_chunk\\d+$");
    }
    
    private void updateCacheAccess(String jobId) {
        cacheAccessTimes.put(jobId, System.currentTimeMillis());
    }

    /**
     * Scinde les cles du cache de pagination par entreprise : un identifiant de
     * session fourni par le client ne doit jamais donner acces aux donnees d'une
     * autre entreprise.
     */
    private static String tenantKey(String key) {
        Long tenant = com.reconciliation.tenant.TenantContext.get();
        return (tenant == null ? "0" : tenant.toString()) + ":" + key;
    }
    
    /**
     * Sauvegarde un fichier uploadé
     */
    private String saveFile(MultipartFile file, String prefix) throws IOException {
        String originalFilename = file.getOriginalFilename();
        String extension = "";
        if (originalFilename != null && originalFilename.contains(".")) {
            extension = originalFilename.substring(originalFilename.lastIndexOf("."));
        }
        
        String filename = prefix + extension;
        Path filePath = Paths.get(UPLOAD_DIR, filename);
        Files.copy(file.getInputStream(), filePath);
        
        return filePath.toString();
    }
    
    /**
     * Nettoie les anciens jobs
     */
    @Transactional
    public void cleanupOldJobs() {
        LocalDateTime cutoffDate = LocalDateTime.now().minusHours(24);
        var staleJobs = jobRepository.findStaleJobs(cutoffDate);
        
        for (ReconciliationJob job : staleJobs) {
            resultCache.remove(job.getJobId());
            ecartsSliceCache.remove(job.getJobId());
            job.setStatus(ReconciliationJob.JobStatus.FAILED);
            job.setErrorMessage("Job expiré - nettoyage automatique");
            job.setCompletedAt(LocalDateTime.now());
            jobRepository.save(job);
            
            log.warn("Job expiré nettoyé: {}", job.getJobId());
        }
    }
}
