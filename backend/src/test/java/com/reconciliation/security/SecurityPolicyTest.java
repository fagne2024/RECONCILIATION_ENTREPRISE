package com.reconciliation.security;

import com.reconciliation.config.SecurityConfig;
import com.reconciliation.filter.JwtAuthenticationFilter;
import com.reconciliation.filter.RateLimitingFilter;
import com.reconciliation.interceptor.PermissionInterceptor;
import com.reconciliation.interceptor.UserLoggingInterceptor;
import com.reconciliation.service.JwtService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * S-01 : seules quelques routes sont publiques, tout le reste exige un JWT.
 */
@WebMvcTest(controllers = SecurityPolicyTest.ProbeController.class)
@Import({SecurityConfig.class, SecurityPolicyTest.TestBeans.class})
class SecurityPolicyTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private PermissionInterceptor permissionInterceptor;

    @MockBean
    private UserLoggingInterceptor userLoggingInterceptor;

    @RestController
    static class ProbeController {
        @GetMapping("/probe/protected")
        String protectedProbe() {
            return "ok";
        }
    }

    @TestConfiguration
    static class TestBeans {
        @Bean
        JwtService jwtService() {
            return mock(JwtService.class);
        }

        @Bean
        UserDetailsService userDetailsService() {
            return mock(UserDetailsService.class);
        }

        @Bean
        com.reconciliation.repository.EntrepriseRepository entrepriseRepository() {
            return mock(com.reconciliation.repository.EntrepriseRepository.class);
        }

        @Bean
        JwtAuthenticationFilter jwtAuthenticationFilter(JwtService jwtService,
                                                        UserDetailsService userDetailsService,
                                                        com.reconciliation.repository.EntrepriseRepository entrepriseRepository) {
            JwtAuthenticationFilter filter = new JwtAuthenticationFilter();
            ReflectionTestUtils.setField(filter, "jwtService", jwtService);
            ReflectionTestUtils.setField(filter, "userDetailsService", userDetailsService);
            ReflectionTestUtils.setField(filter, "entrepriseRepository", entrepriseRepository);
            return filter;
        }

        @Bean
        RateLimitingFilter rateLimitingFilter() {
            return new RateLimitingFilter();
        }
    }

    @Test
    @DisplayName("Un endpoint quelconque sans token renvoie 401")
    void protectedEndpointWithoutToken() throws Exception {
        mockMvc.perform(get("/probe/protected")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/comptes")).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Le login reste accessible sans token")
    void loginIsPublic() throws Exception {
        int status = mockMvc.perform(post("/api/auth/login")).andReturn().getResponse().getStatus();
        assertThat(status).isNotEqualTo(401);
    }

    @Test
    @DisplayName("Le preflight CORS (OPTIONS) n'est pas bloqué")
    void optionsIsNotBlocked() throws Exception {
        int status = mockMvc.perform(options("/api/comptes")).andReturn().getResponse().getStatus();
        assertThat(status).isNotEqualTo(401);
    }

    @Test
    @DisplayName("L'activation de compte est publique, l'administration plateforme ne l'est pas")
    void platformRoutesPolicy() throws Exception {
        int activateStatus = mockMvc.perform(post("/api/users/activate")).andReturn().getResponse().getStatus();
        assertThat(activateStatus).as("POST /api/users/activate doit etre public").isNotEqualTo(401);

        mockMvc.perform(get("/api/platform/entreprises")).andExpect(status().isUnauthorized());
    }
}