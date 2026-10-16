package com.reconciliation.util;

import java.util.regex.Pattern;

/**
 * Neutralise les vecteurs XSS courants dans le HTML stocké (guides / SOP)
 * sans dépendance externe.
 */
public final class HtmlSanitizer {

    private static final Pattern SCRIPT = Pattern.compile("(?is)<script[^>]*>.*?</script>");
    private static final Pattern IFRAME = Pattern.compile("(?is)<iframe[^>]*>.*?</iframe>");
    private static final Pattern OBJECT = Pattern.compile("(?is)<object[^>]*>.*?</object>");
    private static final Pattern EMBED = Pattern.compile("(?is)<embed[^>]*>.*?</embed>");
    private static final Pattern LINK = Pattern.compile("(?is)<link[^>]*>");
    private static final Pattern META = Pattern.compile("(?is)<meta[^>]*>");
    private static final Pattern EVENT_HANDLER = Pattern.compile("(?i)\\son\\w+\\s*=\\s*(\"[^\"]*\"|'[^']*'|[^\\s>]+)");
    private static final Pattern JAVASCRIPT_URL = Pattern.compile("(?i)javascript:");
    private static final Pattern DATA_HTML = Pattern.compile("(?i)data:\\s*text/html");

    private HtmlSanitizer() {}

    public static String sanitize(String html) {
        if (html == null || html.isEmpty()) {
            return html;
        }
        String cleaned = SCRIPT.matcher(html).replaceAll("");
        cleaned = IFRAME.matcher(cleaned).replaceAll("");
        cleaned = OBJECT.matcher(cleaned).replaceAll("");
        cleaned = EMBED.matcher(cleaned).replaceAll("");
        cleaned = LINK.matcher(cleaned).replaceAll("");
        cleaned = META.matcher(cleaned).replaceAll("");
        cleaned = EVENT_HANDLER.matcher(cleaned).replaceAll("");
        cleaned = JAVASCRIPT_URL.matcher(cleaned).replaceAll("");
        cleaned = DATA_HTML.matcher(cleaned).replaceAll("");
        return cleaned;
    }
}
