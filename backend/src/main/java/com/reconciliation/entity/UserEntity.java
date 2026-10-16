package com.reconciliation.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;

@Entity
@Table(name = "user")
public class UserEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String username;

    @JsonIgnore
    @Column(nullable = false)
    private String password;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "profil_id")
    private ProfilEntity profil;

    // Authentification à deux facteurs (2FA)
    @Column(name = "enabled_2fa", nullable = false)
    private Boolean enabled2FA = false;

    @JsonIgnore
    @Column(name = "secret_2fa", length = 32)
    private String secret2FA;

    @Column(name = "qr_code_scanned", nullable = false)
    private Boolean qrCodeScanned = false;

    @Column(name = "email", unique = true)
    private String email;

    @Column(name = "enabled", nullable = false)
    private Boolean enabled = true;

    // Photo de profil encodee en data URL (LONGTEXT). @JsonIgnore : la valeur
    // n'est jamais serialisee dans les reponses de masse (/me, liste des
    // utilisateurs) pour ne pas alourdir les charges utiles ; elle est exposee
    // uniquement via GET /api/users/me/photo.
    @JsonIgnore
    @Column(name = "photo", columnDefinition = "LONGTEXT")
    private String photo;

    // Colonne existante en base (NOT NULL). Mappee pour que les INSERT/UPDATE JPA
    // la renseignent explicitement (sinon "Field ... doesn't have a default value").
    @Column(name = "password_change_required", nullable = false)
    private Boolean passwordChangeRequired = false;

    @Column(name = "failed_login_attempts", nullable = false)
    private Integer failedLoginAttempts = 0;

    // Multi-entreprises (etape 2). `null` => compte plateforme SUPER_ADMIN
    // (aucun acces metier, decision 9). Les comptes entreprise sont rattaches a
    // une entreprise (historique = 1 tant que l'isolation @TenantId n'est pas en
    // place, etape 3). @JsonIgnore : la valeur ne doit JAMAIS pouvoir etre
    // fournie par le client (body/param) ni exposee dans les reponses.
    @Column(name = "entreprise_id")
    @JsonIgnore
    private Long entrepriseId = 1L;

    @Column(name = "account_locked_until")
    private java.time.LocalDateTime accountLockedUntil;

    // Derniere authentification reussie (login mot de passe ou validation 2FA).
    // `null` => le compte ne s'est jamais connecte. Exposee dans la liste des
    // utilisateurs pour l'ecran « Gestion des utilisateurs ».
    @Column(name = "last_login")
    private java.time.LocalDateTime lastLogin;

    // Getters et setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
    public ProfilEntity getProfil() { return profil; }
    public void setProfil(ProfilEntity profil) { this.profil = profil; }
    public Boolean getEnabled2FA() { return enabled2FA != null && enabled2FA; }
    public void setEnabled2FA(Boolean enabled2FA) { this.enabled2FA = enabled2FA != null ? enabled2FA : false; }
    public String getSecret2FA() { return secret2FA; }
    public void setSecret2FA(String secret2FA) { this.secret2FA = secret2FA; }
    public Boolean getQrCodeScanned() { return qrCodeScanned != null && qrCodeScanned; }
    public void setQrCodeScanned(Boolean qrCodeScanned) { this.qrCodeScanned = qrCodeScanned != null ? qrCodeScanned : false; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPhoto() { return photo; }
    public void setPhoto(String photo) { this.photo = photo; }
    public Boolean getEnabled() { return enabled == null || enabled; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled != null ? enabled : true; }
    public Boolean getPasswordChangeRequired() { return passwordChangeRequired != null && passwordChangeRequired; }
    public void setPasswordChangeRequired(Boolean passwordChangeRequired) { this.passwordChangeRequired = passwordChangeRequired != null ? passwordChangeRequired : false; }
    public Integer getFailedLoginAttempts() { return failedLoginAttempts != null ? failedLoginAttempts : 0; }
    public void setFailedLoginAttempts(Integer failedLoginAttempts) { this.failedLoginAttempts = failedLoginAttempts != null ? failedLoginAttempts : 0; }
    public java.time.LocalDateTime getAccountLockedUntil() { return accountLockedUntil; }
    public void setAccountLockedUntil(java.time.LocalDateTime accountLockedUntil) { this.accountLockedUntil = accountLockedUntil; }
    public java.time.LocalDateTime getLastLogin() { return lastLogin; }
    public void setLastLogin(java.time.LocalDateTime lastLogin) { this.lastLogin = lastLogin; }
    public Long getEntrepriseId() { return entrepriseId; }
    public void setEntrepriseId(Long entrepriseId) { this.entrepriseId = entrepriseId; }
} 