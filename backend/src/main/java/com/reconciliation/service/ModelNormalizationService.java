package com.reconciliation.service;

import com.reconciliation.entity.AutoProcessingModel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class ModelNormalizationService {
    
    private static final Logger logger = LoggerFactory.getLogger(ModelNormalizationService.class);
    
    /**
     * Méthode simple qui retourne le modèle sans modification
     */
    public AutoProcessingModel normalizeModel(AutoProcessingModel model) {
        return model;
    }
    
    /**
     * Méthode simple qui génère un ID de modèle
     */
    public String generateModelId(String name) {
        if (name == null || name.trim().isEmpty()) {
            return "model_" + UUID.randomUUID().toString().substring(0, 8);
        }
        return name.toLowerCase().replaceAll("[^a-z0-9]", "_") + "_" + UUID.randomUUID().toString().substring(0, 8);
    }
    
    /**
     * Méthode simple qui valide toujours le modèle
     */
    public boolean validateModel(AutoProcessingModel model) {
        return true;
    }
    
}
