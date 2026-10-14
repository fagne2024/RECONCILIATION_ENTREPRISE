package com.reconciliation.repository;

import com.reconciliation.entity.UserLogEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface UserLogRepository extends JpaRepository<UserLogEntity, Long> {
    
    List<UserLogEntity> findByUsername(String username);
    
    List<UserLogEntity> findByModule(String module);
    
    List<UserLogEntity> findByPermission(String permission);
    
    @Query("SELECT u FROM UserLogEntity u WHERE u.dateHeure BETWEEN :dateDebut AND :dateFin ORDER BY u.dateHeure DESC")
    List<UserLogEntity> findByDateHeureBetween(@Param("dateDebut") LocalDateTime dateDebut, 
                                               @Param("dateFin") LocalDateTime dateFin);
    
    @Query("SELECT u FROM UserLogEntity u WHERE u.username = :username AND u.dateHeure BETWEEN :dateDebut AND :dateFin ORDER BY u.dateHeure DESC")
    List<UserLogEntity> findByUsernameAndDateHeureBetween(@Param("username") String username,
                                                          @Param("dateDebut") LocalDateTime dateDebut,
                                                          @Param("dateFin") LocalDateTime dateFin);
    
    @Query("SELECT u FROM UserLogEntity u WHERE u.module = :module AND u.dateHeure BETWEEN :dateDebut AND :dateFin ORDER BY u.dateHeure DESC")
    List<UserLogEntity> findByModuleAndDateHeureBetween(@Param("module") String module,
                                                        @Param("dateDebut") LocalDateTime dateDebut,
                                                        @Param("dateFin") LocalDateTime dateFin);
    
    @Query("SELECT u FROM UserLogEntity u ORDER BY u.dateHeure DESC")
    List<UserLogEntity> findAllOrderByDateHeureDesc();
}

