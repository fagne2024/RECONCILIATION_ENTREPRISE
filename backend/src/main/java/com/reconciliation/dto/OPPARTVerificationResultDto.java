package com.reconciliation.dto;

import java.math.BigDecimal;

/**
 * Resultat de la verification d'une ligne concernee.
 * Le mode indique comment la ligne OPPART a ete retrouvee : ID_TRANSGU pour une
 * correspondance directe sur l'identifiant de transaction, seul mode fiable.
 * Le statut porte est celui du groupe de correspondance complet (token partage).
 */
public class OPPARTVerificationResultDto {

    public static final String MODE_ID_TRANSGU = "ID_TRANSGU";

    private String numeroTransGu;
    private boolean trouve;
    private String mode;
    private String motif;
    private Long id;
    private String statut;
    private String typeOp;
    private BigDecimal montant;
    private String dateOperation;
    private String client;
    private String token;

    public String getNumeroTransGu() {
        return numeroTransGu;
    }

    public void setNumeroTransGu(String numeroTransGu) {
        this.numeroTransGu = numeroTransGu;
    }

    public boolean isTrouve() {
        return trouve;
    }

    public void setTrouve(boolean trouve) {
        this.trouve = trouve;
    }

    public String getMode() {
        return mode;
    }

    public void setMode(String mode) {
        this.mode = mode;
    }

    public String getMotif() {
        return motif;
    }

    public void setMotif(String motif) {
        this.motif = motif;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getStatut() {
        return statut;
    }

    public void setStatut(String statut) {
        this.statut = statut;
    }

    public String getTypeOp() {
        return typeOp;
    }

    public void setTypeOp(String typeOp) {
        this.typeOp = typeOp;
    }

    public BigDecimal getMontant() {
        return montant;
    }

    public void setMontant(BigDecimal montant) {
        this.montant = montant;
    }

    public String getDateOperation() {
        return dateOperation;
    }

    public void setDateOperation(String dateOperation) {
        this.dateOperation = dateOperation;
    }

    public String getClient() {
        return client;
    }

    public void setClient(String client) {
        this.client = client;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }
}
