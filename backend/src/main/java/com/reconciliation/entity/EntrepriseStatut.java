package com.reconciliation.entity;

/**
 * Statut d'une entreprise (tenant).
 * <ul>
 *   <li>ACTIVE   : acces autorise (sujet aux droits du profil/modules)</li>
 *   <li>SUSPENDUE: acces refuse pour tous les comptes de l'entreprise
 *       (forcement cote backend, pas seulement un masquage frontend)</li>
 *   <li>ARCHIVEE : suppression logique - acces refuse (comme SUSPENDUE),
 *       entreprise masquee de la liste courante mais conservatrice (donnees
 *       intactes, restaurable en ACTIVE).</li>
 * </ul>
 */
public enum EntrepriseStatut {
    ACTIVE,
    SUSPENDUE,
    ARCHIVEE
}