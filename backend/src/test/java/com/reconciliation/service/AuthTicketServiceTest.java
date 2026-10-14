package com.reconciliation.service;

import com.reconciliation.entity.AuthTicketEntity;
import com.reconciliation.repository.AuthTicketRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthTicketServiceTest {

    @Mock
    private AuthTicketRepository repository;

    @InjectMocks
    private AuthTicketService service;

    @Test
    @DisplayName("Émet un ticket de 64 caractères, non utilisé, non expiré")
    void issueStoresValidTicket() {
        when(repository.save(any(AuthTicketEntity.class))).thenAnswer(inv -> inv.getArgument(0));

        String token = service.issueTicket("alice");

        assertThat(token).hasSize(64);
        verify(repository).save(org.mockito.ArgumentMatchers.argThat(ticket ->
                "alice".equals(ticket.getUsername())
                        && !ticket.getUsed()
                        && ticket.getExpiresAt().isAfter(LocalDateTime.now())));
        verify(repository).deleteByUsername("alice");
    }

    @Test
    @DisplayName("Retourne vide si le ticket est inconnu/expiré/déjà utilisé")
    void consumeInvalidReturnsEmpty() {
        when(repository.consumeIfValid(anyString(), any())).thenReturn(0);
        assertThat(service.consumeTicket("deadbeef")).isEmpty();
    }

    @Test
    @DisplayName("Consomme un ticket valide et retourne l'utilisateur")
    void consumeValidReturnsUser() {
        AuthTicketEntity ticket = new AuthTicketEntity();
        ticket.setUsername("bob");
        when(repository.consumeIfValid(eq("tok"), any())).thenReturn(1);
        when(repository.findByToken("tok")).thenReturn(Optional.of(ticket));

        assertThat(service.consumeTicket("tok")).contains("bob");
    }

    @Test
    @DisplayName("Refuse un ticket vide ou surdimensionné")
    void consumeRejectsMalformed() {
        assertThat(service.consumeTicket(null)).isEmpty();
        assertThat(service.consumeTicket("   ")).isEmpty();
        assertThat(service.consumeTicket("x".repeat(65))).isEmpty();
    }
}