package com.reconciliation.service;

import com.reconciliation.entity.ActivationTokenEntity;
import com.reconciliation.entity.EntrepriseEntity;
import com.reconciliation.entity.EntrepriseStatut;
import com.reconciliation.repository.EntrepriseRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * Activation d'un compte entreprise a partir d'un lien a usage unique.
 *
 * <p>Le mot de passe est mis a jour en SQL natif : {@code UserEntity} n'est pas
 * annote {@code @TenantId}, mais charger puis enregistrer l'entite par JPA
 * declencherait le chargement EAGER du profil (annote {@code @TenantId}) dans un
 * contexte sans entreprise (endpoint public) et remettrait {@code profil_id} a
 * null. L'UPDATE natif evite ce piege.</p>
 */
@Service
public class AccountActivationService {

    private final ActivationTokenService activationTokenService;
    private final EntrepriseRepository entrepriseRepository;
    private final JdbcTemplate jdbcTemplate;
    private final PasswordEncoder passwordEncoder;

    public AccountActivationService(ActivationTokenService activationTokenService,
                                    EntrepriseRepository entrepriseRepository,
                                    JdbcTemplate jdbcTemplate,
                                    PasswordEncoder passwordEncoder) {
        this.activationTokenService = activationTokenService;
        this.entrepriseRepository = entrepriseRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.passwordEncoder = passwordEncoder;
    }

    /**
     * Consomme le jeton et definit le mot de passe du compte associe.
     *
     * <p>Resultat : {@code success = false} si le jeton est invalide, deja
     * utilise ou expire. Leve {@link IllegalStateException} si l'entreprise est
     * suspendue (l'appel HTTP renvoie alors 409).</p>
     */
    @Transactional
    public ActivationOutcome activate(String rawToken, String newPassword) {
        Optional<ActivationTokenEntity> tokenOpt = activationTokenService.consumeToken(rawToken);
        if (tokenOpt.isEmpty()) {
            return ActivationOutcome.invalid();
        }
        ActivationTokenEntity token = tokenOpt.get();

        EntrepriseEntity entreprise = entrepriseRepository.findById(token.getEntrepriseId()).orElse(null);
        if (entreprise == null || entreprise.getStatut() != EntrepriseStatut.ACTIVE) {
            // SecurityException -> HTTP 403 (gestionnaire global). Leve : la
            // transaction annule aussi la consommation du jeton.
            throw new SecurityException(
                "Entreprise suspendue. Contactez l'administrateur de la plateforme.");
        }

        int updated = jdbcTemplate.update(
            "UPDATE `user` SET `password` = ?, `password_change_required` = 0 "
                + "WHERE `username` = ? AND `entreprise_id` = ?",
            passwordEncoder.encode(newPassword), token.getUsername(), token.getEntrepriseId());

        return updated == 1 ? ActivationOutcome.ok() : ActivationOutcome.invalid();
    }

    /** Resultat d'une tentative d'activation. */
    public record ActivationOutcome(boolean success, String message) {
        static ActivationOutcome ok() {
            return new ActivationOutcome(true,
                "Compte active avec succes. Vous pouvez vous connecter.");
        }
        static ActivationOutcome invalid() {
            return new ActivationOutcome(false,
                "Lien d'activation invalide, deja utilise ou expire. Veuillez demander un nouveau lien.");
        }
    }
}
