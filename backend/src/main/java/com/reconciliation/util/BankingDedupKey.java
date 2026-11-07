package com.reconciliation.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Locale;

/**
 * Clé de déduplication des lignes bancaires importées (opérations, relevé, suivi compense OP).
 *
 * <p>Deux lignes qui ont les mêmes valeurs métier (après normalisation : casse, espaces,
 * montants arrondis au centime) donnent la même clé. La clé est un SHA-256 hexadécimal
 * (64 caractères), stocké dans la colonne {@code dedup_key}.</p>
 */
public final class BankingDedupKey {

    private BankingDedupKey() {
    }

    /** Clé à partir des valeurs métier, dans l'ordre donné. Les valeurs nulles comptent comme vides. */
    public static String of(Object... parts) {
        StringBuilder sb = new StringBuilder();
        for (Object part : parts) {
            sb.append(normalize(part)).append('\u001F');
        }
        return sha256(sb.toString());
    }

    static String normalize(Object value) {
        if (value == null) {
            return "";
        }
        if (value instanceof Double d) {
            return String.format(Locale.ROOT, "%.2f", d);
        }
        if (value instanceof LocalDate d) {
            return d.toString();
        }
        if (value instanceof LocalDateTime dt) {
            // À la minute près : l'horodatage du fichier suffit à identifier une opération.
            return dt.withSecond(0).withNano(0).toString();
        }
        return String.valueOf(value).trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }

    private static String sha256(String text) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 indisponible", e);
        }
    }
}
