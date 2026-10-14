package com.reconciliation.dto;

import com.reconciliation.model.AgencySummary;
import java.util.List;

public class AgencySummarySaveRequest {
    private List<AgencySummary> summary;
    private String timestamp;

    public List<AgencySummary> getSummary() { return summary; }
    public void setSummary(List<AgencySummary> summary) { this.summary = summary; }
    public String getTimestamp() { return timestamp; }
    public void setTimestamp(String timestamp) { this.timestamp = timestamp; }
} 