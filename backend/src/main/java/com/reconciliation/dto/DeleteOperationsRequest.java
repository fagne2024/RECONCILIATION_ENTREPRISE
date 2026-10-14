package com.reconciliation.dto;

import java.util.List;

public class DeleteOperationsRequest {
    private List<Long> ids;

    public DeleteOperationsRequest() {}

    public DeleteOperationsRequest(List<Long> ids) {
        this.ids = ids;
    }

    public List<Long> getIds() {
        return ids;
    }

    public void setIds(List<Long> ids) {
        this.ids = ids;
    }
}
