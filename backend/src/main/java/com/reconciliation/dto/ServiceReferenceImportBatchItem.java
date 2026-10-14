package com.reconciliation.dto;

import com.reconciliation.entity.ServiceReferenceEntity;

/**
 * Une ligne d'import fichier avec numéro de ligne pour les messages d'erreur.
 */
public class ServiceReferenceImportBatchItem {

    private Integer rowNumber;
    private ServiceReferenceEntity payload;

    public ServiceReferenceImportBatchItem() {}

    public Integer getRowNumber() {
        return rowNumber;
    }

    public void setRowNumber(Integer rowNumber) {
        this.rowNumber = rowNumber;
    }

    public ServiceReferenceEntity getPayload() {
        return payload;
    }

    public void setPayload(ServiceReferenceEntity payload) {
        this.payload = payload;
    }
}
