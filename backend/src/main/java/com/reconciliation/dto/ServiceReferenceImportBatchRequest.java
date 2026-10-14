package com.reconciliation.dto;

import java.util.List;

public class ServiceReferenceImportBatchRequest {

    private List<ServiceReferenceImportBatchItem> items;

    public ServiceReferenceImportBatchRequest() {}

    public List<ServiceReferenceImportBatchItem> getItems() {
        return items;
    }

    public void setItems(List<ServiceReferenceImportBatchItem> items) {
        this.items = items;
    }
}
