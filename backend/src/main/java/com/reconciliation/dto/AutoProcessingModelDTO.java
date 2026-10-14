package com.reconciliation.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.reconciliation.entity.AutoProcessingModel;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public class AutoProcessingModelDTO {
    
    private Long id;
    
    @JsonProperty("modelId")
    private String modelId;
    
    @JsonProperty("name")
    private String name;
    
    @JsonProperty("filePattern")
    private String filePattern;
    
    @JsonProperty("fileType")
    private String fileType;
    
    @JsonProperty("autoApply")
    private boolean autoApply;
    
    @JsonProperty("templateFile")
    private String templateFile;
    
    @JsonProperty("createdAt")
    private LocalDateTime createdAt;
    
    @JsonProperty("updatedAt")
    private LocalDateTime updatedAt;
    
    @JsonProperty("reconciliationKeys")
    private Map<String, Object> reconciliationKeys;
    
    @JsonProperty("reconciliationLogic")
    private Map<String, Object> reconciliationLogic;
    
    @JsonProperty("correspondenceRules")
    private Map<String, Object> correspondenceRules;
    
    @JsonProperty("comparisonColumns")
    private Map<String, Object> comparisonColumns;
    
    @JsonProperty("columnProcessingRules")
    private List<ColumnProcessingRuleDTO> columnProcessingRules;
    
    @JsonProperty("preProcessingConfig")
    private Map<String, Object> preProcessingConfig;
    
    // Constructeurs
    public AutoProcessingModelDTO() {}
    
    public AutoProcessingModelDTO(AutoProcessingModel entity) {
        this.id = entity.getId();
        this.modelId = entity.getModelId();
        this.name = entity.getName();
        this.filePattern = entity.getFilePattern();
        this.fileType = entity.getFileType() != null ? entity.getFileType().getValue() : null;
        this.autoApply = entity.isAutoApply();
        this.templateFile = entity.getTemplateFile();
        this.createdAt = entity.getCreatedAt();
        this.updatedAt = entity.getUpdatedAt();
        this.reconciliationKeys = entity.getReconciliationKeys();
        this.reconciliationLogic = entity.getReconciliationLogic();
        this.correspondenceRules = entity.getCorrespondenceRules();
        this.comparisonColumns = entity.getComparisonColumns();
        this.preProcessingConfig = entity.getPreProcessingConfig();
        
        // Convertir les règles de traitement des colonnes
        if (entity.getColumnProcessingRules() != null) {
            this.columnProcessingRules = entity.getColumnProcessingRules().stream()
                .map(this::convertToDTO)
                .toList();
        }
    }
    
    private ColumnProcessingRuleDTO convertToDTO(com.reconciliation.entity.ColumnProcessingRule entity) {
        ColumnProcessingRuleDTO dto = new ColumnProcessingRuleDTO();
        dto.setId(entity.getId());
        dto.setSourceColumn(entity.getSourceColumn());
        dto.setTargetColumn(entity.getTargetColumn());
        dto.setFormatType(entity.getFormatType());
        dto.setToUpperCase(entity.isToUpperCase());
        dto.setToLowerCase(entity.isToLowerCase());
        dto.setTrimSpaces(entity.isTrimSpaces());
        dto.setRemoveSpecialChars(entity.isRemoveSpecialChars());
        dto.setPadZeros(entity.isPadZeros());
        dto.setRegexReplace(entity.getRegexReplace());
        dto.setSpecialCharReplacementMap(entity.getSpecialCharReplacementMap());
        dto.setRuleOrder(entity.getRuleOrder());
        return dto;
    }
    
    // Getters et Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public String getModelId() {
        return modelId;
    }
    
    public void setModelId(String modelId) {
        this.modelId = modelId;
    }
    
    public String getName() {
        return name;
    }
    
    public void setName(String name) {
        this.name = name;
    }
    
    public String getFilePattern() {
        return filePattern;
    }
    
    public void setFilePattern(String filePattern) {
        this.filePattern = filePattern;
    }
    
    public String getFileType() {
        return fileType;
    }
    
    public void setFileType(String fileType) {
        this.fileType = fileType;
    }
    
    public boolean isAutoApply() {
        return autoApply;
    }
    
    public void setAutoApply(boolean autoApply) {
        this.autoApply = autoApply;
    }
    
    public String getTemplateFile() {
        return templateFile;
    }
    
    public void setTemplateFile(String templateFile) {
        this.templateFile = templateFile;
    }
    
    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
    
    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
    
    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
    
    public Map<String, Object> getReconciliationKeys() {
        return reconciliationKeys;
    }
    
    public void setReconciliationKeys(Map<String, Object> reconciliationKeys) {
        this.reconciliationKeys = reconciliationKeys;
    }
    
    public Map<String, Object> getReconciliationLogic() {
        return reconciliationLogic;
    }
    
    public void setReconciliationLogic(Map<String, Object> reconciliationLogic) {
        this.reconciliationLogic = reconciliationLogic;
    }
    
    public Map<String, Object> getCorrespondenceRules() {
        return correspondenceRules;
    }
    
    public void setCorrespondenceRules(Map<String, Object> correspondenceRules) {
        this.correspondenceRules = correspondenceRules;
    }
    
    public Map<String, Object> getComparisonColumns() {
        return comparisonColumns;
    }
    
    public void setComparisonColumns(Map<String, Object> comparisonColumns) {
        this.comparisonColumns = comparisonColumns;
    }
    
    public List<ColumnProcessingRuleDTO> getColumnProcessingRules() {
        return columnProcessingRules;
    }
    
    public void setColumnProcessingRules(List<ColumnProcessingRuleDTO> columnProcessingRules) {
        this.columnProcessingRules = columnProcessingRules;
    }
    
    public Map<String, Object> getPreProcessingConfig() {
        return preProcessingConfig;
    }
    
    public void setPreProcessingConfig(Map<String, Object> preProcessingConfig) {
        this.preProcessingConfig = preProcessingConfig;
    }
    
    @Override
    public String toString() {
        return "AutoProcessingModelDTO{" +
                "id=" + id +
                ", modelId='" + modelId + '\'' +
                ", name='" + name + '\'' +
                ", filePattern='" + filePattern + '\'' +
                ", fileType='" + fileType + '\'' +
                ", autoApply=" + autoApply +
                ", templateFile='" + templateFile + '\'' +
                ", reconciliationLogic=" + reconciliationLogic +
                ", correspondenceRules=" + correspondenceRules +
                ", comparisonColumns=" + comparisonColumns +
                ", columnProcessingRules=" + columnProcessingRules +
                '}';
    }
}
