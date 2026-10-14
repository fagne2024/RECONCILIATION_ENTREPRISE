package com.reconciliation.dto;

import com.reconciliation.entity.Result8RecEntity;

import java.util.ArrayList;
import java.util.List;

/**
 * Réponse de {@code POST /api/result8rec/bulk} : une entrée par ligne d'entrée, même ordre.
 */
public class Result8RecBulkSaveResponse {

    public List<RowResult> results = new ArrayList<>();

    public static class RowResult {
        /** CREATED ou CONFLICT */
        public String status;
        /** Ligne persistée (CREATED) ou enregistrement existant (CONFLICT) */
        public Result8RecEntity entity;

        public RowResult() {
        }

        public RowResult(String status, Result8RecEntity entity) {
            this.status = status;
            this.entity = entity;
        }
    }
}
