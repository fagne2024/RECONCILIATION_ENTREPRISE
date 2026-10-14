package com.reconciliation.json;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.reconciliation.entity.OPPARTEntity;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class FlexibleLocalDateTimeDeserializerTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void deserializesOppartBatchWithCompactDateAndTime() throws Exception {
        List<OPPARTEntity> rows = objectMapper.readValue(
                "[{\"client\":\"TEST\",\"dateOperation\":\"20260924 14:39:33\"}]",
                new TypeReference<List<OPPARTEntity>>() {
                }
        );

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getDateOperation())
                .isEqualTo(LocalDateTime.of(2026, 9, 24, 14, 39, 33));
    }

    @Test
    void deserializesCommonDateFormats() throws Exception {
        assertThat(readDate("2026-09-24 14:39:33"))
                .isEqualTo(LocalDateTime.of(2026, 9, 24, 14, 39, 33));
        assertThat(readDate("2026-09-24T14:39:33Z"))
                .isEqualTo(LocalDateTime.of(2026, 9, 24, 14, 39, 33));
        assertThat(readDate("20260924"))
                .isEqualTo(LocalDateTime.of(2026, 9, 24, 0, 0));
        assertThat(readDate("24/09/2026 14:39"))
                .isEqualTo(LocalDateTime.of(2026, 9, 24, 14, 39));
    }

    private LocalDateTime readDate(String value) throws Exception {
        OPPARTEntity row = objectMapper.readValue(
                "{\"dateOperation\":\"" + value + "\"}",
                OPPARTEntity.class
        );
        return row.getDateOperation();
    }
}
