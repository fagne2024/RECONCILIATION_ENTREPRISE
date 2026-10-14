package com.reconciliation.service;

import com.reconciliation.entity.ActivationTokenEntity;
import com.reconciliation.repository.ActivationTokenRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.Optional;

/**
 * Jetons d'activation d'un compte entreprise (lien a usage unique).
 *
 * <p>Trois differences avec {@link PasswordResetTokenService} (mot de passe
 * oublie) : duree de vie plus longue (72 h au lieu de 15 min), rattachement a
 * une entreprise, et semantique d'activation initiale du compte.</p>
 */
@Service
public class ActivationTokenService {

    /** Duree de validite d'un lien d'activation. */
    static final Duration TOKEN_TTL = Duration.ofHours(72);
    private static final int TOKEN_BYTES = 32;

    private final ActivationTokenRepository tokenRepository;
    private final SecureRandom random = new SecureRandom();

    public ActivationTokenService(ActivationTokenRepository tokenRepository) {
        this.tokenRepository = tokenRepository;
    }

    /**
     * Emet un nouveau jeton d'activation (un seul actif par compte : les
     * precedents sont supprimes). Purge au passage les jetons anciens.
     */
    @Transactional
    public String issueToken(String username, Long entrepriseId) {
        tokenRepository.deleteByUsername(username);
        LocalDateTime now = LocalDateTime.now();
        ActivationTokenEntity token = new ActivationTokenEntity();
        token.setToken(HexFormat.of().formatHex(randomBytes(TOKEN_BYTES)));
        token.setUsername(username);
        token.setEntrepriseId(entrepriseId);
        token.setUsed(false);
        token.setCreatedAt(now);
        token.setExpiresAt(now.plus(TOKEN_TTL));
        tokenRepository.save(token);
        tokenRepository.deleteByCreatedAtBefore(now.minus(Duration.ofDays(7)));
        return token.getToken();
    }

    /**
     * Consomme un jeton d'activation valide (ni utilise, ni expire) et retourne
     * sa ligne.
     */
    @Transactional
    public Optional<ActivationTokenEntity> consumeToken(String rawToken) {
        if (rawToken == null || rawToken.isBlank() || rawToken.length() > 64) {
            return Optional.empty();
        }
        int consumed = tokenRepository.consumeIfValid(rawToken, LocalDateTime.now());
        if (consumed != 1) {
            return Optional.empty();
        }
        return tokenRepository.findByToken(rawToken);
    }

    private byte[] randomBytes(int count) {
        byte[] bytes = new byte[count];
        random.nextBytes(bytes);
        return bytes;
    }
}
