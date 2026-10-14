package com.reconciliation.service;

import com.reconciliation.entity.UserLogEntity;
import com.reconciliation.repository.UserLogRepository;
import com.reconciliation.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
public class UserLogService {

    private static final Logger log = LoggerFactory.getLogger(UserLogService.class);

    @Autowired
    private UserLogRepository userLogRepository;

    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /**
     * Enregistre un log utilisateur
     */
    @Transactional
    public UserLogEntity saveLog(String permission, String module, String username) {
        return saveLog(permission, module, username, null);
    }
    
    /**
     * Enregistre un log utilisateur avec détails
     */
    @Transactional
    public UserLogEntity saveLog(String permission, String module, String username, String details) {
        // Contexte plateforme (SUPER_ADMIN : pas de claim entrepriseId) : le
        // journal user_log est scindé PAR ENTREPRISE. Les actions de la plateforme
        // sont tracées dans platform_audit_log ; on n'insère donc rien ici.
        // Un INSERT via Hibernate échouerait de toute façon sur la clé étrangère
        // fk_user_log_entreprise : le tenant sentinel -1 n'existe pas en base
        // (fail-closed, colonne @TenantId).
        if (TenantContext.get() == null) {
            log.debug("Log utilisateur ignore (contexte plateforme - aucun entreprise_id) : {} {} par {}", permission, module, username);
            return null;
        }
        try {
            log.trace("UserLog save permission={} module={} user={}", permission, module, username);
            UserLogEntity logEntity = new UserLogEntity(permission, module, username, LocalDateTime.now(), details);
            return userLogRepository.save(logEntity);
        } catch (Exception e) {
            log.error("UserLog save error: {}", e.getMessage());
            throw e; // Re-lancer l'exception pour que l'intercepteur puisse la gérer
        }
    }

    /**
     * Récupère tous les logs triés par date décroissante
     */
    public List<UserLogEntity> getAllLogs() {
        return userLogRepository.findAllOrderByDateHeureDesc();
    }

    /**
     * Récupère les logs d'un utilisateur
     */
    public List<UserLogEntity> getLogsByUsername(String username) {
        return userLogRepository.findByUsername(username);
    }

    /**
     * Récupère les logs d'un module
     */
    public List<UserLogEntity> getLogsByModule(String module) {
        return userLogRepository.findByModule(module);
    }

    /**
     * Récupère les logs d'une permission
     */
    public List<UserLogEntity> getLogsByPermission(String permission) {
        return userLogRepository.findByPermission(permission);
    }

    /**
     * Récupère les logs entre deux dates
     */
    public List<UserLogEntity> getLogsByDateRange(String dateDebut, String dateFin) {
        LocalDateTime dateDebutParsed = null;
        LocalDateTime dateFinParsed = null;
        
        if (dateDebut != null && !dateDebut.isEmpty()) {
            try {
                if (dateDebut.contains("T")) {
                    dateDebutParsed = LocalDateTime.parse(dateDebut.replace("T", " "));
                } else {
                    dateDebutParsed = LocalDateTime.parse(dateDebut, DATE_FORMATTER);
                }
            } catch (Exception e) {
                // Date invalide, on ignore le filtre
            }
        }
        
        if (dateFin != null && !dateFin.isEmpty()) {
            try {
                if (dateFin.contains("T")) {
                    dateFinParsed = LocalDateTime.parse(dateFin.replace("T", " "));
                } else {
                    dateFinParsed = LocalDateTime.parse(dateFin, DATE_FORMATTER);
                }
            } catch (Exception e) {
                // Date invalide, on ignore le filtre
            }
        }

        if (dateDebutParsed != null && dateFinParsed != null) {
            return userLogRepository.findByDateHeureBetween(dateDebutParsed, dateFinParsed);
        } else if (dateDebutParsed != null) {
            dateFinParsed = LocalDateTime.now();
            return userLogRepository.findByDateHeureBetween(dateDebutParsed, dateFinParsed);
        } else if (dateFinParsed != null) {
            dateDebutParsed = LocalDateTime.of(2000, 1, 1, 0, 0);
            return userLogRepository.findByDateHeureBetween(dateDebutParsed, dateFinParsed);
        }
        
        return getAllLogs();
    }

    /**
     * Récupère les logs avec filtres multiples
     */
    public List<UserLogEntity> getLogsWithFilters(String username, String module, String permission, 
                                                  String dateDebut, String dateFin) {
        List<UserLogEntity> logs;
        
        // Filtrer par date d'abord si fourni
        if (dateDebut != null && !dateDebut.isEmpty() || dateFin != null && !dateFin.isEmpty()) {
            logs = getLogsByDateRange(dateDebut, dateFin);
        } else {
            logs = getAllLogs();
        }
        
        // Filtrer par username si fourni (contient, insensible à la casse)
        if (username != null && !username.isEmpty()) {
            final String usernameQuery = username.toLowerCase();
            logs = logs.stream()
                    .filter(log -> {
                        String value = log.getUsername();
                        return value != null && value.toLowerCase().contains(usernameQuery);
                    })
                    .toList();
        }
        
        // Filtrer par module si fourni (contient, insensible à la casse)
        if (module != null && !module.isEmpty()) {
            final String moduleQuery = module.toLowerCase();
            logs = logs.stream()
                    .filter(log -> {
                        String value = log.getModule();
                        return value != null && value.toLowerCase().contains(moduleQuery);
                    })
                    .toList();
        }
        
        // Filtrer par permission si fourni (contient, insensible à la casse)
        if (permission != null && !permission.isEmpty()) {
            final String permissionQuery = permission.toLowerCase();
            logs = logs.stream()
                    .filter(log -> {
                        String value = log.getPermission();
                        return value != null && value.toLowerCase().contains(permissionQuery);
                    })
                    .toList();
        }
        
        return logs;
    }
}

