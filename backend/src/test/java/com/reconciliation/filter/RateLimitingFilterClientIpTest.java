package com.reconciliation.filter;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Clé de rate limiting derrière le proxy frontend local : chaque utilisateur distant
 * doit avoir son propre quota, sans permettre de forger l'IP par X-Forwarded-For.
 */
class RateLimitingFilterClientIpTest {

    private final RateLimitingFilter filter = new RateLimitingFilter();

    private MockHttpServletRequest request(String remoteAddr, String forwardedFor) {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/operations");
        req.setRemoteAddr(remoteAddr);
        if (forwardedFor != null) {
            req.addHeader("X-Forwarded-For", forwardedFor);
        }
        return req;
    }

    @Test
    void viaProxyLocal_utiliseLIpAjouteeParLeProxy() {
        assertThat(filter.getClientIpAddress(request("0:0:0:0:0:0:0:1", "10.20.30.40"))).isEqualTo("10.20.30.40");
        assertThat(filter.getClientIpAddress(request("127.0.0.1", "10.20.30.41"))).isEqualTo("10.20.30.41");
    }

    @Test
    void viaProxyLocal_ignoreLesEntreesForgeesParLeClient() {
        // Le client envoie « 1.1.1.1 », le proxy ajoute l'IP réelle de la socket à la fin.
        assertThat(filter.getClientIpAddress(request("::1", "1.1.1.1, 10.20.30.40"))).isEqualTo("10.20.30.40");
    }

    @Test
    void appelDirectDistant_ignoreXForwardedFor() {
        assertThat(filter.getClientIpAddress(request("10.20.30.40", "1.1.1.1"))).isEqualTo("10.20.30.40");
    }

    @Test
    void proxyLocalSansEnTete_garderLAdresseLocale() {
        assertThat(filter.getClientIpAddress(request("::1", null))).isEqualTo("::1");
    }
}
