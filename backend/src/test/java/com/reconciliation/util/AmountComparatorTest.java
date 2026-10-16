package com.reconciliation.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AmountComparatorTest {

    @Test
    void matchesFormattedAmounts() {
        assertThat(AmountComparator.valuesMatch("1000", "1 000")).isTrue();
        assertThat(AmountComparator.valuesMatch("1000.00", "1000")).isTrue();
        assertThat(AmountComparator.valuesMatch("1 000,00", "1000")).isTrue();
        assertThat(AmountComparator.valuesMatch("1000.01", "1000")).isTrue();
        assertThat(AmountComparator.valuesMatch("1000.02", "1000")).isFalse();
        assertThat(AmountComparator.valuesMatch("ABC", "ABC")).isTrue();
        assertThat(AmountComparator.valuesMatch("ABC", "ABD")).isFalse();
        assertThat(AmountComparator.valuesMatch("", "1000")).isFalse();
    }
}
