package com.reconciliation.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Map;

public class ColumnProcessingRuleDTO {
    
    private Long id;
    
    @JsonProperty("sourceColumn")
    private String sourceColumn;
    
    @JsonProperty("targetColumn")
    private String targetColumn;
    
    @JsonProperty("formatType")
    private String formatType;
    
    @JsonProperty("toUpperCase")
    private boolean toUpperCase = false;
    
    @JsonProperty("toLowerCase")
    private boolean toLowerCase = false;
    
    @JsonProperty("trimSpaces")
    private boolean trimSpaces = false;
    
    @JsonProperty("removeSpecialChars")
    private boolean removeSpecialChars = false;
    
    @JsonProperty("removeAccents")
    private boolean removeAccents = false;
    
    @JsonProperty("padZeros")
    private boolean padZeros = false;
    
    @JsonProperty("regexReplace")
    private String regexReplace;
    
    @JsonProperty("stringToRemove")
    private String stringToRemove;
    
    @JsonProperty("specialCharReplacementMap")
    private Map<String, String> specialCharReplacementMap;
    
    @JsonProperty("ruleOrder")
    private Integer ruleOrder = 0;
    
    // Constructeurs
    public ColumnProcessingRuleDTO() {}
    
    public ColumnProcessingRuleDTO(String sourceColumn, String targetColumn) {
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
        return "ColumnProcessingRuleDTO{" +
                "id=" + id +
                ", sourceColumn='" + sourceColumn + '\'' +
                ", targetColumn='" + targetColumn + '\'' +
                ", formatType='" + formatType + '\'' +
                ", toUpperCase=" + toUpperCase +
                ", toLowerCase=" + toLowerCase +
                ", trimSpaces=" + trimSpaces +
                ", removeSpecialChars=" + removeSpecialChars +
                ", padZeros=" + padZeros +
                ", ruleOrder=" + ruleOrder +
                '}';
    }
}
