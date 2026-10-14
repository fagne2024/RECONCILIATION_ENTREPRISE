package com.reconciliation.security;

import com.reconciliation.entity.ProfilEntity;
import com.reconciliation.entity.UserEntity;
import com.reconciliation.util.AdminRoleUtil;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AdminRoleUtilTest {

    private UserEntity user(String username, String profilNom) {
        UserEntity user = new UserEntity();
        user.setUsername(username);
        if (profilNom != null) {
            ProfilEntity profil = new ProfilEntity();
            profil.setNom(profilNom);
            user.setProfil(profil);
        }
        return user;
    }

    @Test
    @DisplayName("Le username admin est administrateur")
    void adminUsername() {
        assertThat(AdminRoleUtil.isAdminUser(user("admin", null))).isTrue();
        assertThat(AdminRoleUtil.isAdminUser(user("Admin", null))).isTrue();
    }

    @Test
    @DisplayName("Un profil ADMIN/ADMINISTRATEUR est administrateur")
    void adminProfile() {
        assertThat(AdminRoleUtil.isAdminUser(user("jdoe", "ADMIN"))).isTrue();
        assertThat(AdminRoleUtil.isAdminUser(user("jdoe", "Administrateur"))).isTrue();
    }

    @Test
    @DisplayName("Un utilisateur standard n'est pas administrateur")
    void standardUser() {
        assertThat(AdminRoleUtil.isAdminUser(user("jdoe", "OPERATEUR"))).isFalse();
        assertThat(AdminRoleUtil.isAdminUser(user("jdoe", null))).isFalse();
    }
}