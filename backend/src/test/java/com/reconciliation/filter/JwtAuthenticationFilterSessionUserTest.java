package com.reconciliation.filter;

import com.reconciliation.repository.EntrepriseRepository;
import com.reconciliation.repository.UserRepository;
import com.reconciliation.service.AuthCookieService;
import com.reconciliation.service.JwtService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Session désynchronisée : le cookie appartient à un autre compte que celui affiché par le
 * navigateur (en-tête X-Session-User) -> 401 pour que le frontend déconnecte, au lieu de
 * refus « permission » obtenus avec les droits d'un autre utilisateur.
 */
class JwtAuthenticationFilterSessionUserTest {

    private JwtAuthenticationFilter filter;

    @BeforeEach
    void setUp() {
        filter = new JwtAuthenticationFilter();
        JwtService jwtService = mock(JwtService.class);
        when(jwtService.extractUsername(anyString())).thenReturn("cheikhna.camara");
        when(jwtService.validateToken(anyString(), anyString())).thenReturn(true);
        UserDetailsService uds = mock(UserDetailsService.class);
        when(uds.loadUserByUsername("cheikhna.camara"))
            .thenReturn(new User("cheikhna.camara", "x", List.of()));
        UserRepository userRepository = mock(UserRepository.class);
        when(userRepository.findEntrepriseIdByUsername(anyString())).thenReturn(Optional.empty());
        AuthCookieService authCookieService = new AuthCookieService();
        ReflectionTestUtils.setField(filter, "jwtService", jwtService);
        ReflectionTestUtils.setField(filter, "userDetailsService", uds);
        ReflectionTestUtils.setField(filter, "entrepriseRepository", mock(EntrepriseRepository.class));
        ReflectionTestUtils.setField(filter, "userRepository", userRepository);
        ReflectionTestUtils.setField(filter, "authCookieService", authCookieService);
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private MockHttpServletRequest requete(String path, String sessionUser) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
        request.setCookies(new Cookie(AuthCookieService.COOKIE_NAME, "jeton"));
        if (sessionUser != null) {
            request.addHeader("X-Session-User", sessionUser);
        }
        return request;
    }

    @Test
    void autreUtilisateurQueLeCookie_401() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();
        filter.doFilter(requete("/api/pays", "agent.trx"), response, chain);
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(chain.getRequest()).isNull();
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void memeUtilisateur_authentifie() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();
        filter.doFilter(requete("/api/pays", "Cheikhna.Camara"), response, chain);
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(chain.getRequest()).isNotNull();
    }

    @Test
    void sansEnteteOuSurApiAuth_pasDeControle() throws Exception {
        MockFilterChain chain1 = new MockFilterChain();
        filter.doFilter(requete("/api/pays", null), new MockHttpServletResponse(), chain1);
        assertThat(chain1.getRequest()).isNotNull();

        SecurityContextHolder.clearContext();
        MockFilterChain chain2 = new MockFilterChain();
        filter.doFilter(requete("/api/auth/logout", "agent.trx"), new MockHttpServletResponse(), chain2);
        assertThat(chain2.getRequest()).isNotNull();
    }
}
