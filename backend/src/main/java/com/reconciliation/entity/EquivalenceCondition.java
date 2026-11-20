package com.reconciliation.entity;

import java.util.List;

/**
 * Condition de choix d'un équivalent (Configuration &gt; Normalisation modèle) :
 * quand la colonne {@code column} du fichier vaut une des {@code values} (casse et
 * espaces ignorés), la colonne par défaut reçoit la valeur de l'équivalent {@code source}.
 */
public record EquivalenceCondition(String column, List<String> values, String source) {}
