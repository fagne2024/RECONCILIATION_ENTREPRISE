package com.reconciliation.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "releve_manual")
public class ReleveManualEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    @Column(name = "releve_date", nullable = false)
    private LocalDate date;

    @Column(name = "service", nullable = false, length = 255)
    private String service;

    @Column(name = "country", nullable = false, length = 50)
    private String country;

    @Column(name = "env", length = 50)
    private String env;

    @Column(name = "manual_nombre")
    private Long manualNombre;

    @Column(name = "manual_volume")
    private Double manualVolume;

    @Column(name = "rembourse_nombre")
    private Long rembourseNombre;

    @Column(name = "rembourse_volume")
    private Double rembourseVolume;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public LocalDate getDate() {
        return date;
    }

    public void setDate(LocalDate date) {
        this.date = date;
    }

    public String getService() {
        return service;
    }

    public void setService(String service) {
        this.service = service;
    }

    public String getCountry() {
        return country;
    }

    public void setCountry(String country) {
        this.country = country;
    }

    public String getEnv() {
        return env;
    }

    public void setEnv(String env) {
        this.env = env;
    }

    public Long getManualNombre() {
        return manualNombre;
    }

    public void setManualNombre(Long manualNombre) {
        this.manualNombre = manualNombre;
    }

    public Double getManualVolume() {
        return manualVolume;
    }

    public void setManualVolume(Double manualVolume) {
        this.manualVolume = manualVolume;
    }

    public Long getRembourseNombre() {
        return rembourseNombre;
    }

    public void setRembourseNombre(Long rembourseNombre) {
        this.rembourseNombre = rembourseNombre;
    }

    public Double getRembourseVolume() {
        return rembourseVolume;
    }

    public void setRembourseVolume(Double rembourseVolume) {
        this.rembourseVolume = rembourseVolume;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}

