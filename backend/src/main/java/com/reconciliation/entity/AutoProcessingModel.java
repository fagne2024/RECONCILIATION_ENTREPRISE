package com.reconciliation.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.ArrayList;
import com.fasterxml.jackson.annotation.JsonValue;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.annotation.JsonManagedReference;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "auto_processing_models")
public class AutoProcessingModel {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;
    
    @Column(unique = true)
    private String modelId;
    
    @Column(nullable = false)
    private String name;
    
    @Column(name = "file_pattern")
    private String filePattern;
    
    @Enumerated(EnumType.STRING)
    @Column(name = "file_type")
    @JsonDeserialize(using = FileTypeDeserializer.class)
    private FileType fileType;
    
    @Column(name = "auto_apply")
    private boolean autoApply;
    
    @Column(name = "template_file")
    private String templateFile;
    
    @Column(name = "created_at")
    private LocalDateTime createdAt;
    
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
    
    // Suppression de la relation avec ProcessingStep
    
    @Convert(converter = JsonConverter.class)
    @Column(columnDefinition = "TEXT")
    private Map<String, Object> reconciliationKeys;
    
    @Convert(converter = JsonConverter.class)
    @Column(name = "reconciliation_logic", columnDefinition = "TEXT")
    private Map<String, Object> reconciliationLogic;
    
    @Convert(converter = JsonConverter.class)
    @Column(name = "correspondence_rules", columnDefinition = "TEXT")
    private Map<String, Object> correspondenceRules;
    
    @Convert(converter = JsonConverter.class)
    @Column(name = "comparison_columns", columnDefinition = "TEXT")
    private Map<String, Object> comparisonColumns;
    
    @Convert(converter = JsonConverter.class)
    @Column(name = "pre_processing_config", columnDefinition = "TEXT")
    private Map<String, Object> preProcessingConfig;
    
    @OneToMany(mappedBy = "autoProcessingModel", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @JsonManagedReference
    @OrderBy("ruleOrder ASC")
    private List<ColumnProcessingRule> columnProcessingRules = new ArrayList<>();
    
    public enum FileType {
        BO("bo"),
        PARTNER("partner"),
        BOTH("both"),
        OPERATION("operation");
        
        private final String value;
        
        FileType(String value) {
            this.value = value;
        }
        
        @JsonValue
        public String getValue() {
            return value;
        }
        
        public static FileType fromString(String text) {
            for (FileType type : FileType.values()) {
                if (type.value.equalsIgnoreCase(text)) {
                    return type;
                }
            }
            throw new IllegalArgumentException("Valeur invalide pour FileType: " + text);
        }
    }
    
    // Constructeurs
    public AutoProcessingModel() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
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
    
    public FileType getFileType() {
        return fileType;
    }
    
    public void setFileType(FileType fileType) {
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
    
    // Suppression des getters/setters pour ProcessingStep
    
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
    
    public Map<String, Object> getPreProcessingConfig() {
        return preProcessingConfig;
    }
    
    public void setPreProcessingConfig(Map<String, Object> preProcessingConfig) {
        this.preProcessingConfig = preProcessingConfig;
    }
    
    public List<ColumnProcessingRule> getColumnProcessingRules() {
        return columnProcessingRules;
    }
    
    public void setColumnProcessingRules(List<ColumnProcessingRule> columnProcessingRules) {
        this.columnProcessingRules = columnProcessingRules;
    }
    
    public void addColumnProcessingRule(ColumnProcessingRule rule) {
        columnProcessingRules.add(rule);
        rule.setAutoProcessingModel(this);
    }
    
    public void removeColumnProcessingRule(ColumnProcessingRule rule) {
        columnProcessingRules.remove(rule);
        rule.setAutoProcessingModel(null);
    }
    
    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
} 