package com.reconciliation.dto;

import java.util.ArrayList;
import java.util.List;

public class ServiceReferenceImportBatchResponse {

    private int successCount;
    private List<String> errors = new ArrayList<>();

    public ServiceReferenceImportBatchResponse() {}

    public ServiceReferenceImportBatchResponse(int successCount, List<String> errors) {
        this.successCount = successCount;
        this.errors = errors != null ? errors : new ArrayList<>();
    }

    public int getSuccessCount() {
        return successCount;
    }

    public void setSuccessCount(int successCount) {
        this.successCount = successCount;
    }

    public List<String> getErrors() {
        return errors;
    }

    public void setErrors(List<String> errors) {
        this.errors = errors;
    }
}
