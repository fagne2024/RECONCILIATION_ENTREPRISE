package com.reconciliation.config;

import com.reconciliation.entity.EntrepriseEntity;
import com.reconciliation.entity.EntrepriseModuleEntity;
import com.reconciliation.entity.ModuleEntity;
import com.reconciliation.repository.EntrepriseModuleRepository;
import com.reconciliation.repository.EntrepriseRepository;
import com.reconciliation.repository.ModuleRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Complete le catalogue global {@code module} avec les modules declares par la
 * navigation (modules parents d'app-navigation-catalog.ts et sous-menus de
 * {@link NavigationSubmenuRegistry}), afin que l'ecran plateforme les liste tous.
 *
 * <p>Idempotent : un module deja present n'est jamais modifie. Un module absent
 * du catalogue est considere comme actif par {@code EntrepriseModuleService} ;
 * chaque module ajoute est donc active pour les entreprises existantes afin de ne
 * retirer aucun acces.</p>
 */
@Component
@Order(60)
public class ModuleCatalogInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ModuleCatalogInitializer.class);

    /** Noms de modules utilises par app-navigation-catalog.ts (hors routes SUPER_ADMIN). */
    private static final List<String> NAVIGATION_MODULES = List.of(
        "Dashboard",
        "Traitement",
        "Réconciliation",
        "Résultats",
        "Statistiques",
        "Classements",
        "Comptes",
        "Opérations",
        "Frais",
        "Commission",
        "Charge",
        "TSOP",
        "Impact OP",
        "OPPART",
        "TRX SF",
        "BANQUE",
        "Comptabilité",
        "AIDE",
        "Utilisateur",
        "Profil",
        "Module",
        "Permission",
        "Log utilisateur",
        "Sécurité",
        "Configuration",
        "Modèles",
        "NiveauValidationReco"
    );

    private final ModuleRepository moduleRepository;
    private final EntrepriseRepository entrepriseRepository;
    private final EntrepriseModuleRepository entrepriseModuleRepository;

    public ModuleCatalogInitializer(ModuleRepository moduleRepository,
                                    EntrepriseRepository entrepriseRepository,
                                    EntrepriseModuleRepository entrepriseModuleRepository) {
        this.moduleRepository = moduleRepository;
        this.entrepriseRepository = entrepriseRepository;
        this.entrepriseModuleRepository = entrepriseModuleRepository;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            Set<String> expected = new LinkedHashSet<>(NAVIGATION_MODULES);
            NavigationSubmenuRegistry.allDefinitions().forEach(def -> {
                expected.add(def.parentModuleName());
                expected.add(def.accessModuleName());
            });

            List<ModuleEntity> created = new ArrayList<>();
            for (String nom : expected) {
                if (moduleRepository.findByNomIgnoreCase(nom) != null) {
                    continue;
                }
                ModuleEntity module = new ModuleEntity();
                module.setNom(nom);
                module.setVisible(Boolean.TRUE);
                created.add(moduleRepository.save(module));
            }

            if (created.isEmpty()) {
                return;
            }

            List<EntrepriseEntity> entreprises = entrepriseRepository.findAll();
            List<EntrepriseModuleEntity> activations = new ArrayList<>();
            for (EntrepriseEntity entreprise : entreprises) {
                for (ModuleEntity module : created) {
                    EntrepriseModuleEntity row = new EntrepriseModuleEntity();
                    row.setEntrepriseId(entreprise.getId());
                    row.setModuleId(module.getId());
                    row.setActif(Boolean.TRUE);
                    activations.add(row);
                }
            }
            entrepriseModuleRepository.saveAll(activations);

            log.info("Catalogue modules complete : {} module(s) ajoute(s), actives pour {} entreprise(s).",
                created.size(), entreprises.size());
        } catch (Exception e) {
            log.error("Echec de la completion du catalogue modules : {}", e.getMessage());
        }
    }
}
