package com.reconciliation.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * S-06 : le secret JWT est obligatoire et doit faire au moins 32 octets.
 */
class JwtServiceSecretTest {

    private JwtService serviceWithSecret(String secret) {
        JwtService service = new JwtService();
        ReflectionTestUtils.setField(service, "secret", secret);
        ReflectionTestUtils.setField(service, "expiration", 86400000L);
        return service;
    }

    @Test
    @DisplayName("Refuse un secret absent")
    void rejectsMissingSecret() {
        JwtService service = serviceWithSecret(null);
        assertThatThrownBy(service::validateSecret).isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("Refuse un secret trop court")
    void rejectsShortSecret() {
        JwtService service = serviceWithSecret("trop-court");
        assertThatThrownBy(service::validateSecret).isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("Accepte un secret de 32 octets ou plus")
    void acceptsStrongSecret() {
        JwtService service = serviceWithSecret("0123456789abcdefghijklmnopqrstuvwxyz");
        assertThatCode(service::validateSecret).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Un token généré est lisible et valide")
    void tokenRoundTrip() {
        JwtService service = serviceWithSecret("0123456789abcdefghijklmnopqrstuvwxyz-extra");
        service.validateSecret();
        String token = service.generateToken("alice");
        assertThat(service.extractUsername(token)).isEqualTo("alice");
        assertThat(service.validateToken(token, "alice")).isTrue();
        assertThat(service.validateToken(token, "bob")).isFalse();
    }
}