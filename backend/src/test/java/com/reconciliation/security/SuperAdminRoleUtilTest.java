package com.reconciliation.security;

import com.reconciliation.entity.UserEntity;
import com.reconciliation.util.AdminRoleUtil;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Etape 2 : le SUPER_ADMIN est identifie par l'absence d'entreprise
 * ({@code entreprise_id = null}). Le role est unique et prioritaire.
 */
class SuperAdminRoleUtilTest {

    private UserEntity user(String username, Long entrepriseId) {
        UserEntity user = new UserEntity();
        user.setUsername(username);
        user.setEntrepriseId(entrepriseId);
        return user;
    }

    @Test
    @DisplayName("Un compte sans entreprise est SUPER_ADMIN")
    void nullEntrepriseIsSuperAdmin() {
        UserEntity superAdmin = user("superadmin", null);
        assertThat(AdminRoleUtil.isSuperAdmin(superAdmin)).isTrue();
        assertThat(AdminRoleUtil.resolveRole(superAdmin)).isEqualTo("SUPER_ADMIN");
    }

    @Test
    @DisplayName("Un compte rattache a une entreprise n'est pas SUPER_ADMIN")
    void entrepriseIsNotSuperAdmin() {
        UserEntity admin = user("admin", 1L);
        assertThat(AdminRoleUtil.isSuperAdmin(admin)).isFalse();
        assertThat(AdminRoleUtil.resolveRole(admin)).isEqualTo("ADMIN");

        UserEntity simple = user("jdupont", 1L);
        assertThat(AdminRoleUtil.resolveRole(simple)).isEqualTo("USER");
    }

    @Test
    @DisplayName("Le role SUPER_ADMIN est prioritaire meme si le profil ressemble a ADMIN")
    void superAdminTakesPrecedence() {
        UserEntity conflicting = user("admin", null);
        assertThat(AdminRoleUtil.resolveRole(conflicting)).isEqualTo("SUPER_ADMIN");
    }
}
