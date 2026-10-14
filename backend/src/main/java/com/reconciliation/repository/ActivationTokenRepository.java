package com.reconciliation.repository;

import com.reconciliation.entity.ActivationTokenEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;

public interface ActivationTokenRepository extends JpaRepository<ActivationTokenEntity, Long> {

    Optional<ActivationTokenEntity> findByToken(String token);

    /**
     * Consomme atomiquement un jeton s'il n'a pas deja ete utilise et qu'il
     * n'est pas expire.
     */
    @Modifying
    @Query("UPDATE ActivationTokenEntity t SET t.used = true "
        + "WHERE t.token = :token AND t.used = false AND t.expiresAt > :now")
    int consumeIfValid(@Param("token") String token, @Param("now") LocalDateTime now);

    long deleteByUsername(String username);

    long deleteByCreatedAtBefore(LocalDateTime before);
}
