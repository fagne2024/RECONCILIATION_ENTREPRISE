package com.reconciliation.service;

import com.reconciliation.entity.PasswordResetTokenEntity;
import com.reconciliation.repository.PasswordResetTokenRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.Optional;
import java.security.SecureRandom;

@Service
public class PasswordResetTokenService {

    static final Duration TOKEN_TTL = Duration.ofMinutes(15);
    private static final int TOKEN_BYTES = 32;

    private final PasswordResetTokenRepository tokenRepository;
    private final SecureRandom random = new SecureRandom();

    public PasswordResetTokenService(PasswordResetTokenRepository tokenRepository) {
        this.tokenRepository = tokenRepository;
    }

    /**
     * Émet un jeton de réinitialisation à usage unique, valable 15 minutes.
     * Un seul jeton actif est conservé par utilisateur.
     */
    @Transactional
    public String issueToken(String username) {
        tokenRepository.deleteByUsername(username);
        LocalDateTime now = LocalDateTime.now();
        PasswordResetTokenEntity token = new PasswordResetTokenEntity();
        token.setToken(HexFormat.of().formatHex(randomBytes(TOKEN_BYTES)));
        token.setUsername(username);
        token.setUsed(false);
        token.setCreatedAt(now);
        token.setExpiresAt(now.plus(TOKEN_TTL));
        tokenRepository.save(token);
        tokenRepository.deleteByCreatedAtBefore(now.minus(Duration.ofDays(7)));
        return token.getToken();
    }

    /**
     * Consomme un jeton et retourne le nom d'utilisateur associé.
     */
    @Transactional
    public Optional<String> consumeToken(String rawToken) {
        if (rawToken == null || rawToken.isBlank() || rawToken.length() > 64) {
            return Optional.empty();
        }
        int consumed = tokenRepository.consumeIfValid(rawToken, LocalDateTime.now());
        if (consumed != 1) {
            return Optional.empty();
        }
        return tokenRepository.findByToken(rawToken).map(PasswordResetTokenEntity::getUsername);
    }

    private byte[] randomBytes(int count) {
        byte[] bytes = new byte[count];
        random.nextBytes(bytes);
        return bytes;
    }
}