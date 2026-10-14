package com.reconciliation.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ReconciliationConfig {
    
    @JsonProperty("boReconciliationKey")
    private String boReconciliationKey;
    
    @JsonProperty("partnerReconciliationKey")
    private String partnerReconciliationKey;
    
    @JsonProperty("additionalKeys")
    private List<AdditionalKey> additionalKeys;
    
    @JsonProperty("tolerance")
    private Double tolerance;
    
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AdditionalKey {
        @JsonProperty("boColumn")
        private String boColumn;
        
        @JsonProperty("partnerColumn")
        private String partnerColumn;
    }
}
