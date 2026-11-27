package com.reconciliation.util;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;

/**
 * Heures de lancement quotidiennes des jobs configurables (synchronisation SharePoint,
 * préparation BigQuery) : saisie « 8h, 14:30 », créneau dû et prochain lancement.
 */
public final class HeuresLancement {

    private static final DateTimeFormatter HH_MM = DateTimeFormatter.ofPattern("HH:mm");
    private static final int MAX_HEURES = 24;

    private HeuresLancement() {}

    /** « 8h, 14:30 ; 08:00 » → « 08:00,14:30 ». */
    public static String normalize(String raw) {
        List<LocalTime> heures = parse(raw);
        if (heures.isEmpty()) throw new IllegalArgumentException("Indiquez au moins une heure de lancement (HH:mm).");
        List<String> out = new ArrayList<>();
        for (LocalTime h : heures) out.add(h.format(HH_MM));
        return String.join(",", out);
    }

    /** Heures triées et sans doublon. */
    public static List<LocalTime> parse(String raw) {
        TreeSet<LocalTime> set = new TreeSet<>();
        if (raw != null) {
            for (String part : raw.split("[,;\\s]+")) {
                String p = part.trim().toLowerCase().replace('h', ':');
                if (p.isEmpty()) continue;
                if (p.endsWith(":")) p = p + "00";
                if (p.matches("\\d{1,2}")) p = p + ":00";
                try {
                    set.add(LocalTime.parse(p.length() == 4 ? "0" + p : p, HH_MM));
                } catch (DateTimeParseException e) {
                    throw new IllegalArgumentException("Heure invalide : « " + part.trim() + " » (format HH:mm attendu).");
                }
            }
        }
        if (set.size() > MAX_HEURES) throw new IllegalArgumentException("Au plus " + MAX_HEURES + " heures de lancement.");
        return new ArrayList<>(set);
    }

    /** Créneau du jour le plus récent déjà atteint et pas encore exécuté (null sinon). */
    public static LocalDateTime dueSlot(List<LocalTime> heures, LocalDateTime now, LocalDateTime lastRun) {
        LocalDateTime best = null;
        for (LocalTime h : heures) {
            LocalDateTime slot = now.toLocalDate().atTime(h);
            if (!slot.isAfter(now) && (best == null || slot.isAfter(best))) best = slot;
        }
        if (best == null) return null;
        if (lastRun != null && !lastRun.isBefore(best)) return null;
        return best;
    }

    /** Prochain lancement prévu (pour affichage). */
    public static LocalDateTime nextSlot(List<LocalTime> heures, LocalDateTime now, LocalDateTime lastRun) {
        if (heures.isEmpty()) return null;
        if (dueSlot(heures, now, lastRun) != null) return now; // créneau en attente : lancé dans la minute
        for (int day = 0; day <= 1; day++) {
            for (LocalTime h : heures) {
                LocalDateTime slot = now.toLocalDate().plusDays(day).atTime(h);
                if (slot.isAfter(now)) return slot;
            }
        }
        return null;
    }
}
