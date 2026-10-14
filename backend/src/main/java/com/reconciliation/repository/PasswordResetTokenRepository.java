package com.reconciliation.repository;

import com.reconciliation.entity.PasswordResetTokenEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetTokenEntity, Long> {

    Optional<PasswordResetTokenEntity> findByToken(String token);

    /**
     * Consomme atomiquement un jeton s'il n'a pas déjà été utilisé et qu'il n'est pas expiré.
     */
    @Modifying
    @Query("UPDATE PasswordResetTokenEntity t SET t.used = true WHERE t.token = :token AND t.used = false AND t.expiresAt > :now")
    int consumeIfValid(@Param("token") String token, @Param("now") LocalDateTime now);

    long deleteByUsername(String username);

    long deleteByCreatedAtBefore(LocalDateTime before);
}