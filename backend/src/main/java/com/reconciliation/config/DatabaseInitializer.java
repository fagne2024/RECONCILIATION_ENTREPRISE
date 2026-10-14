package com.reconciliation.config;

import com.reconciliation.entity.UserEntity;
import com.reconciliation.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;

/**
 * Crée un utilisateur admin de secours UNIQUEMENT en profil dev.
 * En production (aucun profil "dev" actif), la base ne doit contenir que
 * des comptes créés et administrés explicitement.
 */
@Component
@Profile("dev")
public class DatabaseInitializer implements CommandLineRunner {

    private static final String PASS_CHARS =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";

    @Autowired
    private UserRepository userRepository;

    @Override
    public void run(String... args) throws Exception {
        // Vérifier s'il existe déjà des utilisateurs
        if (userRepository.count() == 0) {
            System.out.println("=== Initialisation de la base de données (profil dev) ===");

            UserEntity adminUser = new UserEntity();
            adminUser.setUsername("admin");
            adminUser.setPassword(generatePassword());
            userRepository.save(adminUser);

            System.out.println("✅ Utilisateur admin créé en dev (mot de passe aléatoire, à retrouver en base).");
            System.out.println("=== Initialisation terminée ===");
        } else {
            System.out.println("=== Base de données déjà initialisée ===");
            System.out.println("Nombre d'utilisateurs existants: " + userRepository.count());
        }
    }

    private String generatePassword() {
        SecureRandom random = new SecureRandom();
        StringBuilder password = new StringBuilder(16);
        for (int i = 0; i < 16; i++) {
            password.append(PASS_CHARS.charAt(random.nextInt(PASS_CHARS.length())));
        }
        return password.toString();
    }
} 