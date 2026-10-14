package com.reconciliation.service;

import com.reconciliation.entity.PasswordResetTokenEntity;
import com.reconciliation.repository.PasswordResetTokenRepository;
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
class PasswordResetTokenServiceTest {

    @Mock
    private PasswordResetTokenRepository repository;

    @InjectMocks
    private PasswordResetTokenService service;

    @Test
    @DisplayName("Émet un jeton de 64 caractères valable 15 minutes")
    void issueStoresToken() {
        when(repository.save(any(PasswordResetTokenEntity.class))).thenAnswer(inv -> inv.getArgument(0));

        String token = service.issueToken("alice");

        assertThat(token).hasSize(64);
        verify(repository).save(org.mockito.ArgumentMatchers.argThat(t ->
                "alice".equals(t.getUsername())
                        && !t.getUsed()
                        && t.getExpiresAt().isAfter(LocalDateTime.now().plusMinutes(10))));
    }

    @Test
    @DisplayName("Retourne vide si le jeton est invalide")
    void consumeInvalidReturnsEmpty() {
        when(repository.consumeIfValid(anyString(), any())).thenReturn(0);
        assertThat(service.consumeToken("deadbeef")).isEmpty();
    }

    @Test
    @DisplayName("Consomme un jeton valide")
    void consumeValidReturnsUser() {
        PasswordResetTokenEntity token = new PasswordResetTokenEntity();
        token.setUsername("bob");
        when(repository.consumeIfValid(eq("tok"), any())).thenReturn(1);
        when(repository.findByToken("tok")).thenReturn(Optional.of(token));

        assertThat(service.consumeToken("tok")).contains("bob");
    }
}