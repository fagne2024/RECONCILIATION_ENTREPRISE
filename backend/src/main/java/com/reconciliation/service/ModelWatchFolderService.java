package com.reconciliation.service;

import com.reconciliation.entity.AutoProcessingModel;
import com.reconciliation.entity.ColumnProcessingRule;
import com.reconciliation.dto.AutoProcessingModelDTO;
import com.reconciliation.dto.ColumnProcessingRuleDTO;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.core.type.TypeReference;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.util.StringUtils;

import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.regex.Pattern;
import java.time.LocalDateTime;
import java.util.stream.Collectors;

/**
 * Service pour charger les modèles de traitement depuis le watch-folder
 * Permet l'import automatique de modèles depuis des fichiers JSON
 */
@Service
public class ModelWatchFolderService {

    @Autowired
    private AutoProcessingService autoProcessingService;

    @Autowired
    private ModelNormalizationService modelNormalizationService;

    @Autowired
    private ColumnProcessingRuleService columnProcessingRuleService;

    @Value("${app.watch-folder.path:../watch-folder}")
    private String watchFolderPath;

    @Value("${app.watch-folder.models-path:../watch-folder/models}")
    private String modelsFolderPath;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Pattern modelFilePattern = Pattern.compile(".*\\.(json|model)$", Pattern.CASE_INSENSITIVE);

    /**
     * Charge tous les modèles depuis le watch-folder
     */
    public List<AutoProcessingModel> loadModelsFromWatchFolder() {
        List<AutoProcessingModel> loadedModels = new ArrayList<>();
        
        try {
            Path modelsPath = Paths.get(modelsFolderPath);
            
            // Créer le dossier s'il n'existe pas
            if (!Files.exists(modelsPath)) {
                Files.createDirectories(modelsPath);
                System.out.println("📁 Dossier models créé: " + modelsPath.toAbsolutePath());
                return loadedModels;
            }

            // Scanner tous les fichiers JSON dans le dossier
            List<Path> modelFiles = Files.walk(modelsPath, 1)
                .filter(path -> !Files.isDirectory(path))
                .filter(path -> modelFilePattern.matcher(path.getFileName().toString()).matches())
                .collect(Collectors.toList());

            System.out.println("🔍 " + modelFiles.size() + " fichiers de modèles trouvés dans " + modelsPath);

            for (Path modelFile : modelFiles) {
                try {
                    AutoProcessingModel model = loadModelFromFile(modelFile);
                    if (model != null) {
                        loadedModels.add(model);
                        System.out.println("✅ Modèle chargé: " + model.getName() + " depuis " + modelFile.getFileName());
                    }
                } catch (Exception e) {
                    System.err.println("❌ Erreur lors du chargement du modèle depuis " + modelFile.getFileName() + ": " + e.getMessage());
                }
            }

        } catch (Exception e) {
            System.err.println("❌ Erreur lors du scan du dossier models: " + e.getMessage());
        }

        return loadedModels;
    }

    /**
     * Charge un modèle depuis un fichier JSON
     */
    public AutoProcessingModel loadModelFromFile(Path modelFile) throws IOException {
        if (!Files.exists(modelFile)) {
            throw new FileNotFoundException("Fichier modèle non trouvé: " + modelFile);
        }

        String content = Files.readString(modelFile);
        JsonNode rootNode = objectMapper.readTree(content);

        // Créer le modèle
        AutoProcessingModel model = new AutoProcessingModel();

        // Charger les propriétés de base
        model.setName(getStringValue(rootNode, "name", "Modèle sans nom"));
        model.setFilePattern(getStringValue(rootNode, "filePattern", ".*\\.(csv|xlsx?)$"));
        model.setFileType(parseFileType(getStringValue(rootNode, "fileType", "both")));
        model.setAutoApply(getBooleanValue(rootNode, "autoApply", true));
        model.setTemplateFile(getStringValue(rootNode, "templateFile", null));

        // Générer un ID de modèle
        String modelId = getStringValue(rootNode, "modelId", null);
        if (!StringUtils.hasText(modelId)) {
            modelId = modelNormalizationService.generateModelId(model.getName());
        }
        model.setModelId(modelId);

        // Charger les clés de réconciliation
        if (rootNode.has("reconciliationKeys")) {
            Map<String, Object> reconciliationKeys = objectMapper.convertValue(
                rootNode.get("reconciliationKeys"), 
                new TypeReference<Map<String, Object>>() {}
            );
            model.setReconciliationKeys(reconciliationKeys);
        }

        // Charger les règles de traitement des colonnes
        if (rootNode.has("columnProcessingRules")) {
            List<ColumnProcessingRule> rules = new ArrayList<>();
            JsonNode rulesNode = rootNode.get("columnProcessingRules");
            
            if (rulesNode.isArray()) {
                for (JsonNode ruleNode : rulesNode) {
                    ColumnProcessingRule rule = parseColumnProcessingRule(ruleNode);
                    if (rule != null) {
                        rules.add(rule);
                    }
                }
            }
            
            model.setColumnProcessingRules(rules);
        }

        // Normaliser le modèle
        model = modelNormalizationService.normalizeModel(model);

        // Valider le modèle
        if (!modelNormalizationService.validateModel(model)) {
            throw new IllegalArgumentException("Modèle invalide: " + model.getName());
        }

        return model;
    }

    /**
     * Importe automatiquement tous les modèles depuis le watch-folder
     */
    public Map<String, Object> importModelsFromWatchFolder() {
        Map<String, Object> result = new HashMap<>();
        List<String> importedModels = new ArrayList<>();
        List<String> errors = new ArrayList<>();
        int totalModels = 0;

        try {
            List<AutoProcessingModel> models = loadModelsFromWatchFolder();
            totalModels = models.size();

            for (AutoProcessingModel model : models) {
                try {
                    // Vérifier si le modèle existe déjà
                    AutoProcessingModel existingModel = autoProcessingService.getModelByModelId(model.getModelId());
                    
                    if (existingModel != null) {
                        // Mettre à jour le modèle existant
                        AutoProcessingModel updatedModel = autoProcessingService.updateModel(model.getModelId(), model);
                        if (updatedModel != null) {
                            importedModels.add("Mise à jour: " + model.getName());
                        } else {
                            errors.add("Erreur lors de la mise à jour: " + model.getName());
                        }
                    } else {
                        // Créer un nouveau modèle
                        AutoProcessingModel createdModel = autoProcessingService.createModel(model);
                        if (createdModel != null) {
                            importedModels.add("Créé: " + model.getName());
                        } else {
                            errors.add("Erreur lors de la création: " + model.getName());
                        }
                    }
                } catch (Exception e) {
                    errors.add("Erreur pour " + model.getName() + ": " + e.getMessage());
                }
            }

        } catch (Exception e) {
            errors.add("Erreur générale: " + e.getMessage());
        }

        result.put("success", errors.isEmpty());
        result.put("importedModels", importedModels);
        result.put("errors", errors);
        result.put("totalModels", totalModels);

        return result;
    }

    /**
     * Récupère les informations des fichiers modèles JSON depuis le watch-folder
     */
    public List<Map<String, Object>> getModelFilesInfo() {
        List<Map<String, Object>> modelFilesInfo = new ArrayList<>();
        
        try {
            Path modelsPath = Paths.get(modelsFolderPath);
            
            if (!Files.exists(modelsPath)) {
                System.out.println("📁 Dossier models n'existe pas: " + modelsPath.toAbsolutePath());
                return modelFilesInfo;
            }

            // Scanner tous les fichiers JSON dans le dossier
            List<Path> modelFiles = Files.walk(modelsPath, 1)
                .filter(path -> !Files.isDirectory(path))
                .filter(path -> modelFilePattern.matcher(path.getFileName().toString()).matches())
                .collect(Collectors.toList());

            System.out.println("🔍 " + modelFiles.size() + " fichiers de modèles trouvés dans " + modelsPath);

            for (Path modelFile : modelFiles) {
                try {
                    Map<String, Object> fileInfo = new HashMap<>();
                    fileInfo.put("fileName", modelFile.getFileName().toString());
                    fileInfo.put("filePath", modelFile.toAbsolutePath().toString());
                    fileInfo.put("lastModified", Files.getLastModifiedTime(modelFile).toMillis());
                    
                    // Charger le contenu du fichier pour extraire les colonnes
                    String content = Files.readString(modelFile);
                    JsonNode rootNode = objectMapper.readTree(content);
                    
                    // Extraire le nom du modèle
                    String modelName = getStringValue(rootNode, "name", "Modèle sans nom");
                    fileInfo.put("name", modelName);
                    
                    // Extraire les colonnes depuis les règles de traitement
                    List<String> columns = new ArrayList<>();
                    if (rootNode.has("columnProcessingRules")) {
                        JsonNode rulesNode = rootNode.get("columnProcessingRules");
                        if (rulesNode.isArray()) {
                            for (JsonNode ruleNode : rulesNode) {
                                String sourceColumn = getStringValue(ruleNode, "sourceColumn", "");
                                String targetColumn = getStringValue(ruleNode, "targetColumn", "");
                                if (!sourceColumn.isEmpty()) columns.add(sourceColumn);
                                if (!targetColumn.isEmpty()) columns.add(targetColumn);
                            }
                        }
                    }
                    
                    // Extraire les colonnes depuis les clés de réconciliation
                    if (rootNode.has("reconciliationKeys")) {
                        JsonNode keysNode = rootNode.get("reconciliationKeys");
                        if (keysNode.has("boKeys") && keysNode.get("boKeys").isArray()) {
                            for (JsonNode keyNode : keysNode.get("boKeys")) {
                                columns.add(keyNode.asText());
                            }
                        }
                        if (keysNode.has("partnerKeys") && keysNode.get("partnerKeys").isArray()) {
                            for (JsonNode keyNode : keysNode.get("partnerKeys")) {
                                columns.add(keyNode.asText());
                            }
                        }
                    }
                    
                    fileInfo.put("columns", columns.stream().distinct().collect(Collectors.toList()));
                    modelFilesInfo.add(fileInfo);
                    
                    System.out.println("✅ Informations extraites pour: " + modelName + " (" + columns.size() + " colonnes)");
                    
                } catch (Exception e) {
                    System.err.println("❌ Erreur lors de l'extraction des informations de " + modelFile.getFileName() + ": " + e.getMessage());
                }
            }

        } catch (Exception e) {
            System.err.println("❌ Erreur lors du scan du dossier models: " + e.getMessage());
        }

        return modelFilesInfo;
    }

    /**
     * Surveille le dossier models pour les nouveaux fichiers
     */
    public void startModelWatchFolderMonitoring() {
        try {
            Path modelsPath = Paths.get(modelsFolderPath);
            
            if (!Files.exists(modelsPath)) {
                Files.createDirectories(modelsPath);
            }

            // Créer un watcher pour le dossier models
            WatchService watchService = FileSystems.getDefault().newWatchService();
            modelsPath.register(watchService, StandardWatchEventKinds.ENTRY_CREATE, StandardWatchEventKinds.ENTRY_MODIFY);

            System.out.println("👀 Surveillance du dossier models démarrée: " + modelsPath.toAbsolutePath());

            // Démarrer la surveillance en arrière-plan
            new Thread(() -> {
                try {
                    while (true) {
                        WatchKey key = watchService.take();
                        
                        for (WatchEvent<?> event : key.pollEvents()) {
                            WatchEvent.Kind<?> kind = event.kind();
                            
                            if (kind == StandardWatchEventKinds.OVERFLOW) {
                                continue;
                            }

                            WatchEvent<Path> ev = (WatchEvent<Path>) event;
                            Path fileName = ev.context();
                            Path fullPath = modelsPath.resolve(fileName);

                            if (modelFilePattern.matcher(fileName.toString()).matches()) {
                                System.out.println("📄 Nouveau fichier modèle détecté: " + fileName);
                                
                                // Attendre un peu pour que le fichier soit complètement écrit
                                Thread.sleep(1000);
                                
                                try {
                                    // Dossier de modeles partage : v1 rattache l'import
                                    // automatique a l'entreprise historique.
                                    com.reconciliation.tenant.TenantContext.runAs(
                                        com.reconciliation.tenant.TenantContext.HISTORIQUE_ENTREPRISE_ID, () -> {
                                        try {
                                            AutoProcessingModel model = loadModelFromFile(fullPath);
                                            if (model != null) {
                                                // Importer le modèle
                                                AutoProcessingModel existingModel = autoProcessingService.getModelByModelId(model.getModelId());
                                                
                                                if (existingModel != null) {
                                                    autoProcessingService.updateModel(model.getModelId(), model);
                                                    System.out.println("✅ Modèle mis à jour: " + model.getName());
                                                } else {
                                                    autoProcessingService.createModel(model);
                                                    System.out.println("✅ Nouveau modèle importé: " + model.getName());
                                                }
                                            }
                                        } catch (Exception e) {
                                            System.err.println("❌ Erreur lors de l'import automatique de " + fileName + ": " + e.getMessage());
                                        }
                                    });
                                } catch (Exception e) {
                                    System.err.println("❌ Erreur lors de l'import automatique de " + fileName + ": " + e.getMessage());
                                }
                            }
                        }
                        
                        key.reset();
                    }
                } catch (InterruptedException e) {
                    System.out.println("🛑 Surveillance du dossier models arrêtée");
                }
            }).start();

        } catch (Exception e) {
            System.err.println("❌ Erreur lors du démarrage de la surveillance: " + e.getMessage());
        }
    }

    /**
     * Crée un modèle d'exemple dans le watch-folder
     */
    public void createExampleModel() {
        try {
            Path modelsPath = Paths.get(modelsFolderPath);
            if (!Files.exists(modelsPath)) {
                Files.createDirectories(modelsPath);
            }

            Path exampleFile = modelsPath.resolve("exemple_TRXBO_CM.json");
            
            if (!Files.exists(exampleFile)) {
                Map<String, Object> exampleModel = new HashMap<>();
                exampleModel.put("name", "TRXBO Cameroun");
                exampleModel.put("filePattern", ".*TRXBO.*CM.*\\.(csv|xlsx?)$");
                exampleModel.put("fileType", "bo");
                exampleModel.put("autoApply", true);
                exampleModel.put("templateFile", "");

                // Clés de réconciliation
                Map<String, Object> reconciliationKeys = new HashMap<>();
                reconciliationKeys.put("boKeys", Arrays.asList("IDTransaction", "Numéro Transaction"));
                reconciliationKeys.put("partnerKeys", Arrays.asList("External ID", "Transaction ID"));
                exampleModel.put("reconciliationKeys", reconciliationKeys);

                // Règles de traitement des colonnes
                List<Map<String, Object>> columnRules = new ArrayList<>();
                
                Map<String, Object> rule1 = new HashMap<>();
                rule1.put("sourceColumn", "IDTransaction");
                rule1.put("targetColumn", "ID Transaction");
                rule1.put("formatType", "string");
                rule1.put("trimSpaces", true);
                rule1.put("ruleOrder", 1);
                columnRules.add(rule1);

                Map<String, Object> rule2 = new HashMap<>();
                rule2.put("sourceColumn", "Montant");
                rule2.put("targetColumn", "Montant (XAF)");
                rule2.put("formatType", "numeric");
                rule2.put("trimSpaces", true);
                rule2.put("ruleOrder", 2);
                columnRules.add(rule2);

                exampleModel.put("columnProcessingRules", columnRules);

                String jsonContent = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(exampleModel);
                Files.writeString(exampleFile, jsonContent);

                System.out.println("📄 Modèle d'exemple créé: " + exampleFile.toAbsolutePath());
            }

        } catch (Exception e) {
            System.err.println("❌ Erreur lors de la création du modèle d'exemple: " + e.getMessage());
        }
    }

    // Méthodes utilitaires privées

    private String getStringValue(JsonNode node, String fieldName, String defaultValue) {
        return node.has(fieldName) ? node.get(fieldName).asText() : defaultValue;
    }

    private boolean getBooleanValue(JsonNode node, String fieldName, boolean defaultValue) {
        return node.has(fieldName) ? node.get(fieldName).asBoolean() : defaultValue;
    }

    private AutoProcessingModel.FileType parseFileType(String fileType) {
        if (!StringUtils.hasText(fileType)) {
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

    private ColumnProcessingRule parseColumnProcessingRule(JsonNode ruleNode) {
        if (ruleNode == null) {
            return null;
        }

        ColumnProcessingRule rule = new ColumnProcessingRule();

        rule.setSourceColumn(getStringValue(ruleNode, "sourceColumn", ""));
        rule.setTargetColumn(getStringValue(ruleNode, "targetColumn", ""));
        rule.setFormatType(getStringValue(ruleNode, "formatType", "string"));
        rule.setToUpperCase(getBooleanValue(ruleNode, "toUpperCase", false));
        rule.setToLowerCase(getBooleanValue(ruleNode, "toLowerCase", false));
        rule.setTrimSpaces(getBooleanValue(ruleNode, "trimSpaces", false));
        rule.setRemoveSpecialChars(getBooleanValue(ruleNode, "removeSpecialChars", false));
        rule.setRemoveAccents(getBooleanValue(ruleNode, "removeAccents", false));
        rule.setPadZeros(getBooleanValue(ruleNode, "padZeros", false));
        rule.setRegexReplace(getStringValue(ruleNode, "regexReplace", ""));
        rule.setRuleOrder(getIntegerValue(ruleNode, "ruleOrder", 0));

        // Charger le mapping des caractères spéciaux
        if (ruleNode.has("specialCharReplacementMap")) {
            try {
                Map<String, String> replacementMap = objectMapper.convertValue(
                    ruleNode.get("specialCharReplacementMap"), 
                    new TypeReference<Map<String, String>>() {}
                );
                rule.setSpecialCharReplacementMap(replacementMap);
            } catch (Exception e) {
                System.err.println("⚠️ Erreur lors du chargement du mapping des caractères spéciaux: " + e.getMessage());
            }
        }

        return rule;
    }

    private int getIntegerValue(JsonNode node, String fieldName, int defaultValue) {
        return node.has(fieldName) ? node.get(fieldName).asInt() : defaultValue;
    }
}
