package com.reconciliation.config;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration Jackson pour le streaming et la robustesse de désérialisation de gros JSON.
 *
 * Les propriétés ignorées de application.properties (spring.mvc.max-request-size,
 * spring.web.max-request-size, spring.jackson.stream-reader.features.*) ne sont pas
 * prises en compte par Spring Boot : on applique donc ici la configuration réelle via
 * Jackson2ObjectMapperBuilderCustomizer.
 */
@Configuration
public class JacksonConfig {

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer reconciliationJacksonCustomizer() {
        return builder -> builder
                // Champs non quotés / quotes simples tolérés à la lecture
                .featuresToEnable(JsonParser.Feature.ALLOW_UNQUOTED_FIELD_NAMES)
                .featuresToEnable(JsonParser.Feature.ALLOW_SINGLE_QUOTES)
                // Ignorer les propriétés inconnues (robustesse face aux évolutions)
                .featuresToDisable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                // Traiter les flottants comme BigDecimal (évite toute perte de précision)
                .featuresToEnable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS);
    }
}
