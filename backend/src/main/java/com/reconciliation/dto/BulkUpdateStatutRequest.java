package com.reconciliation.dto;

import java.util.List;

public class BulkUpdateStatutRequest {
    private List<Long> ids;
    private String statut;

    public List<Long> getIds() {
        return ids;
    }

    public void setIds(List<Long> ids) {
        this.ids = ids;
    }

    public String getStatut() {
        return statut;
    }

    public void setStatut(String statut) {
        this.statut = statut;
    }
}


