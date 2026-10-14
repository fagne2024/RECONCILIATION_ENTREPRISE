package com.reconciliation.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProgressUpdate {
    
    @JsonProperty("percentage")
    private Integer percentage;
    
    @JsonProperty("processed")
    private Long processed;
    
    @JsonProperty("total")
    private Long total;
    
    @JsonProperty("step")
    private String step;
    
    @JsonProperty("currentFile")
    private Integer currentFile;
    
    @JsonProperty("totalFiles")
    private Integer totalFiles;
    
    @JsonProperty("estimatedTimeRemaining")
    private Long estimatedTimeRemaining;
}
