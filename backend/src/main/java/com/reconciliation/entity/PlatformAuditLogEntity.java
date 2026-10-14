package com.reconciliation.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

/**
 * Journal des actions du SUPER_ADMIN (table GLOBALE).
 *
 * <p>Trace les operations de plateforme (creation/suspension/reactivation/
 * renommage d'entreprise, renvoi d'un lien d'activation). Ne contient JAMAIS de
 * secret : ni mot de passe, ni jeton d'activation.</p>
 */
@Entity
@Table(name = "platform_audit_log")
public class PlatformAuditLogEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Nom du compte SUPER_ADMIN a l'origine de l'action. */
    @Column(name = "actor_username", nullable = false, length = 100)
    private String actorUsername;

    /** Code de l'action (ex. ENTREPRISE_CREEE). */
    @Column(nullable = false, length = 64)
    private String action;

    /** Type de la cible (ex. ENTREPRISE). */
    @Column(name = "target_type", nullable = false, length = 64)
    private String targetType;

    /** Identifiant de la cible (ex. identifiant d'entreprise), optionnel. */
    @Column(name = "target_id", length = 64)
    private String targetId;

    /** Details non sensibles (jamais de mot de passe ni de jeton). */
    @Column(length = 1000)
    private String details;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getActorUsername() { return actorUsername; }
    public void setActorUsername(String actorUsername) { this.actorUsername = actorUsername; }
    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }
    public String getTargetType() { return targetType; }
    public void setTargetType(String targetType) { this.targetType = targetType; }
    public String getTargetId() { return targetId; }
    public void setTargetId(String targetId) { this.targetId = targetId; }
    public String getDetails() { return details; }
    public void setDetails(String details) { this.details = details; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
