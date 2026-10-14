package com.reconciliation.tenant;

import java.util.function.Supplier;

/**
 * Contexte multi-entreprise du thread courant.
 *
 * <p>L'identifiant d'entreprise est porte par un {@link ThreadLocal}. Il est
 * alimente par {@code JwtAuthenticationFilter} a partir du claim JWT
 * {@code entrepriseId} verifie, puis lu par Hibernate via
 * {@link TenantIdentifierResolver} pour filtrer automatiquement les entites
 * annotees {@code @TenantId}.</p>
 *
 * <p>Le contexte est explicitement propage aux traitements hors requete HTTP
 * (taches planifiees, taches asynchrones) via {@link #callAs(Long, Supplier)} et
 * {@link #runAs(Long, Runnable)} : un {@code ThreadLocal} n'est jamais transmis
 * d'un thread a l'autre.</p>
 *
 * <p>En l'absence de valeur, {@link #get()} renvoie {@code null} : le filtre
 * HTTP et le {@code PermissionInterceptor} refusent alors (fail-closed) tout
 * acces aux donnees metier.</p>
 */
public final class TenantContext {

    private static final ThreadLocal<Long> CURRENT_ENTREPRISE = new ThreadLocal<>();

    /**
     * Sentinel renvoye au resolveur Hibernate lorsqu'aucune entreprise n'est
     * definie. Hibernate exige un tenant non nul des l'ouverture d'une session ;
     * cette valeur ne correspond a aucune entreprise, donc les lectures sont
     * vides et les insertions echouent sur la cle etrangere (fail-closed).
     */
    public static final Long NO_TENANT = -1L;

    /**
     * Identifiant de l'entreprise historique (creee par la migration V2).
     * Utilise pour les traitements techniques hors requete (initialisation au
     * demarrage) qui operent sur les donnees de cette entreprise.
     */
    public static final long HISTORIQUE_ENTREPRISE_ID = 1L;

    private TenantContext() {
    }

    /** Definit l'entreprise courante du thread. */
    public static void set(Long entrepriseId) {
        CURRENT_ENTREPRISE.set(entrepriseId);
    }

    /** Entreprise courante, ou {@code null} si aucune n'est definie. */
    public static Long get() {
        return CURRENT_ENTREPRISE.get();
    }

    /** Vrai si une entreprise est definie pour le thread courant. */
    public static boolean isSet() {
        return CURRENT_ENTREPRISE.get() != null;
    }

    /** Efface le contexte (obligatoire en fin de requete / de tache). */
    public static void clear() {
        CURRENT_ENTREPRISE.remove();
    }

    /**
     * Execute une action en forcant une entreprise, puis restaure le contexte
     * precedent. Utilise pour propager le tenant aux threads de travail et aux
     * taches planifiees, et pour les traitements techniques (demarrage).
     */
    public static void runAs(Long entrepriseId, Runnable action) {
        Long previous = CURRENT_ENTREPRISE.get();
        try {
            CURRENT_ENTREPRISE.set(entrepriseId);
            action.run();
        } finally {
            restore(previous);
        }
    }

    /**
     * Variante de {@link #runAs(Long, Runnable)} retournant une valeur.
     */
    public static <T> T callAs(Long entrepriseId, Supplier<T> action) {
        Long previous = CURRENT_ENTREPRISE.get();
        try {
            CURRENT_ENTREPRISE.set(entrepriseId);
            return action.get();
        } finally {
            restore(previous);
        }
    }

    private static void restore(Long previous) {
        if (previous == null) {
            CURRENT_ENTREPRISE.remove();
        } else {
            CURRENT_ENTREPRISE.set(previous);
        }
    }
}
