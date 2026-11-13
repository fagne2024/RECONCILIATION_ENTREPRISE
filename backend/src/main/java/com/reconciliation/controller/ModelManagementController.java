package com.reconciliation.controller;

import com.reconciliation.service.ModelNormalizationService;
import com.reconciliation.service.ModelWatchFolderService;
import com.reconciliation.service.AutoProcessingService;
import com.reconciliation.entity.AutoProcessingModel;
import com.reconciliation.dto.AutoProcessingModelDTO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.ArrayList;

/**
 * Contrôleur pour la gestion des modèles de traitement automatique
 * Inclut la normalisation et le chargement depuis le watch-folder
 */
@RestController
@RequestMapping("/api/model-management")
@CrossOrigin(origins = {"http://localhost:4200", "http://localhost:3000", "http://172.214.108.8:4200"}, allowCredentials = "true")
public class ModelManagementController {

    @Autowired
    private ModelNormalizationService modelNormalizationService;

    @Autowired
    private ModelWatchFolderService modelWatchFolderService;

    @Autowired
    private AutoProcessingService autoProcessingService;

    /**
     * Normalise tous les modèles existants
     */
    @PostMapping("/normalize-all")
    public ResponseEntity<Map<String, Object>> normalizeAllModels() {
        try {
            System.out.println("🔧 Début de la normalisation de tous les modèles");
            
            List<AutoProcessingModel> allModels = autoProcessingService.getAllModels();
            int totalModels = allModels.size();
            int normalizedModels = 0;
            int errors = 0;
            
            for (AutoProcessingModel model : allModels) {
                try {
                    // Normaliser le modèle
                    AutoProcessingModel normalizedModel = modelNormalizationService.normalizeModel(model);
                    
                    if (normalizedModel != null && modelNormalizationService.validateModel(normalizedModel)) {
                        // Mettre à jour le modèle dans la base de données
                        AutoProcessingModel updatedModel = autoProcessingService.updateModel(model.getModelId(), normalizedModel);
                        if (updatedModel != null) {
                            normalizedModels++;
                            System.out.println("✅ Modèle normalisé: " + model.getName());
                        } else {
                            errors++;
                            System.out.println("❌ Erreur lors de la mise à jour: " + model.getName());
                        }
                    } else {
                        errors++;
                        System.out.println("❌ Modèle invalide après normalisation: " + model.getName());
                    }
                } catch (Exception e) {
                    errors++;
                    System.err.println("❌ Erreur lors de la normalisation de " + model.getName() + ": " + e.getMessage());
                }
            }
            
            Map<String, Object> result = Map.of(
                "success", errors == 0,
                "totalModels", totalModels,
                "normalizedModels", normalizedModels,
                "errors", errors,
                "message", "Normalisation terminée"
            );
            
            System.out.println("✅ Normalisation terminée: " + normalizedModels + "/" + totalModels + " modèles normalisés");
            return ResponseEntity.ok(result);
            
        } catch (Exception e) {
            System.err.println("❌ Erreur lors de la normalisation: " + e.getMessage());
            return ResponseEntity.badRequest().body(Map.of(
                "success", false,
                "error", e.getMessage()
            ));
        }
    }

    /**
     * Normalise un modèle spécifique
     */
    @PostMapping("/normalize/{modelId}")
    public ResponseEntity<Map<String, Object>> normalizeModel(@PathVariable String modelId) {
        try {
            System.out.println("🔧 Normalisation du modèle: " + modelId);
            
            AutoProcessingModel model = autoProcessingService.getModelByModelId(modelId);
            if (model == null) {
                return ResponseEntity.notFound().build();
            }
            
            // Normaliser le modèle
            AutoProcessingModel normalizedModel = modelNormalizationService.normalizeModel(model);
            
            if (normalizedModel != null && modelNormalizationService.validateModel(normalizedModel)) {
                // Mettre à jour le modèle
                AutoProcessingModel updatedModel = autoProcessingService.updateModel(modelId, normalizedModel);
                
                if (updatedModel != null) {
                    System.out.println("✅ Modèle normalisé avec succès: " + model.getName());
                    return ResponseEntity.ok(Map.of(
                        "success", true,
                        "model", updatedModel,
                        "message", "Modèle normalisé avec succès"
                    ));
                } else {
                    return ResponseEntity.badRequest().body(Map.of(
                        "success", false,
                        "error", "Erreur lors de la mise à jour du modèle"
                    ));
                }
            } else {
                return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "error", "Modèle invalide après normalisation"
                ));
            }
            
        } catch (Exception e) {
            System.err.println("❌ Erreur lors de la normalisation: " + e.getMessage());
            return ResponseEntity.badRequest().body(Map.of(
                "success", false,
                "error", e.getMessage()
            ));
        }
    }

    /**
     * Importe tous les modèles depuis le watch-folder
     */
    @PostMapping("/import-from-watch-folder")
    public ResponseEntity<Map<String, Object>> importModelsFromWatchFolder() {
        try {
            System.out.println("🔧 ModelManagementController: importModelsFromWatchFolder() appelé");
            
            Map<String, Object> result = modelWatchFolderService.importModelsFromWatchFolder();
            
            System.out.println("✅ Import terminé: " + result);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            System.err.println("❌ Erreur lors de l'import: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/model-files")
    public ResponseEntity<List<Map<String, Object>>> getModelFilesFromWatchFolder() {
        try {
            System.out.println("🔧 ModelManagementController: getModelFilesFromWatchFolder() appelé");
            
            List<Map<String, Object>> modelFiles = modelWatchFolderService.getModelFilesInfo();
            
            System.out.println("✅ Fichiers modèles récupérés: " + modelFiles.size() + " fichiers");
            return ResponseEntity.ok(modelFiles);
        } catch (Exception e) {
            System.err.println("❌ Erreur lors de la récupération des fichiers modèles: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.badRequest().body(new ArrayList<>());
        }
    }

    /**
     * Charge les modèles depuis le watch-folder sans les importer
     */
    @GetMapping("/load-from-watch-folder")
    public ResponseEntity<Map<String, Object>> loadModelsFromWatchFolder() {
        try {
            System.out.println("📁 Chargement des modèles depuis le watch-folder");
            
            List<AutoProcessingModel> models = modelWatchFolderService.loadModelsFromWatchFolder();
            
            Map<String, Object> result = Map.of(
                "success", true,
                "models", models,
                "count", models.size(),
                "message", "Modèles chargés avec succès"
            );
            
            System.out.println("✅ " + models.size() + " modèles chargés depuis le watch-folder");
            return ResponseEntity.ok(result);
            
        } catch (Exception e) {
            System.err.println("❌ Erreur lors du chargement: " + e.getMessage());
            return ResponseEntity.badRequest().body(Map.of(
                "success", false,
                "error", e.getMessage()
            ));
        }
    }

    /**
     * Démarre la surveillance du dossier models
     */
    @PostMapping("/start-watch-folder-monitoring")
    public ResponseEntity<Map<String, Object>> startWatchFolderMonitoring() {
        try {
            System.out.println("👀 Démarrage de la surveillance du dossier models");
            
            modelWatchFolderService.startModelWatchFolderMonitoring();
            
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Surveillance du dossier models démarrée"
            ));
            
        } catch (Exception e) {
            System.err.println("❌ Erreur lors du démarrage de la surveillance: " + e.getMessage());
            return ResponseEntity.badRequest().body(Map.of(
                "success", false,
                "error", e.getMessage()
            ));
        }
    }

    /**
     * Crée un modèle d'exemple dans le watch-folder
     */
    @PostMapping("/create-example-model")
    public ResponseEntity<Map<String, Object>> createExampleModel() {
        try {
            System.out.println("📄 Création du modèle d'exemple");
            
            modelWatchFolderService.createExampleModel();
            
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Modèle d'exemple créé dans le watch-folder"
            ));
            
        } catch (Exception e) {
            System.err.println("❌ Erreur lors de la création du modèle d'exemple: " + e.getMessage());
            return ResponseEntity.badRequest().body(Map.of(
                "success", false,
                "error", e.getMessage()
            ));
        }
    }

    /**
     * Valide un modèle
     */
    @PostMapping("/validate")
    public ResponseEntity<Map<String, Object>> validateModel(@RequestBody AutoProcessingModelDTO modelDTO) {
        try {
            System.out.println("🔍 Validation du modèle: " + modelDTO.getName());
            
            // Convertir DTO en entité
            AutoProcessingModel model = new AutoProcessingModel();
            model.setName(modelDTO.getName());
            model.setFilePattern(modelDTO.getFilePattern());
            model.setFileType(parseFileType(modelDTO.getFileType()));
            model.setAutoApply(modelDTO.isAutoApply());
            model.setBankModel(modelDTO.isBankModel());
            model.setTemplateFile(modelDTO.getTemplateFile());
            model.setReconciliationKeys(modelDTO.getReconciliationKeys());
            
            // Normaliser le modèle
            model = modelNormalizationService.normalizeModel(model);
            
            // Valider le modèle
            boolean isValid = modelNormalizationService.validateModel(model);
            
            Map<String, Object> result = Map.of(
                "success", true,
                "isValid", isValid,
                "normalizedModel", model,
                "message", isValid ? "Modèle valide" : "Modèle invalide"
            );
            
            System.out.println("✅ Validation terminée: " + (isValid ? "valide" : "invalide"));
            return ResponseEntity.ok(result);
            
        } catch (Exception e) {
            System.err.println("❌ Erreur lors de la validation: " + e.getMessage());
            return ResponseEntity.badRequest().body(Map.of(
                "success", false,
                "error", e.getMessage()
            ));
        }
    }

    /**
     * Génère un ID de modèle basé sur le nom
     */
    @PostMapping("/generate-model-id")
    public ResponseEntity<Map<String, Object>> generateModelId(@RequestBody Map<String, String> request) {
        try {
            String name = request.get("name");
            if (name == null || name.trim().isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "error", "Le nom du modèle est requis"
                ));
            }
            
            String modelId = modelNormalizationService.generateModelId(name);
            
            return ResponseEntity.ok(Map.of(
                "success", true,
                "modelId", modelId,
                "name", name,
                "message", "ID de modèle généré"
            ));
            
        } catch (Exception e) {
            System.err.println("❌ Erreur lors de la génération de l'ID: " + e.getMessage());
            return ResponseEntity.badRequest().body(Map.of(
                "success", false,
                "error", e.getMessage()
            ));
        }
    }

    /**
     * Obtient les statistiques des modèles
     */
    @GetMapping("/statistics")
    public ResponseEntity<Map<String, Object>> getModelStatistics() {
        try {
            List<AutoProcessingModel> allModels = autoProcessingService.getAllModels();
            
            long totalModels = allModels.size();
            long boModels = allModels.stream().filter(m -> m.getFileType() == AutoProcessingModel.FileType.BO).count();
            long partnerModels = allModels.stream().filter(m -> m.getFileType() == AutoProcessingModel.FileType.PARTNER).count();
            long bothModels = allModels.stream().filter(m -> m.getFileType() == AutoProcessingModel.FileType.BOTH).count();
            long autoApplyModels = allModels.stream().filter(AutoProcessingModel::isAutoApply).count();
            
            Map<String, Object> result = Map.of(
                "success", true,
                "totalModels", totalModels,
                "boModels", boModels,
                "partnerModels", partnerModels,
                "bothModels", bothModels,
                "autoApplyModels", autoApplyModels,
                "message", "Statistiques récupérées"
            );
            
            return ResponseEntity.ok(result);
            
        } catch (Exception e) {
            System.err.println("❌ Erreur lors de la récupération des statistiques: " + e.getMessage());
            return ResponseEntity.badRequest().body(Map.of(
                "success", false,
                "error", e.getMessage()
            ));
        }
    }

    // Méthode utilitaire pour parser le type de fichier
    private AutoProcessingModel.FileType parseFileType(String fileType) {
        if (fileType == null) {
            return AutoProcessingModel.FileType.BOTH;
        }

        switch (fileType.toLowerCase()) {
            case "bo":
                return AutoProcessingModel.FileType.BO;
            case "partner":
                return AutoProcessingModel.FileType.PARTNER;
            case "both":
            default:
                return AutoProcessingModel.FileType.BOTH;
        }
    }
}
