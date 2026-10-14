package com.reconciliation.util;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Normalisation pays (codes ISO / noms) pour les filtres SQL result8rec et écarts BO.
 */
public final class CountryNormalizationUtil {

    private static final Map<String, String> CODE_TO_NAME = initCodeToName();
    private static final Map<String, String> KEYWORD_TO_CODE = initKeywordToCode();

    private CountryNormalizationUtil() {
    }

    /**
     * Variantes en minuscules pour une clause SQL {@code IN} (code, nom, saisie brute).
     */
    public static List<String> expandCountryFilterValues(String country) {
        if (country == null || country.isBlank()) {
            return null;
        }
        Set<String> variants = new LinkedHashSet<>();
        String trimmed = country.trim();
        variants.add(trimmed.toLowerCase(Locale.ROOT));

        String code = normalizeToCode(trimmed);
        if (!code.isEmpty()) {
            variants.add(code.toLowerCase(Locale.ROOT));
            String name = CODE_TO_NAME.get(code);
            if (name != null && !name.isBlank()) {
                variants.add(name.toLowerCase(Locale.ROOT));
            }
        }
        return new ArrayList<>(variants);
    }

    public static String normalizeToCode(String country) {
        if (country == null || country.isBlank()) {
            return "";
        }
        String trimmed = country.trim();
        if (trimmed.length() == 2 && trimmed.chars().allMatch(Character::isLetter)) {
            return trimmed.toUpperCase(Locale.ROOT);
        }

        String normalized = Normalizer.normalize(trimmed, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toUpperCase(Locale.ROOT);
        String normalizedWithSpaces = normalized.replaceAll("[^A-Z0-9 ]", " ")
                .replaceAll("\\s+", " ")
                .trim();
        String lettersOnly = normalized.replaceAll("[^A-Z0-9]", "");

        if (lettersOnly.isEmpty()) {
            return "";
        }
        if (lettersOnly.startsWith("CICTH")) {
            return "CI";
        }
        if (lettersOnly.length() == 2) {
            return lettersOnly;
        }
        for (Map.Entry<String, String> entry : KEYWORD_TO_CODE.entrySet()) {
            if (normalizedWithSpaces.contains(entry.getKey())) {
                return entry.getValue();
            }
        }
        if (lettersOnly.length() >= 2) {
            return lettersOnly.substring(0, 2);
        }
        return lettersOnly;
    }

    private static Map<String, String> initCodeToName() {
        Map<String, String> map = new LinkedHashMap<>();
        map.put("CM", "Cameroun");
        map.put("CI", "Côte d'Ivoire");
        map.put("SN", "Sénégal");
        map.put("BF", "Burkina Faso");
        map.put("ML", "Mali");
        map.put("BJ", "Bénin");
        map.put("NE", "Niger");
        map.put("TD", "Tchad");
        map.put("TG", "Togo");
        map.put("GA", "Gabon");
        map.put("GN", "Guinée");
        map.put("KE", "Kenya");
        map.put("MZ", "Mozambique");
        map.put("NG", "Nigeria");
        map.put("CF", "Centrafrique");
        map.put("CG", "Congo");
        map.put("CD", "RD Congo");
        map.put("GQ", "Guinée équatoriale");
        map.put("ST", "São Tomé-et-Príncipe");
        map.put("AO", "Angola");
        map.put("GW", "Guinée-Bissau");
        map.put("SL", "Sierra Leone");
        map.put("LR", "Liberia");
        map.put("GH", "Ghana");
        map.put("MR", "Mauritanie");
        map.put("GM", "Gambie");
        map.put("CV", "Cap-Vert");
        return map;
    }

    private static Map<String, String> initKeywordToCode() {
        Map<String, String> map = new LinkedHashMap<>();
        map.put("COTE D IVOIRE", "CI");
        map.put("COTE IVOIRE", "CI");
        map.put("COTE DIVOIRE", "CI");
        map.put("SENEGAL", "SN");
        map.put("CAMEROUN", "CM");
        map.put("CAMEROON", "CM");
        map.put("BURKINA FASO", "BF");
        map.put("BURKINA", "BF");
        map.put("MALI", "ML");
        map.put("BENIN", "BJ");
        map.put("GUINEE", "GN");
        map.put("GUINEA", "GN");
        map.put("GABON", "GA");
        map.put("TOGO", "TG");
        map.put("TCHAD", "TD");
        map.put("CHAD", "TD");
        map.put("NIGERIA", "NG");
        map.put("NIGER", "NE");
        map.put("KENYA", "KE");
        map.put("MOZAMBIQUE", "MZ");
        map.put("MOZAMBIC", "MZ");
        return map;
    }
}
