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
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Un jeton invalide (cookie d'un autre environnement, autre secret JWT, utilisateur
 * absent de la base) ne doit plus renvoyer 401 sur toutes les routes : la requête
 * continue en anonyme (les routes protégées restent refusées par Spring Security)
 * et le cookie périmé est effacé.
 */
class JwtAuthenticationFilterInvalidTokenTest {

    private JwtAuthenticationFilter filter;
    private JwtService jwtService;
    private AuthCookieService authCookieService;

    @BeforeEach
    void setUp() {
        filter = new JwtAuthenticationFilter();
        jwtService = mock(JwtService.class);
        authCookieService = new AuthCookieService();
        ReflectionTestUtils.setField(authCookieService, "expirationMs", 3_600_000L);
        ReflectionTestUtils.setField(filter, "jwtService", jwtService);
        ReflectionTestUtils.setField(filter, "userDetailsService", mock(UserDetailsService.class));
        ReflectionTestUtils.setField(filter, "entrepriseRepository", mock(EntrepriseRepository.class));
        ReflectionTestUtils.setField(filter, "userRepository", mock(UserRepository.class));
        ReflectionTestUtils.setField(filter, "authCookieService", authCookieService);
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private MockHttpServletRequest loginAvecCookie(String jeton) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/login");
        request.setCookies(new Cookie(AuthCookieService.COOKIE_NAME, jeton));
        return request;
    }

    @Test
    void cookieSigneParUnAutreBackend_laRequeteContinueEtLeCookieEstEfface() throws Exception {
        when(jwtService.extractUsername(anyString()))
            .thenThrow(new io.jsonwebtoken.security.SignatureException("signature invalide"));

        MockHttpServletRequest request = loginAvecCookie("jeton-autre-environnement");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(chain.getRequest()).as("la chaine doit continuer jusqu'au login").isNotNull();
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        assertThat(response.getHeader("Set-Cookie"))
            .contains(AuthCookieService.COOKIE_NAME + "=")
            .contains("Max-Age=0");
    }

    @Test
    void jetonExpire_laRequeteContinueSansAuthentification() throws Exception {
        when(jwtService.extractUsername(anyString())).thenReturn("yamar.ndao");
        when(jwtService.validateToken(anyString(), anyString())).thenReturn(false);

        MockHttpServletRequest request = loginAvecCookie("jeton-expire");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(chain.getRequest()).isNotNull();
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        assertThat(response.getHeader("Set-Cookie")).contains("Max-Age=0");
    }

    @Test
    void jetonInvalideEnHeader_leCookieNestPasEfface() throws Exception {
        when(jwtService.extractUsername(anyString()))
            .thenThrow(new io.jsonwebtoken.MalformedJwtException("mal forme"));

        MockHttpServletRequest request = loginAvecCookie("cookie-valide");
        request.addHeader("Authorization", "Bearer header-invalide");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(chain.getRequest()).isNotNull();
        assertThat(response.getHeader("Set-Cookie")).isNull();
    }
}
