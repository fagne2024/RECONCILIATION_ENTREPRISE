package com.reconciliation.dto;

import java.util.List;

/** Verification d'un lot de lignes concernees. */
public class OPPARTVerificationRequest {

    private List<OPPARTVerificationLigneRequest> lignes;

    public List<OPPARTVerificationLigneRequest> getLignes() {
        return lignes;
    }

    public void setLignes(List<OPPARTVerificationLigneRequest> lignes) {
        this.lignes = lignes;
    }
}
