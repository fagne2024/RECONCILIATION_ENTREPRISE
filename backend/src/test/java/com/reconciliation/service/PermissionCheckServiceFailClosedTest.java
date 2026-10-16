package com.reconciliation.service;

import com.reconciliation.entity.UserEntity;
import com.reconciliation.repository.ModuleRepository;
import com.reconciliation.repository.PermissionRepository;
import com.reconciliation.repository.ProfilPermissionRepository;
import com.reconciliation.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PermissionCheckServiceFailClosedTest {

    @Mock
    private ProfilPermissionRepository profilPermissionRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private ModuleRepository moduleRepository;
    @Mock
    private PermissionRepository permissionRepository;
    @Mock
    private PermissionGeneratorService permissionGeneratorService;

    @InjectMocks
    private PermissionCheckService permissionCheckService;

    @Test
    void unmappedApiPathIsDenied() {
        when(userRepository.findByUsername("bob")).thenReturn(Optional.empty());
        assertThat(permissionCheckService.hasPermissionForApiPath("bob", "/api/unknown-xyz", "GET"))
            .isFalse();
    }

    @Test
    void adminUsernameWithoutAdminProfilIsNotABypass() {
        UserEntity user = new UserEntity();
        user.setUsername("admin");
        when(userRepository.findByUsername("admin")).thenReturn(Optional.of(user));
        assertThat(permissionCheckService.hasPermissionForApiPath("admin", "/api/unknown-xyz", "GET"))
            .isFalse();
    }

    @Test
    void writePermissionOverrideFromClientIsIgnored() {
        when(userRepository.findByUsername("bob")).thenReturn(Optional.empty());
        assertThat(permissionCheckService.hasPermissionForApiPath(
            "bob", "/api/unknown-xyz", "POST", "Dashboard", "consulter"))
            .isFalse();
    }
}
