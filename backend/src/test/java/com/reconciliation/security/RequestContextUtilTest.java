package com.reconciliation.security;

import com.reconciliation.util.RequestContextUtil;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * S-07 : l'identité provient uniquement du contexte de sécurité Spring,
 * jamais d'un header HTTP client.
 */
class RequestContextUtilTest {

    @AfterEach
    void cleanup() {
        SecurityContextHolder.clearContext();
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    @DisplayName("Retourne null sans authentification")
    void nullWhenAnonymous() {
        assertThat(RequestContextUtil.getUsernameFromRequest()).isNull();
    }

    @Test
    @DisplayName("Retourne l'utilisateur authentifié")
    void returnsAuthenticatedUser() {
        UserDetails details = User.withUsername("bob")
                .password("x")
                .authorities("ROLE_USER")
                .build();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(details, null, details.getAuthorities()));

        assertThat(RequestContextUtil.getUsernameFromRequest()).isEqualTo("bob");
    }

    @Test
    @DisplayName("Ignore le header X-Username forgé")
    void ignoresSpoofedHeader() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Username", "attacker");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));

        assertThat(RequestContextUtil.getUsernameFromRequest()).isNull();
    }
}