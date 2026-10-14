package com.reconciliation.dto;

/**
 * Demande de creation d'une entreprise (tenant) par le SUPER_ADMIN.
 *
 * <p>Aucun mot de passe n'est fourni : le compte ADMIN est cree avec un mot de
 * passe aleatoire inutilisable et recoit un lien d'activation a usage unique
 * pour definir lui-meme le sien.</p>
 */
public class CreateEntrepriseRequest {

    /** Code technique unique de l'entreprise (ex. ACME). */
    private String code;

    /** Nom affiche de l'entreprise. */
    private String nom;

    /** Identifiant du compte administrateur de l'entreprise. */
    private String adminUsername;

    /** Adresse email du compte administrateur (destinataire du lien d'activation). */
    private String adminEmail;

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getNom() { return nom; }
    public void setNom(String nom) { this.nom = nom; }
    public String getAdminUsername() { return adminUsername; }
    public void setAdminUsername(String adminUsername) { this.adminUsername = adminUsername; }
    public String getAdminEmail() { return adminEmail; }
    public void setAdminEmail(String adminEmail) { this.adminEmail = adminEmail; }
}
