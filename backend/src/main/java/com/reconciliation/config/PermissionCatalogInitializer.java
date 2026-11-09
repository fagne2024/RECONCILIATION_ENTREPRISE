package com.reconciliation.config;

import com.reconciliation.service.PermissionGeneratorService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Complete au demarrage le catalogue global des permissions ({@code permission}
 * et {@code module_permission}) a partir des controllers, apres
 * {@link ModuleCatalogInitializer}.
 *
 * <p>Sans ce catalogue, l'ecran "Gerer les droits" ({@code /profils/:id}) n'affiche
 * aucune permission tant que personne n'a clique sur "Generer les permissions".
 * La generation est idempotente (une association existante n'est jamais recreee)
 * et ne touche que des tables globales sans tenant.</p>
 */
@Component
@Order(70)
public class PermissionCatalogInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PermissionCatalogInitializer.class);

    private final PermissionGeneratorService permissionGeneratorService;

    public PermissionCatalogInitializer(PermissionGeneratorService permissionGeneratorService) {
        this.permissionGeneratorService = permissionGeneratorService;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            Map<String, Object> result = permissionGeneratorService.generatePermissionsForAllModules();
            log.info("Catalogue des permissions synchronise : {} association(s) creee(s)", result.get("totalCreated"));
        } catch (Exception e) {
            // Ne pas bloquer le demarrage : la generation reste disponible depuis /permissions.
            log.error("Echec de la synchronisation du catalogue des permissions au demarrage", e);
        }
    }
}
