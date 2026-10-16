package com.reconciliation.util;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

/**
 * Compare des valeurs de réconciliation : trim, espaces de milliers, virgule
 * décimale, puis {@link BigDecimal} si les deux côtés sont numériques.
 */
public final class AmountComparator {

    private static final BigDecimal DEFAULT_TOLERANCE = new BigDecimal("0.01");

    private AmountComparator() {}

    public static boolean valuesMatch(String left, String right) {
        if (Objects.equals(left, right)) {
            return true;
        }
        String a = normalize(left);
        String b = normalize(right);
        if (Objects.equals(a, b)) {
            return true;
        }
        if (a.isEmpty() || b.isEmpty()) {
            return false;
        }
        BigDecimal da = parseAmount(a);
        BigDecimal db = parseAmount(b);
        if (da == null || db == null) {
            return false;
        }
        return da.subtract(db).abs().compareTo(DEFAULT_TOLERANCE) <= 0;
    }

    static String normalize(String raw) {
        if (raw == null) {
            return "";
        }
        String s = raw.trim().replace("\u00a0", " ").replace(" ", "");
        if (s.contains(",") && s.contains(".")) {
            s = s.replace(",", "");
        } else if (s.contains(",")) {
            s = s.replace(',', '.');
        }
        return s;
    }

    static BigDecimal parseAmount(String normalized) {
        try {
            return new BigDecimal(normalized).setScale(4, RoundingMode.HALF_UP);
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
