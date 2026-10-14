package com.reconciliation.entity;

import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonBackReference;
import java.util.Map;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "column_processing_rules")
public class ColumnProcessingRule {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "auto_processing_model_id")
    @JsonBackReference
    private AutoProcessingModel autoProcessingModel;
    
    @Column(name = "source_column", nullable = false)
    private String sourceColumn;
    
    @Column(name = "target_column", nullable = false)
    private String targetColumn;
    
    @Column(name = "format_type")
    private String formatType;
    
    @Column(name = "to_upper_case")
    private boolean toUpperCase = false;
    
    @Column(name = "to_lower_case")
    private boolean toLowerCase = false;
    
    @Column(name = "trim_spaces")
    private boolean trimSpaces = false;
    
    @Column(name = "remove_special_chars")
    private boolean removeSpecialChars = false;
    
    @Column(name = "remove_accents")
    private boolean removeAccents = false;
    
    @Column(name = "pad_zeros")
    private boolean padZeros = false;
    
    @Column(name = "regex_replace")
    private String regexReplace;
    
    @Column(name = "string_to_remove")
    private String stringToRemove;
    
    @Convert(converter = JsonConverter.class)
    @Column(columnDefinition = "TEXT")
    private Map<String, String> specialCharReplacementMap;
    
    @Column(name = "rule_order")
    private Integer ruleOrder = 0;
    
    // Constructeurs
    public ColumnProcessingRule() {}
    
    public ColumnProcessingRule(String sourceColumn, String targetColumn) {
        this.sourceColumn = sourceColumn;
        this.targetColumn = targetColumn;
    }
    
    // Getters et Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public AutoProcessingModel getAutoProcessingModel() {
        return autoProcessingModel;
    }
    
    public void setAutoProcessingModel(AutoProcessingModel autoProcessingModel) {
        this.autoProcessingModel = autoProcessingModel;
    }
    
    public String getSourceColumn() {
        return sourceColumn;
    }
    
    public void setSourceColumn(String sourceColumn) {
        this.sourceColumn = sourceColumn;
    }
    
    public String getTargetColumn() {
        return targetColumn;
    }
    
    public void setTargetColumn(String targetColumn) {
        this.targetColumn = targetColumn;
    }
    
    public String getFormatType() {
        return formatType;
    }
    
    public void setFormatType(String formatType) {
        this.formatType = formatType;
    }
    
    public boolean isToUpperCase() {
        return toUpperCase;
    }
    
    public void setToUpperCase(boolean toUpperCase) {
        this.toUpperCase = toUpperCase;
    }
    
    public boolean isToLowerCase() {
        return toLowerCase;
    }
    
    public void setToLowerCase(boolean toLowerCase) {
        this.toLowerCase = toLowerCase;
    }
    
    public boolean isTrimSpaces() {
        return trimSpaces;
    }
    
    public void setTrimSpaces(boolean trimSpaces) {
        this.trimSpaces = trimSpaces;
    }
    
    public boolean isRemoveSpecialChars() {
        return removeSpecialChars;
    }
    
    public void setRemoveSpecialChars(boolean removeSpecialChars) {
        this.removeSpecialChars = removeSpecialChars;
    }
    
    public boolean isRemoveAccents() {
        return removeAccents;
    }
    
    public void setRemoveAccents(boolean removeAccents) {
        this.removeAccents = removeAccents;
    }
    
    public boolean isPadZeros() {
        return padZeros;
    }
    
    public void setPadZeros(boolean padZeros) {
        this.padZeros = padZeros;
    }
    
    public String getRegexReplace() {
        return regexReplace;
    }
    
    public void setRegexReplace(String regexReplace) {
        this.regexReplace = regexReplace;
    }
    
    public String getStringToRemove() {
        return stringToRemove;
    }
    
    public void setStringToRemove(String stringToRemove) {
        this.stringToRemove = stringToRemove;
    }
    
    public Map<String, String> getSpecialCharReplacementMap() {
        return specialCharReplacementMap;
    }
    
    public void setSpecialCharReplacementMap(Map<String, String> specialCharReplacementMap) {
        this.specialCharReplacementMap = specialCharReplacementMap;
    }
    
    public Integer getRuleOrder() {
        return ruleOrder;
    }
    
    public void setRuleOrder(Integer ruleOrder) {
        this.ruleOrder = ruleOrder;
    }
    
    @Override
    public String toString() {
        return "ColumnProcessingRule{" +
                "id=" + id +
                ", sourceColumn='" + sourceColumn + '\'' +
                ", targetColumn='" + targetColumn + '\'' +
                ", formatType='" + formatType + '\'' +
                ", toUpperCase=" + toUpperCase +
                ", toLowerCase=" + toLowerCase +
                ", trimSpaces=" + trimSpaces +
                ", removeSpecialChars=" + removeSpecialChars +
                ", removeAccents=" + removeAccents +
                ", padZeros=" + padZeros +
                ", stringToRemove='" + stringToRemove + '\'' +
                ", ruleOrder=" + ruleOrder +
                '}';
    }
}
