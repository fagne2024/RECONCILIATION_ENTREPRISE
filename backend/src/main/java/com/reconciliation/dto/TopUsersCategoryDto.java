package com.reconciliation.dto;

import java.util.List;

/**
 * Definition d'une categorie (colonne) du bloc « Top des utilisateurs »
 * (Configuration &gt; Top utilisateurs).
 *
 * <p>Une categorie selectionne les actions d'audit qui lui correspondent par
 * deux criteres combinables :</p>
 * <ul>
 *   <li>{@code events} : types d'action d'audit (ex. {@code CREATION},
 *       {@code CHANGEMENT_TRAITEMENT}, {@code VALIDATION_TERMINE}) ;</li>
 *   <li>{@code levels} : niveaux de traitement (support, group, cdo, termine).</li>
 * </ul>
 * <p>Une liste vide signifie « aucun filtre » sur ce critere. Une action est
 * comptee pour la categorie si son type figure dans {@code events} ET si son
 * niveau figure dans {@code levels}. La classification finale est appliquee
 * cote frontend a partir de {@code actionType} et {@code traitementSnapshot}.</p>
 *
 * <p>{@code id} est un identifiant stable (slug) unique dans la configuration.
 * Les identifiants {@code agents}, {@code responsables} et {@code validateurs}
 * sont reserves aux categories par defaut : lorsque {@code title} (resp.
 * {@code actionLabel}) est vide, le frontend reprend la traduction par defaut.</p>
 */
public record TopUsersCategoryDto(
        String id,
        String title,
        String actionLabel,
        List<String> events,
        List<String> levels,
        boolean enabled) {

    /** Categorie « Agents » par defaut : creations de niveau support ou CDO. */
    public static TopUsersCategoryDto defaultAgents() {
        return new TopUsersCategoryDto("agents", null, null,
                List.of("CREATION"), List.of("support", "cdo"), true);
    }

    /** Categorie « Responsables » par defaut : changements de traitement de niveau GROUP. */
    public static TopUsersCategoryDto defaultResponsables() {
        return new TopUsersCategoryDto("responsables", null, null,
                List.of("CHANGEMENT_TRAITEMENT"), List.of("group"), true);
    }

    /** Categorie « Validateurs » par defaut : validations terminees. */
    public static TopUsersCategoryDto defaultValidateurs() {
        return new TopUsersCategoryDto("validateurs", null, null,
                List.of("VALIDATION_TERMINE"), List.of("termine"), true);
    }
}
