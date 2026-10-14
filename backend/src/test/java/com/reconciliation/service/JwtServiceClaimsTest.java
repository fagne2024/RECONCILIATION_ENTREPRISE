package com.reconciliation.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Etape 2 : les claims {@code role} et {@code entrepriseId} doivent survivre a
 * un aller-retour de signature/parsing, et l'absence de claim {@code entrepriseId}
 * doit correspondre au SUPER_ADMIN.
 */
class JwtServiceClaimsTest {

    private JwtService service() {
        JwtService service = new JwtService();
        ReflectionTestUtils.setField(service, "secret", "0123456789abcdef0123456789abcdef0123456789abcdef");
        ReflectionTestUtils.setField(service, "expiration", 86400000L);
        return service;
    }

    @Test
    @DisplayName("Un compte entreprise porte son role et son entreprise")
    void entrepriseClaimsRoundTrip() {
        JwtService service = service();
        Map<String, Object> claims = new HashMap<>();
        claims.put(JwtService.CLAIM_ROLE, "ADMIN");
        claims.put(JwtService.CLAIM_ENTREPRISE_ID, 7L);

        String token = service.generateToken("admin", claims);

        assertThat(service.extractUsername(token)).isEqualTo("admin");
        assertThat(service.extractRole(token)).isEqualTo("ADMIN");
        assertThat(service.extractEntrepriseId(token)).isEqualTo(7L);
    }

    @Test
    @DisplayName("Un SUPER_ADMIN n'a pas de claim entreprise")
    void superAdminHasNoEntrepriseClaim() {
        JwtService service = service();
        Map<String, Object> claims = new HashMap<>();
        claims.put(JwtService.CLAIM_ROLE, "SUPER_ADMIN");

        String token = service.generateToken("superadmin", claims);

        assertThat(service.extractRole(token)).isEqualTo("SUPER_ADMIN");
        assertThat(service.extractEntrepriseId(token)).isNull();
    }
}
