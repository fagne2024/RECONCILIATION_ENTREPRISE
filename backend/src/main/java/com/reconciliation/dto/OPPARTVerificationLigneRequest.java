package com.reconciliation.dto;

import java.math.BigDecimal;

/** Ligne cible a verifier dans OPPART. */
public class OPPARTVerificationLigneRequest {

    private String numeroTransGu;
    private BigDecimal montant;
    private String date;
    private String client;

    public String getNumeroTransGu() {
        return numeroTransGu;
    }

    public void setNumeroTransGu(String numeroTransGu) {
        this.numeroTransGu = numeroTransGu;
    }

    public BigDecimal getMontant() {
        return montant;
    }

    public void setMontant(BigDecimal montant) {
        this.montant = montant;
    }

    public String getDate() {
        return date;
    }

    public void setDate(String date) {
        this.date = date;
    }

    public String getClient() {
        return client;
    }

    public void setClient(String client) {
        this.client = client;
    }
}
