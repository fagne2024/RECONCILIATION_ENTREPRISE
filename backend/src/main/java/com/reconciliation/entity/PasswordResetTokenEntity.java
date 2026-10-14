package com.reconciliation.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

/**
 * Jeton de réinitialisation de mot de passe (oublier le mot de passe).
 * Usage unique, expiration courte (15 min).
 */
@Entity
@Table(name = "password_reset_token")
public class PasswordResetTokenEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 64)
    private String token;

    @Column(nullable = false, length = 100)
    private String username;

    @Column(nullable = false)
    private Boolean used = false;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public Boolean getUsed() { return used != null && used; }
    public void setUsed(Boolean used) { this.used = used != null ? used : false; }
    public LocalDateTime getExpiresAt() { return expiresAt; }
    public void setExpiresAt(LocalDateTime expiresAt) { this.expiresAt = expiresAt; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}