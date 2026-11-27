package com.reconciliation.service.sharepoint;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lecture d'un lien SharePoint (page, dossier ou fichier) et choix du dernier fichier.
 *
 * <p>Seuls les hôtes {@code *.sharepoint.com} sont acceptés : le lien sert uniquement à
 * identifier le site, interrogé ensuite via Microsoft Graph.</p>
 */
public final class SharepointLink {

    private static final Pattern YEAR_MONTH = Pattern.compile("(?<!\\d)(20\\d{2})(0[1-9]|1[0-2])(?!\\d)");

    private SharepointLink() {}

    /** Hôte et chemin du site (ex. intouchgroup.sharepoint.com + /sites/INTRANETTEST). */
    public record Site(String host, String sitePath) {}

    /** Fichier trouvé sur le site. */
    public record FileItem(String driveId, String itemId, String name, OffsetDateTime lastModified, String webUrl) {}

    /**
     * Extrait le site d'un lien SharePoint : {@code /sites/X} ou {@code /teams/X} ;
     * sans ce préfixe, site racine (chemin vide).
     *
     * @throws IllegalArgumentException si le lien n'est pas un lien https vers *.sharepoint.com
     */
    public static Site parseSite(String url) {
        if (url == null || url.isBlank()) throw new IllegalArgumentException("Lien SharePoint vide.");
        URI uri;
        try {
            uri = URI.create(url.trim());
        } catch (Exception e) {
            throw new IllegalArgumentException("Lien SharePoint invalide : " + url);
        }
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        if (!"https".equalsIgnoreCase(uri.getScheme()) || !host.endsWith(".sharepoint.com")) {
            throw new IllegalArgumentException("Le lien doit être un lien https vers un site *.sharepoint.com.");
        }
        String path = uri.getRawPath() == null ? "" : URLDecoder.decode(uri.getRawPath(), StandardCharsets.UTF_8);
        String[] parts = path.split("/");
        // Lien de partage court : /:x:/r/sites/X/... ou /:x:/s/X/...
        int i = 1;
        while (i < parts.length && parts[i].startsWith(":") && parts[i].endsWith(":")) i++;
        if (i < parts.length && ("r".equals(parts[i]))) i++;
        if (i + 1 < parts.length && ("sites".equalsIgnoreCase(parts[i]) || "teams".equalsIgnoreCase(parts[i]))) {
            return new Site(host, "/" + parts[i].toLowerCase(Locale.ROOT) + "/" + parts[i + 1]);
        }
        if (i + 1 < parts.length && "s".equals(parts[i])) {
            return new Site(host, "/sites/" + parts[i + 1]);
        }
        return new Site(host, "");
    }

    /** Mois porté par le nom du fichier (ex. 202611_SN_SUIVI_OPS.xlsx → 2026-11), s'il existe. */
    public static Optional<YearMonth> monthFromName(String name) {
        if (name == null) return Optional.empty();
        Matcher m = YEAR_MONTH.matcher(name);
        if (!m.find()) return Optional.empty();
        return Optional.of(YearMonth.of(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2))));
    }

    /** Le fichier est-il un classeur Excel dont le nom contient le motif (casse et accents ignorés) ? */
    public static boolean matches(String name, String pattern) {
        if (name == null) return false;
        String lower = name.toLowerCase(Locale.ROOT);
        if (!(lower.endsWith(".xlsx") || lower.endsWith(".xlsm"))) return false;
        if (lower.startsWith("~$")) return false; // fichier de verrou Office
        String p = normalize(pattern);
        return p.isEmpty() || normalize(name).contains(p);
    }

    /**
     * Dernier fichier : mois le plus récent dans le nom (AAAAMM), puis dernière modification.
     * Un fichier sans mois dans le nom passe après ceux qui en ont un.
     */
    public static Optional<FileItem> latest(List<FileItem> files, String pattern) {
        Comparator<FileItem> byMonth = Comparator.comparing(
                (FileItem f) -> monthFromName(f.name()).orElse(null),
                Comparator.nullsFirst(Comparator.naturalOrder()));
        Comparator<FileItem> byDate = Comparator.comparing(
                FileItem::lastModified, Comparator.nullsFirst(Comparator.naturalOrder()));
        return files.stream()
                .filter(f -> matches(f.name(), pattern))
                .max(byMonth.thenComparing(byDate));
    }

    /** Minuscules, sans accents ni ponctuation (comparaison de noms de fichiers et de feuilles). */
    public static String normalize(String s) {
        if (s == null) return "";
        return java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{InCombiningDiacriticalMarks}+", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]", "");
    }
}
