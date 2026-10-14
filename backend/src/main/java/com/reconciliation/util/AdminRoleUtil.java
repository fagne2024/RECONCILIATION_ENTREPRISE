package com.reconciliation.util;

import com.reconciliation.entity.ProfilEntity;
import com.reconciliation.entity.UserEntity;

/**
 * Détermine si un utilisateur est administrateur (rôle ROLE_ADMIN).
 * Source unique pour éviter d'éparpiller la règle (username "admin" ou profil
 * de nom ADMIN/ADMINISTRATEUR) entre le filtre JWT, les token claims et les ACL.
 */
public final class AdminRoleUtil {

    private AdminRoleUtil() {
        // classe utilitaire statique
    }

    public static boolean isAdminName(String username) {
        return username != null && "admin".equalsIgnoreCase(username.trim());
    }

    public static boolean isAdminProfilName(ProfilEntity profil) {
        if (profil == null || profil.getNom() == null) {
            return false;
        }
        String nom = profil.getNom().toUpperCase();
        return "ADMIN".equals(nom) || "ADMINISTRATEUR".equals(nom);
    }

    public static boolean isAdminUser(UserEntity user) {
        return user != null && (isAdminName(user.getUsername()) || isAdminProfilName(user.getProfil()));
    }

    /**
     * Un compte plateforme SUPER_ADMIN n'est rattache a aucune entreprise
     * (`entreprise_id = null`) : il n'a aucun acces aux donnees metier (decision 9).
     */
    public static boolean isSuperAdmin(UserEntity user) {
        return user != null && user.getEntrepriseId() == null;
    }

    /**
     * Role unique et prioritaire d'un utilisateur : SUPER_ADMIN > ADMIN > USER.
     */
    public static String resolveRole(UserEntity user) {
        if (isSuperAdmin(user)) {
            return "SUPER_ADMIN";
        }
        return isAdminUser(user) ? "ADMIN" : "USER";
    }
}