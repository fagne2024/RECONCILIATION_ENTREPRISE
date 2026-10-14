package com.reconciliation.dto;

import java.util.List;

/**
 * Reglages du bloc « Top des utilisateurs » (Configuration &gt; Top utilisateurs).
 *
 * <p>Vue simplifiee de {@link com.reconciliation.entity.TopUsersConfigEntity}
 * exposee par l'API : le champ technique {@code entrepriseId} n'est jamais
 * transmis (l'isolation est portee par le {@code @TenantId}).</p>
 *
 * <p>Les categories sont une liste libre et ordonnee : l'administrateur peut en
 * ajouter, en supprimer et modifier les libelles / criteres. Voir
 * {@link TopUsersCategoryDto}.</p>
 */
public record TopUsersConfigDto(
        boolean enabled,
        int topN,
        boolean showDelta,
        List<TopUsersCategoryDto> categories) {

    /** Valeurs par defaut appliquees lorsqu'aucune configuration n'a ete enregistree. */
    public static TopUsersConfigDto defaults() {
        return new TopUsersConfigDto(true, 3, true, defaultCategories());
    }

    /** Les trois categories historiques (Agents / Responsables / Validateurs). */
    public static List<TopUsersCategoryDto> defaultCategories() {
        return List.of(
                TopUsersCategoryDto.defaultAgents(),
                TopUsersCategoryDto.defaultResponsables(),
                TopUsersCategoryDto.defaultValidateurs()
        );
    }
}
