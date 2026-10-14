package com.reconciliation.dto;

import java.util.List;

public class ReleveImportResult {
    public List<ReleveBancaireRow> rows;
    public int totalRead;
    public int duplicatesIgnored;
    public List<String> unmappedHeaders;

    public ReleveImportResult(List<ReleveBancaireRow> rows, int totalRead, int duplicatesIgnored, List<String> unmappedHeaders) {
        this.rows = rows;
        this.totalRead = totalRead;
        this.duplicatesIgnored = duplicatesIgnored;
        this.unmappedHeaders = unmappedHeaders;
    }
}


