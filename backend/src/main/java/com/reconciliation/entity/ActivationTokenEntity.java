package com.reconciliation.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

/**
 * Jeton d'activation d'un compte entreprise (table GLOBALE).
 *
 * <p>Emis par le SUPER_ADMIN lorsqu'il cree une entreprise (ou renvoie le lien).
 * A usage unique et valable 72 h : il permet au nouvel administrateur de definir
 * lui-meme son mot de passe, sans qu'aucun mot de passe ne circule par email.</p>
 *
 * <p>Table volontairement independante de {@code password_reset_token} (mot de
 * passe oublie) : duree et finalite differentes.</p>
 */
@Entity
@Table(name = "activation_token")
public class ActivationTokenEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 64)
    private String token;

    @Column(nullable = false, length = 100)
    private String username;

    /** Entreprise du compte a activer (jamais null : pas d'activation plateforme). */
    @Column(name = "entreprise_id", nullable = false)
    private Long entrepriseId;

    @Column(nullable = false)
    private Boolean used = false;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public Long getEntrepriseId() { return entrepriseId; }
    public void setEntrepriseId(Long entrepriseId) { this.entrepriseId = entrepriseId; }
    public Boolean getUsed() { return used != null && used; }
    public void setUsed(Boolean used) { this.used = used != null ? used : false; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getExpiresAt() { return expiresAt; }
    public void setExpiresAt(LocalDateTime expiresAt) { this.expiresAt = expiresAt; }
}
