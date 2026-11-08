package com.reconciliation.service.traitement;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Règles de transformation du traitement, reprises du client
 * ({@code components/traitement/traitement.component.ts}) pour produire les mêmes résultats.
 *
 * <ul>
 *   <li>Nombre : {@code parseFloat(valeur sans espaces, virgule remplacée par point)} ; si le
 *       résultat n'est pas un nombre, la valeur d'origine est conservée.</li>
 *   <li>Date : seules les dates ISO sont converties (comme {@code new Date(...)} côté client
 *       pour ces formats) ; les autres valeurs sont conservées.</li>
 *   <li>Dédoublonnage : clé = valeurs des colonnes, sans espaces de bord, en minuscules.</li>
 * </ul>
 */
public final class TraitementTransformations {

    /** Préfixe numérique reconnu par parseFloat (ex. "12abc" -> 12). */
    private static final Pattern PREFIXE_NOMBRE =
            Pattern.compile("^[+-]?(\\d+\\.?\\d*|\\.\\d+)([eE][+-]?\\d+)?");
    private static final String SEPARATEUR_CLE = "||";

    private static final DateTimeFormatter ISO_DATE_HEURE =
            DateTimeFormatter.ofPattern("uuuu-MM-dd['T'][' ']HH:mm[:ss][.SSS]");

    private TraitementTransformations() {
    }

    /**
     * Convertit une valeur en nombre comme {@code parseFloat} côté client.
     *
     * @return le nombre, ou {@code null} si la valeur ne commence pas par un nombre
     */
    public static Double parseFloatJs(String valeur) {
        if (valeur == null) {
            return null;
        }
        // Espaces (y compris insécables) retirés, puis première virgule remplacée par un point.
        String nettoye = valeur.replaceAll("[\\s\\u00A0]", "").replaceFirst(",", ".");
        Matcher m = PREFIXE_NOMBRE.matcher(nettoye);
        if (!m.find()) {
            return null;
        }
        return Double.parseDouble(m.group());
    }

    /**
     * Valeur convertie en nombre si possible, sinon valeur d'origine.
     */
    public static Object convertirNombre(Object valeur) {
        if (valeur == null || valeur instanceof Number) {
            return valeur;
        }
        String texte = String.valueOf(valeur);
        if (texte.isEmpty()) {
            return texte;
        }
        Double nombre = parseFloatJs(texte);
        return nombre == null ? valeur : nombre;
    }

    /**
     * Convertit une date ISO (yyyy-MM-dd, avec heure optionnelle) au format demandé.
     * Les autres valeurs sont renvoyées telles quelles.
     *
     * @param format motif avec les jetons yyyy, MM, dd, HH, mm, ss (ex. {@code dd/MM/yyyy})
     */
    public static String convertirDate(Object valeur, String format) {
        if (valeur == null) {
            return null;
        }
        String texte = String.valueOf(valeur).trim();
        if (texte.isEmpty()) {
            return texte;
        }
        if (texte.endsWith(".0")) {
            texte = texte.substring(0, texte.length() - 2);
        }
        LocalDateTime date = parserIso(texte);
        if (date == null) {
            return String.valueOf(valeur);
        }
        return appliquerFormat(date, format == null || format.isBlank() ? "yyyy-MM-dd" : format);
    }

    /** Clé de dédoublonnage : valeurs des colonnes, espaces retirés et en minuscules. */
    public static String cleDedoublonnage(List<String> colonnes, Map<String, Object> ligne) {
        StringBuilder cle = new StringBuilder();
        for (int i = 0; i < colonnes.size(); i++) {
            if (i > 0) {
                cle.append(SEPARATEUR_CLE);
            }
            Object v = ligne.get(colonnes.get(i));
            cle.append(v == null ? "" : String.valueOf(v).trim().toLowerCase());
        }
        return cle.toString();
    }

    /** Vrai si la valeur (texte) appartient à la liste des valeurs retenues. */
    public static boolean appartient(Object valeur, List<String> valeursRetenues) {
        String texte = valeur == null ? "" : String.valueOf(valeur);
        return valeursRetenues.contains(texte);
    }

    // ------------------------------------------------------------------

    private static LocalDateTime parserIso(String texte) {
        try {
            return LocalDateTime.parse(texte, ISO_DATE_HEURE);
        } catch (DateTimeParseException e) {
            try {
                return LocalDate.parse(texte).atStartOfDay();
            } catch (DateTimeParseException e2) {
                return null;
            }
        }
    }

    /** Applique les jetons comme le fait formatDate côté client (remplacements successifs). */
    static String appliquerFormat(LocalDateTime d, String format) {
        String r = format
                .replace("yyyy", String.format("%04d", d.getYear()))
                .replace("MM", String.format("%02d", d.getMonthValue()))
                .replace("dd", String.format("%02d", d.getDayOfMonth()))
                .replace("HH", String.format("%02d", d.getHour()))
                .replace("mm", String.format("%02d", d.getMinute()))
                .replace("ss", String.format("%02d", d.getSecond()));
        return r;
    }
}
