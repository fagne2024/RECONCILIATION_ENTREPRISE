package com.reconciliation.service;

import com.reconciliation.config.NavigationSubmenuRegistry;
import com.reconciliation.entity.EntrepriseModuleEntity;
import com.reconciliation.entity.ModuleEntity;
import com.reconciliation.repository.EntrepriseModuleRepository;
import com.reconciliation.repository.ModuleRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Activation des modules PAR entreprise (table {@code entreprise_module}).
 *
 * <p>Le catalogue {@code module} est global ; c'est {@code entreprise_module}
 * (cle {@code (entreprise_id, module_id)}) qui porte l'activation. Un module
 * inactif pour l'entreprise de l'utilisateur connecte entraine un
 * <strong>403 backend</strong> (voir {@code PermissionInterceptor}).</p>
 *
 * <p>Granularite : un sous-menu (ex. {@code Résultats · Contrôle interne BO vs
 * Partenaire}) herite de l'activation de son module parent ({@code Résultats}).
 * Un module inconnu du catalogue n'est jamais bloquant (rien a activer).</p>
 *
 * <p>L'identifiant de module retenu est le {@code module.nom} existant (decision
 * etape 5) : une seule source de verite, aucune colonne {@code code} ajoutee.</p>
 */
@Service
public class EntrepriseModuleService {

    private static final Logger log = LoggerFactory.getLogger(EntrepriseModuleService.class);

    private final ModuleRepository moduleRepository;
    private final EntrepriseModuleRepository entrepriseModuleRepository;
    private final PlatformAuditService platformAuditService;

    public EntrepriseModuleService(ModuleRepository moduleRepository,
                                   EntrepriseModuleRepository entrepriseModuleRepository,
                                   PlatformAuditService platformAuditService) {
        this.moduleRepository = moduleRepository;
        this.entrepriseModuleRepository = entrepriseModuleRepository;
        this.platformAuditService = platformAuditService;
    }

    // ------------------------------------------------------------------
    // Lecture / verification
    // ------------------------------------------------------------------

    /** Identifiants des modules actifs pour l'entreprise. */
    @Transactional(readOnly = true)
    public Set<Long> activeModuleIds(Long entrepriseId) {
        if (entrepriseId == null) {
            return Set.of();
        }
        return entrepriseModuleRepository.findByEntrepriseIdAndActifTrue(entrepriseId).stream()
            .map(EntrepriseModuleEntity::getModuleId)
            .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    /**
     * Vrai si le module designe par son nom est actif pour l'entreprise.
     *
     * <ul>
     *   <li>module inconnu du catalogue -&gt; {@code true} (rien a activer) ;</li>
     *   <li>sous-menu inactif -&gt; herite du module parent ;</li>
     *   <li>sinon -&gt; presence d'une ligne active dans {@code entreprise_module}.</li>
     * </ul>
     */
    @Transactional(readOnly = true)
    public boolean isModuleActive(Long entrepriseId, String moduleName) {
        if (entrepriseId == null || moduleName == null || moduleName.isBlank()) {
            return true;
        }
        ModuleEntity module = findModuleByName(moduleName);
        if (module == null) {
            return true;
        }
        Set<Long> active = activeModuleIds(entrepriseId);
        if (active.contains(module.getId())) {
            return true;
        }
        Optional<NavigationSubmenuRegistry.SubmenuAccessDefinition> submenu =
            NavigationSubmenuRegistry.findByAccessModuleName(moduleName);
        if (submenu.isPresent()) {
            ModuleEntity parent = findModuleByName(submenu.get().parentModuleName());
            return parent != null && active.contains(parent.getId());
        }
        return false;
    }

    /** Catalogue global trie par identifiant. */
    @Transactional(readOnly = true)
    public List<ModuleEntity> catalogue() {
        return moduleRepository.findAll().stream()
            .sorted(Comparator.comparing(ModuleEntity::getId))
            .toList();
    }

    /** Etat d'activation de chaque module pour une entreprise (pour l'ecran plateforme). */
    @Transactional(readOnly = true)
    public List<ModuleActivationRow> modulesForEntreprise(Long entrepriseId) {
        if (entrepriseId == null) {
            return List.of();
        }
        Set<Long> active = activeModuleIds(entrepriseId);
        return catalogue().stream()
            .map(module -> new ModuleActivationRow(
                module.getId(),
                module.getNom(),
                parentOf(module.getNom()),
                Boolean.TRUE.equals(module.getVisible()),
                active.contains(module.getId())))
            .toList();
    }

    /** Nom du module parent si {@code moduleName} est un sous-menu, sinon {@code null}. */
    public String parentOf(String moduleName) {
        return NavigationSubmenuRegistry.findByAccessModuleName(moduleName)
            .map(NavigationSubmenuRegistry.SubmenuAccessDefinition::parentModuleName)
            .orElse(null);
    }

    // ------------------------------------------------------------------
    // Mise a jour (SUPER_ADMIN)
    // ------------------------------------------------------------------

    /**
     * Remplace l'ensemble des modules actifs de l'entreprise (idempotent).
     *
     * <p>Les lignes ne sont jamais supprimees : un module retire passe a
     * {@code actif=false}. Cela preserve l'historique et evite toute
     * reactivation automatique. Les identifiants inconnus sont ignores.</p>
     */
    @Transactional
    public ModuleUpdateResult setActiveModules(Long entrepriseId,
                                               Collection<Long> activeModuleIds,
                                               String actorUsername) {
        if (entrepriseId == null) {
            throw new IllegalArgumentException("L'identifiant de l'entreprise est requis.");
        }

        Set<Long> desired = activeModuleIds == null
            ? new LinkedHashSet<>()
            : activeModuleIds.stream().filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));

        List<ModuleEntity> allModules = catalogue();
        Set<Long> knownIds = allModules.stream().map(ModuleEntity::getId).collect(Collectors.toSet());
        desired.retainAll(knownIds);

        Map<Long, EntrepriseModuleEntity> existing =
            entrepriseModuleRepository.findByEntrepriseId(entrepriseId).stream()
                .collect(Collectors.toMap(EntrepriseModuleEntity::getModuleId,
                    Function.identity(), (a, b) -> a));

        List<EntrepriseModuleEntity> toSave = new ArrayList<>();
        int activated = 0;
        int deactivated = 0;

        for (ModuleEntity module : allModules) {
            boolean shouldBeActive = desired.contains(module.getId());
            EntrepriseModuleEntity row = existing.get(module.getId());
            if (row == null) {
                if (shouldBeActive) {
                    row = new EntrepriseModuleEntity();
                    row.setEntrepriseId(entrepriseId);
                    row.setModuleId(module.getId());
                    row.setActif(Boolean.TRUE);
                    toSave.add(row);
                    activated++;
                }
            } else {
                boolean currently = Boolean.TRUE.equals(row.getActif());
                if (currently != shouldBeActive) {
                    row.setActif(shouldBeActive);
                    toSave.add(row);
                    if (shouldBeActive) {
                        activated++;
                    } else {
                        deactivated++;
                    }
                }
            }
        }

        if (!toSave.isEmpty()) {
            entrepriseModuleRepository.saveAll(toSave);
        }

        platformAuditService.record(actorUsername, "ENTREPRISE_MODULES_MODIFIES", "ENTREPRISE",
            String.valueOf(entrepriseId),
            "actifs=" + desired.size() + "; activees=" + activated + "; desactivees=" + deactivated);

        log.info("Modules de l'entreprise {} mis a jour par '{}' : {} actif(s) ({} active, {} desactive).",
            entrepriseId, actorUsername, desired.size(), activated, deactivated);

        return new ModuleUpdateResult(entrepriseId, desired.size(), activated, deactivated);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private ModuleEntity findModuleByName(String moduleName) {
        if (moduleName == null || moduleName.isBlank()) {
            return null;
        }
        String trimmed = moduleName.trim();
        ModuleEntity module = moduleRepository.findByNomIgnoreCase(trimmed);
        return module != null ? module : moduleRepository.findByNom(trimmed);
    }

    // ------------------------------------------------------------------
    // Resultats
    // ------------------------------------------------------------------

    /** Ligne d'etat d'activation d'un module pour une entreprise. */
    public record ModuleActivationRow(Long moduleId, String nom, String parent,
                                      boolean visible, boolean actif) {
    }

    /** Resultat d'une mise a jour d'activation de modules. */
    public record ModuleUpdateResult(Long entrepriseId, int modulesActifs, int activees, int desactivees) {
    }
}
