package com.reconciliation.dto;

import java.util.List;

public class DeleteOperationsResponse {
    private boolean success;
    private int deletedCount;
    private List<String> errors;

    public DeleteOperationsResponse() {}

    public DeleteOperationsResponse(boolean success, int deletedCount, List<String> errors) {
        this.success = success;
        this.deletedCount = deletedCount;
        this.errors = errors;
    }

    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public int getDeletedCount() {
        return deletedCount;
    }

    public void setDeletedCount(int deletedCount) {
        this.deletedCount = deletedCount;
    }

    public List<String> getErrors() {
        return errors;
    }

    public void setErrors(List<String> errors) {
        this.errors = errors;
    }
}
