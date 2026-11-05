package com.reconciliation.entity;

import jakarta.persistence.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "certification_solde_resultat",
        uniqueConstraints = @UniqueConstraint(columnNames = {"entreprise_id", "numero_compte", "date_debut", "date_fin"}))
public class CertificationSoldeResultatEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    @Column(name = "numero_compte", nullable = false)
    private String numeroCompte;

    @Column(name = "date_debut", nullable = false)
    private LocalDate dateDebut;

    @Column(name = "date_fin", nullable = false)
    private LocalDate dateFin;

    /** Environnement technique (BET, HT, T-E, HUBAO, TOP20, GU3). */
    @Column(name = "env", length = 20)
    private String env;

    /** Code pays (ex. SN, CI). */
    @Column(name = "pays", length = 10)
    private String pays;

    @Column(name = "heure_ouverture", length = 8)
    private String heureOuverture;

    @Column(name = "heure_cloture", length = 8)
    private String heureCloture;

    @Column(name = "titre")
    private String titre;

    @Column(name = "solde_ouverture")
    private Double soldeOuverture;

    @Column(name = "solde_cloture")
    private Double soldeCloture;

    @Column(name = "total_debit")
    private Double totalDebit;

    @Column(name = "total_credit")
    private Double totalCredit;

    @Column(name = "variation")
    private Double variation;

    @Column(name = "mouvement_net_oppart")
    private Double mouvementNetOppart;

    @Column(name = "frais_attendu")
    private Double fraisAttendu;

    @Column(name = "frais_factures")
    private Double fraisFactures;

    @Column(name = "ecart_frais")
    private Double ecartFrais;

    @Column(name = "ecart_mouvement")
    private Double ecartMouvement;

    @Column(name = "total_regularisation")
    private Double totalRegularisation;

    @Column(name = "ecart_certification")
    private Double ecartCertification;

    @Column(name = "solde_cloture_theorique")
    private Double soldeClotureTheorique;

    @Column(name = "volume_ecart_bo")
    private Double volumeEcartBo;

    @Column(name = "volume_ecart_partenaire")
    private Double volumeEcartPartenaire;

    @Column(name = "nb_lignes_bo")
    private Integer nbLignesBo;

    @Column(name = "nb_lignes_partenaire")
    private Integer nbLignesPartenaire;

    @Column(name = "nb_correspondances")
    private Integer nbCorrespondances;

    @Column(name = "commentaire", length = 2000)
    private String commentaire;

    /** Tableaux du PDF (JSON opaque côté backend, structuré par le frontend). */
    @Column(name = "details_json", columnDefinition = "LONGTEXT")
    private String detailsJson;

    @Column(name = "created_by")
    private String createdBy;

    @Column(name = "updated_by")
    private String updatedBy;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    public void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getNumeroCompte() { return numeroCompte; }
    public void setNumeroCompte(String numeroCompte) { this.numeroCompte = numeroCompte; }

    public LocalDate getDateDebut() { return dateDebut; }
    public void setDateDebut(LocalDate dateDebut) { this.dateDebut = dateDebut; }

    public LocalDate getDateFin() { return dateFin; }
    public void setDateFin(LocalDate dateFin) { this.dateFin = dateFin; }

    public String getEnv() { return env; }
    public void setEnv(String env) { this.env = env; }

    public String getPays() { return pays; }
    public void setPays(String pays) { this.pays = pays; }

    public String getHeureOuverture() { return heureOuverture; }
    public void setHeureOuverture(String heureOuverture) { this.heureOuverture = heureOuverture; }

    public String getHeureCloture() { return heureCloture; }
    public void setHeureCloture(String heureCloture) { this.heureCloture = heureCloture; }

    public String getTitre() { return titre; }
    public void setTitre(String titre) { this.titre = titre; }

    public Double getSoldeOuverture() { return soldeOuverture; }
    public void setSoldeOuverture(Double soldeOuverture) { this.soldeOuverture = soldeOuverture; }

    public Double getSoldeCloture() { return soldeCloture; }
    public void setSoldeCloture(Double soldeCloture) { this.soldeCloture = soldeCloture; }

    public Double getTotalDebit() { return totalDebit; }
    public void setTotalDebit(Double totalDebit) { this.totalDebit = totalDebit; }

    public Double getTotalCredit() { return totalCredit; }
    public void setTotalCredit(Double totalCredit) { this.totalCredit = totalCredit; }

    public Double getVariation() { return variation; }
    public void setVariation(Double variation) { this.variation = variation; }

    public Double getMouvementNetOppart() { return mouvementNetOppart; }
    public void setMouvementNetOppart(Double mouvementNetOppart) { this.mouvementNetOppart = mouvementNetOppart; }

    public Double getFraisAttendu() { return fraisAttendu; }
    public void setFraisAttendu(Double fraisAttendu) { this.fraisAttendu = fraisAttendu; }

    public Double getFraisFactures() { return fraisFactures; }
    public void setFraisFactures(Double fraisFactures) { this.fraisFactures = fraisFactures; }

    public Double getEcartFrais() { return ecartFrais; }
    public void setEcartFrais(Double ecartFrais) { this.ecartFrais = ecartFrais; }

    public Double getEcartMouvement() { return ecartMouvement; }
    public void setEcartMouvement(Double ecartMouvement) { this.ecartMouvement = ecartMouvement; }

    public Double getTotalRegularisation() { return totalRegularisation; }
    public void setTotalRegularisation(Double totalRegularisation) { this.totalRegularisation = totalRegularisation; }

    public Double getEcartCertification() { return ecartCertification; }
    public void setEcartCertification(Double ecartCertification) { this.ecartCertification = ecartCertification; }

    public Double getSoldeClotureTheorique() { return soldeClotureTheorique; }
    public void setSoldeClotureTheorique(Double soldeClotureTheorique) { this.soldeClotureTheorique = soldeClotureTheorique; }

    public Double getVolumeEcartBo() { return volumeEcartBo; }
    public void setVolumeEcartBo(Double volumeEcartBo) { this.volumeEcartBo = volumeEcartBo; }

    public Double getVolumeEcartPartenaire() { return volumeEcartPartenaire; }
    public void setVolumeEcartPartenaire(Double volumeEcartPartenaire) { this.volumeEcartPartenaire = volumeEcartPartenaire; }

    public Integer getNbLignesBo() { return nbLignesBo; }
    public void setNbLignesBo(Integer nbLignesBo) { this.nbLignesBo = nbLignesBo; }

    public Integer getNbLignesPartenaire() { return nbLignesPartenaire; }
    public void setNbLignesPartenaire(Integer nbLignesPartenaire) { this.nbLignesPartenaire = nbLignesPartenaire; }

    public Integer getNbCorrespondances() { return nbCorrespondances; }
    public void setNbCorrespondances(Integer nbCorrespondances) { this.nbCorrespondances = nbCorrespondances; }

    public String getCommentaire() { return commentaire; }
    public void setCommentaire(String commentaire) { this.commentaire = commentaire; }

    public String getDetailsJson() { return detailsJson; }
    public void setDetailsJson(String detailsJson) { this.detailsJson = detailsJson; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
