package com.reconciliation.security;

import com.reconciliation.annotation.RequiresModule;
import com.reconciliation.interceptor.PermissionInterceptor;
import com.reconciliation.service.EntrepriseModuleService;
import com.reconciliation.service.PermissionCheckService;
import com.reconciliation.service.UserLogService;
import com.reconciliation.tenant.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.method.HandlerMethod;

import java.lang.reflect.Method;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Etape 5 : le {@code PermissionInterceptor} refuse (403) l'acces a un module
 * desactive pour l'entreprise, et l'annotation {@code @RequiresModule} prime sur
 * le module resolu depuis le chemin.
 *
 * <p>Test unitaire isole : le moteur de permissions est simule (permission
 * accordee) afin de prouver que le refus provient bien du module desactive.</p>
 */
class ModuleGuardInterceptorTest {

    private static final String API_PATH = "/api/comptes";
    private static final String METHOD = "GET";
    private static final long ENTREPRISE_ID = 5L;

    private PermissionInterceptor interceptor;
    private PermissionCheckService permissionCheckService;
    private EntrepriseModuleService entrepriseModuleService;
    private UserLogService userLogService;

    @BeforeEach
    void setUp() {
        interceptor = new PermissionInterceptor();
        permissionCheckService = mock(PermissionCheckService.class);
        entrepriseModuleService = mock(EntrepriseModuleService.class);
        userLogService = mock(UserLogService.class);
        ReflectionTestUtils.setField(interceptor, "permissionCheckService", permissionCheckService);
        ReflectionTestUtils.setField(interceptor, "entrepriseModuleService", entrepriseModuleService);
        ReflectionTestUtils.setField(interceptor, "userLogService", userLogService);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        TenantContext.clear();
    }

    private void authenticateAsCompanyUser() {
        UserDetails user = new User("company_admin", "x", List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities()));
    }

    @Test
    @DisplayName("Module desactive pour l'entreprise -> 403")
    void disabledModuleIsForbidden() throws Exception {
        authenticateAsCompanyUser();
        TenantContext.set(ENTREPRISE_ID);
        when(permissionCheckService.resolveModuleForApiPath(API_PATH, METHOD, null)).thenReturn("Comptes");
        when(permissionCheckService.hasPermissionForApiPath("company_admin", API_PATH, METHOD, null, null))
            .thenReturn(true);
        when(entrepriseModuleService.isModuleActive(ENTREPRISE_ID, "Comptes")).thenReturn(false);

        MockHttpServletRequest request = new MockHttpServletRequest(METHOD, API_PATH);
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertThat(allowed).isFalse();
        assertThat(response.getStatus()).isEqualTo(403);
    }

    @Test
    @DisplayName("Module actif -> la requete poursuit (permission accordee)")
    void enabledModulePasses() throws Exception {
        authenticateAsCompanyUser();
        TenantContext.set(ENTREPRISE_ID);
        when(permissionCheckService.resolveModuleForApiPath(API_PATH, METHOD, null)).thenReturn("Comptes");
        when(permissionCheckService.hasPermissionForApiPath("company_admin", API_PATH, METHOD, null, null))
            .thenReturn(true);
        when(entrepriseModuleService.isModuleActive(ENTREPRISE_ID, "Comptes")).thenReturn(true);

        MockHttpServletRequest request = new MockHttpServletRequest(METHOD, API_PATH);
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertThat(allowed).isTrue();
    }

    @Test
    @DisplayName("@RequiresModule prime sur le module resolu depuis le chemin")
    void declaredModuleTakesPrecedence() throws Exception {
        authenticateAsCompanyUser();
        TenantContext.set(ENTREPRISE_ID);
        // Le chemin n'est pas mappe, seul @RequiresModule declare "Réconciliation".
        when(permissionCheckService.resolveModuleForApiPath("/api/legacy", METHOD, null)).thenReturn(null);
        when(entrepriseModuleService.isModuleActive(ENTREPRISE_ID, "Réconciliation")).thenReturn(false);

        Method method = LegacyEndpoints.class.getMethod("legacy");
        HandlerMethod handler = new HandlerMethod(new LegacyEndpoints(), method);

        MockHttpServletRequest request = new MockHttpServletRequest(METHOD, "/api/legacy");
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, handler);

        assertThat(allowed).isFalse();
        assertThat(response.getStatus()).isEqualTo(403);
    }

    @Test
    @DisplayName("SUPER_ADMIN (sans contexte entreprise) n'est pas soumis au filtre module")
    void superAdminIsNotModuleFiltered() throws Exception {
        // Pas de TenantContext : le perimetre SUPER_ADMIN est gere ailleurs.
        MockHttpServletRequest request = new MockHttpServletRequest(METHOD, API_PATH);
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertThat(allowed).isTrue();
    }

    static class LegacyEndpoints {
        @RequiresModule("Réconciliation")
        public void legacy() {
            // endpoint de demonstration
        }
    }
}
