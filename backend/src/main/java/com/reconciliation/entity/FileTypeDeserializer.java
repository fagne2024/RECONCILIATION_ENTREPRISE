package com.reconciliation.entity;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import java.io.IOException;

public class FileTypeDeserializer extends JsonDeserializer<AutoProcessingModel.FileType> {
    
    @Override
    public AutoProcessingModel.FileType deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
        String value = p.getValueAsString();
        if (value == null) {
            return null;
        }
        return AutoProcessingModel.FileType.fromString(value);
    }
} 