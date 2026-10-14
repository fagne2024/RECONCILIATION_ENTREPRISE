package com.reconciliation.repository;

import com.reconciliation.entity.AuthTicketEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;

public interface AuthTicketRepository extends JpaRepository<AuthTicketEntity, Long> {

    Optional<AuthTicketEntity> findByToken(String token);

    /**
     * Consomme atomiquement un ticket si et seulement s'il n'a pas déjà été utilisé
     * et qu'il n'est pas expiré. Retourne le nombre de lignes affectées (1 ou 0).
     */
    @Modifying
    @Query("UPDATE AuthTicketEntity a SET a.used = true WHERE a.token = :token AND a.used = false AND a.expiresAt > :now")
    int consumeIfValid(@Param("token") String token, @Param("now") LocalDateTime now);

    long deleteByUsername(String username);

    long deleteByCreatedAtBefore(LocalDateTime before);
}