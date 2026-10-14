package com.reconciliation.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.datatype.jsr310.deser.LocalDateDeserializer;
import com.fasterxml.jackson.datatype.jsr310.ser.LocalDateSerializer;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "statistics")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Statistics {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    @NotBlank(message = "L'agence ne peut pas être vide")
    @Column(nullable = false)
    private String agency;

    @NotBlank(message = "Le service ne peut pas être vide")
    @Column(nullable = false)
    private String service;

    @NotBlank(message = "Le pays ne peut pas être vide")
    @Column(nullable = false)
    private String country;

    @NotNull(message = "La date ne peut pas être nulle")
    @Column(nullable = false)
    @JsonFormat(pattern = "yyyy-MM-dd")
    @JsonDeserialize(using = LocalDateDeserializer.class)
    @JsonSerialize(using = LocalDateSerializer.class)
    private LocalDate date;

    @NotNull(message = "Le volume total ne peut pas être nul")
    @Column(nullable = false)
    @PositiveOrZero(message = "Le volume total doit être positif ou zéro")
    @JsonProperty("totalVolume")
    private BigDecimal totalVolume;

    @NotNull(message = "Le nombre d'enregistrements ne peut pas être nul")
    @Column(nullable = false)
    @PositiveOrZero(message = "Le nombre d'enregistrements doit être positif ou zéro")
    @JsonProperty("recordCount")
    private Integer recordCount;

    @Override
    public String toString() {
        return String.format(
            "Statistics{id=%d, agency='%s', service='%s', country='%s', date='%s', totalVolume=%s, recordCount=%d}",
            id, agency, service, country, date, totalVolume, recordCount
        );
    }
} 