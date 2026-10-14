package com.reconciliation.service;

import com.reconciliation.entity.AuthTicketEntity;
import com.reconciliation.repository.AuthTicketRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.Optional;
import java.security.SecureRandom;

@Service
public class AuthTicketService {

    static final Duration TICKET_TTL = Duration.ofMinutes(5);
    private static final int TOKEN_BYTES = 32;

    private final AuthTicketRepository authTicketRepository;
    private final SecureRandom random = new SecureRandom();

    public AuthTicketService(AuthTicketRepository authTicketRepository) {
        this.authTicketRepository = authTicketRepository;
    }

    /**
     * Émet un ticket pré-auth 2FA à usage unique, valable 5 minutes.
     * Un seul ticket actif est conservé par utilisateur (le précédent est invalidé).
     */
    @Transactional
    public String issueTicket(String username) {
        authTicketRepository.deleteByUsername(username);
        LocalDateTime now = LocalDateTime.now();
        AuthTicketEntity ticket = new AuthTicketEntity();
        ticket.setToken(HexFormat.of().formatHex(randomBytes(TOKEN_BYTES)));
        ticket.setUsername(username);
        ticket.setUsed(false);
        ticket.setCreatedAt(now);
        ticket.setExpiresAt(now.plus(TICKET_TTL));
        authTicketRepository.save(ticket);
        authTicketRepository.deleteByCreatedAtBefore(now.minus(Duration.ofDays(1)));
        return ticket.getToken();
    }

    /**
     * Consomme un ticket et retourne le nom d'utilisateur associé.
     * Retourne vide si le ticket est inconnu, déjà utilisé ou expiré.
     */
    @Transactional
    public Optional<String> consumeTicket(String rawToken) {
        if (rawToken == null || rawToken.isBlank() || rawToken.length() > 64) {
            return Optional.empty();
        }
        int consumed = authTicketRepository.consumeIfValid(rawToken, LocalDateTime.now());
        if (consumed != 1) {
            return Optional.empty();
        }
        return authTicketRepository.findByToken(rawToken).map(AuthTicketEntity::getUsername);
    }

    private byte[] randomBytes(int count) {
        byte[] bytes = new byte[count];
        random.nextBytes(bytes);
        return bytes;
    }
}