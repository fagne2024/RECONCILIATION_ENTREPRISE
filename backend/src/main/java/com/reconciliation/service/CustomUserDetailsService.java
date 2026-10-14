package com.reconciliation.service;

import com.reconciliation.entity.UserEntity;
import com.reconciliation.repository.UserRepository;
import com.reconciliation.util.AdminRoleUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;

/**
 * Service pour charger les détails de l'utilisateur pour Spring Security
 * Implémente UserDetailsService pour intégration avec Spring Security
 */
@Service
public class CustomUserDetailsService implements UserDetailsService {

    @Autowired
    private UserRepository userRepository;

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        UserEntity user = userRepository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("Utilisateur non trouvé: " + username));

        // Rôle SUPER_ADMIN pour les comptes plateforme (entreprise_id = null),
        // sinon ADMIN (username "admin" ou profil ADMIN/ADMINISTRATEUR), sinon USER.
        ArrayList<String> authorities = new ArrayList<>();
        if (AdminRoleUtil.isSuperAdmin(user)) {
            authorities.add("ROLE_SUPER_ADMIN");
        } else if (AdminRoleUtil.isAdminUser(user)) {
            authorities.add("ROLE_ADMIN");
        } else {
            authorities.add("ROLE_USER");
        }

        return User.builder()
                .username(user.getUsername())
                .password(user.getPassword())
                .disabled(!user.getEnabled())
                .authorities(authorities.toArray(new String[0]))
                .build();
    }
}

