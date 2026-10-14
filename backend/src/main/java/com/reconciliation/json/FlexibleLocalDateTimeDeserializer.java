package com.reconciliation.json;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;

import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;

/**
 * Accepte les dates envoyées par le frontend (yyyy-MM-dd, yyyy-MM-ddTHH:mm:ss, ISO avec Z).
 */
public class FlexibleLocalDateTimeDeserializer extends JsonDeserializer<LocalDateTime> {

    private static final List<DateTimeFormatter> DATE_TIME_FORMATTERS = List.of(
            DateTimeFormatter.ISO_LOCAL_DATE_TIME,
            DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss"),
            DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm"),
            DateTimeFormatter.ofPattern("uuuuMMdd'T'HH:mm:ss"),
            DateTimeFormatter.ofPattern("uuuuMMdd'T'HH:mm"),
            DateTimeFormatter.ofPattern("uuuuMMdd HH:mm:ss"),
            DateTimeFormatter.ofPattern("uuuuMMdd HH:mm"),
            DateTimeFormatter.ofPattern("dd/MM/uuuu HH:mm:ss"),
            DateTimeFormatter.ofPattern("dd/MM/uuuu HH:mm"),
            DateTimeFormatter.ofPattern("dd-MM-uuuu HH:mm:ss"),
            DateTimeFormatter.ofPattern("dd-MM-uuuu HH:mm")
    );

    private static final List<DateTimeFormatter> DATE_FORMATTERS = List.of(
            DateTimeFormatter.ISO_LOCAL_DATE,
            DateTimeFormatter.BASIC_ISO_DATE,
            DateTimeFormatter.ofPattern("dd/MM/uuuu"),
            DateTimeFormatter.ofPattern("dd-MM-uuuu"),
            DateTimeFormatter.ofPattern("dd.MM.uuuu")
    );

    @Override
    public LocalDateTime deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        String raw = parser.getValueAsString();
        if (raw == null || raw.isBlank()) {
            return null;
        }

        String value = raw.trim();

        try {
            return OffsetDateTime.parse(value, DateTimeFormatter.ISO_OFFSET_DATE_TIME).toLocalDateTime();
        } catch (DateTimeParseException ignored) {
        }

        for (DateTimeFormatter formatter : DATE_TIME_FORMATTERS) {
            try {
                return LocalDateTime.parse(value, formatter);
            } catch (DateTimeParseException ignored) {
            }
        }

        for (DateTimeFormatter formatter : DATE_FORMATTERS) {
            try {
                return LocalDate.parse(value, formatter).atStartOfDay();
            } catch (DateTimeParseException ignored) {
            }
        }

        throw new IOException("Format de date invalide: " + raw);
    }
}
