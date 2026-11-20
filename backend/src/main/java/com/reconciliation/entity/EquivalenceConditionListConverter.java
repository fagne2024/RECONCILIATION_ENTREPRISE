package com.reconciliation.entity;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/** Conditions de choix d'équivalent stockées en JSON (colonne TEXT). */
@Converter
public class EquivalenceConditionListConverter implements AttributeConverter<List<EquivalenceCondition>, String> {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public String convertToDatabaseColumn(List<EquivalenceCondition> attribute) {
        if (attribute == null || attribute.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(attribute);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Erreur lors de la sérialisation JSON des conditions", e);
        }
    }

    @Override
    public List<EquivalenceCondition> convertToEntityAttribute(String dbData) {
        if (dbData == null || dbData.isBlank()) {
            return new ArrayList<>();
        }
        try {
            return objectMapper.readValue(dbData, new TypeReference<List<EquivalenceCondition>>() {});
        } catch (IOException e) {
            throw new RuntimeException("Erreur lors de la désérialisation JSON des conditions", e);
        }
    }
}
