package com.reconciliation.service;

import com.reconciliation.dto.ReconciliationResponse;

/**
 * Classe de résultat pour la réconciliation magique
 */
public class MagicReconciliationResult {
    private final boolean success;
    private final ReconciliationResponse response;
    private final String message;
    private final KeyDiscoveryService.KeyDiscoveryResult keyDiscoveryResult;
    
    public MagicReconciliationResult(boolean success, ReconciliationResponse response, String message, KeyDiscoveryService.KeyDiscoveryResult keyDiscoveryResult) {
        this.success = success;
        this.response = response;
        this.message = message;
        this.keyDiscoveryResult = keyDiscoveryResult;
    }
    
    public boolean isSuccess() { 
        return success; 
    }
    
    public ReconciliationResponse getResponse() { 
        return response; 
    }
    
    public String getMessage() { 
        return message; 
    }
    
    public KeyDiscoveryService.KeyDiscoveryResult getKeyDiscoveryResult() { 
        return keyDiscoveryResult; 
    }
    
    @Override
    public String toString() {
        return String.format("MagicReconciliationResult{success=%s, message='%s', confidence=%.2f}", 
            success, message, keyDiscoveryResult != null ? keyDiscoveryResult.confidence : 0.0);
    }
}
