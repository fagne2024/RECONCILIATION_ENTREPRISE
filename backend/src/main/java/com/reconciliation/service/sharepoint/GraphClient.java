package com.reconciliation.service.sharepoint;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.ProxySelector;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Accès à SharePoint Online par Microsoft Graph, avec un compte applicatif Entra ID
 * (flux « client credentials »). L'application doit disposer de la permission
 * d'application {@code Sites.Read.All} (ou {@code Sites.Selected} sur le site) avec
 * consentement administrateur.
 *
 * <p>Seuls {@code login.microsoftonline.com} et {@code graph.microsoft.com} sont appelés ;
 * le téléchargement suit l'URL pré-authentifiée renvoyée par Graph.</p>
 */
@Component
public class GraphClient {

    private static final String LOGIN = "https://login.microsoftonline.com/";
    private static final String GRAPH = "https://graph.microsoft.com/v1.0";
    private static final int MAX_PAGES = 20;

    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http;
    private final long maxDownloadBytes;
    private final Map<String, CachedToken> tokens = new ConcurrentHashMap<>();

    /** Paramètres de connexion (secret en clair, jamais journalisé). */
    public record Credentials(String tenantId, String clientId, String clientSecret) {}

    private record CachedToken(String value, Instant expiresAt) {}

    /** Erreur fonctionnelle renvoyée par Microsoft (message lisible pour l'utilisateur). */
    public static class GraphException extends RuntimeException {
        public GraphException(String message) {
            super(message);
        }
    }

    public GraphClient(@Value("${sharepoint.max-download-mb:150}") long maxDownloadMb) {
        this.maxDownloadBytes = maxDownloadMb * 1024L * 1024L;
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(20))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .proxy(ProxySelector.getDefault())
                .build();
    }

    /** Vérifie les identifiants en demandant un jeton. */
    public void checkCredentials(Credentials c) {
        token(c, true);
    }

    /** Liste les classeurs Excel du site dont le nom contient le motif (toutes les bibliothèques). */
    public List<SharepointLink.FileItem> searchFiles(Credentials c, SharepointLink.Site site, String pattern) {
        String siteRef = site.sitePath().isEmpty()
                ? "/sites/" + site.host()
                : "/sites/" + site.host() + ":" + encodePath(site.sitePath());
        JsonNode siteNode = getJson(c, GRAPH + siteRef + "?$select=id,displayName");
        String siteId = siteNode.path("id").asText(null);
        if (siteId == null) throw new GraphException("Site SharePoint introuvable : " + site.host() + site.sitePath());

        String q = pattern == null || pattern.isBlank() ? ".xlsx" : pattern.trim();
        String query = URLEncoder.encode(q.replace("'", "''"), StandardCharsets.UTF_8).replace("+", "%20");
        List<SharepointLink.FileItem> out = new ArrayList<>();
        for (JsonNode drive : getAll(c, GRAPH + "/sites/" + siteId + "/drives?$select=id,name")) {
            String driveId = drive.path("id").asText();
            String url = GRAPH + "/drives/" + driveId + "/root/search(q='" + query + "')"
                    + "?$select=id,name,lastModifiedDateTime,file,webUrl&$top=200";
            for (JsonNode item : getAll(c, url)) {
                if (!item.has("file")) continue;
                String modified = item.path("lastModifiedDateTime").asText(null);
                out.add(new SharepointLink.FileItem(driveId, item.path("id").asText(), item.path("name").asText(),
                        modified == null ? null : OffsetDateTime.parse(modified), item.path("webUrl").asText(null)));
            }
        }
        return out;
    }

    /** Télécharge le contenu d'un fichier. */
    public byte[] download(Credentials c, SharepointLink.FileItem file) {
        JsonNode item = getJson(c, GRAPH + "/drives/" + file.driveId() + "/items/" + file.itemId());
        long size = item.path("size").asLong(0);
        if (size > maxDownloadBytes) {
            throw new GraphException("Fichier trop volumineux (" + (size / 1024 / 1024) + " Mo) : " + file.name());
        }
        String downloadUrl = item.path("@microsoft.graph.downloadUrl").asText(null);
        HttpRequest request = downloadUrl != null
                // URL pré-authentifiée et de courte durée : pas d'en-tête Authorization
                ? HttpRequest.newBuilder(URI.create(downloadUrl)).timeout(Duration.ofMinutes(5)).GET().build()
                : authorized(c, GRAPH + "/drives/" + file.driveId() + "/items/" + file.itemId() + "/content")
                        .timeout(Duration.ofMinutes(5)).GET().build();
        HttpResponse<byte[]> resp = send(request, HttpResponse.BodyHandlers.ofByteArray());
        if (resp.statusCode() / 100 != 2) {
            throw new GraphException("Téléchargement impossible de " + file.name() + " (HTTP " + resp.statusCode() + ")");
        }
        if (resp.body().length > maxDownloadBytes) {
            throw new GraphException("Fichier trop volumineux : " + file.name());
        }
        return resp.body();
    }

    // ------------------------------------------------------------------ HTTP

    private List<JsonNode> getAll(Credentials c, String firstUrl) {
        List<JsonNode> out = new ArrayList<>();
        String url = firstUrl;
        for (int page = 0; url != null && page < MAX_PAGES; page++) {
            JsonNode node = getJson(c, url);
            node.path("value").forEach(out::add);
            url = node.path("@odata.nextLink").asText(null);
        }
        return out;
    }

    private JsonNode getJson(Credentials c, String url) {
        HttpRequest request = authorized(c, url).timeout(Duration.ofSeconds(60)).GET().build();
        HttpResponse<String> resp = send(request, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() == 401) {
            tokens.remove(cacheKey(c));
        }
        if (resp.statusCode() / 100 != 2) {
            throw new GraphException(describeError(resp.statusCode(), resp.body()));
        }
        try {
            return mapper.readTree(resp.body());
        } catch (IOException e) {
            throw new GraphException("Réponse Microsoft Graph illisible.");
        }
    }

    private HttpRequest.Builder authorized(Credentials c, String url) {
        return HttpRequest.newBuilder(URI.create(url))
                .header("Authorization", "Bearer " + token(c, false))
                .header("Accept", "application/json");
    }

    private String token(Credentials c, boolean forceRefresh) {
        if (isBlank(c.tenantId()) || isBlank(c.clientId()) || isBlank(c.clientSecret())) {
            throw new GraphException("Connexion Microsoft incomplète : renseignez l'ID d'annuaire, l'ID d'application et le secret client.");
        }
        String key = cacheKey(c);
        CachedToken cached = tokens.get(key);
        if (!forceRefresh && cached != null && Instant.now().isBefore(cached.expiresAt())) {
            return cached.value();
        }
        String form = "client_id=" + enc(c.clientId())
                + "&client_secret=" + enc(c.clientSecret())
                + "&scope=" + enc("https://graph.microsoft.com/.default")
                + "&grant_type=client_credentials";
        HttpRequest request = HttpRequest.newBuilder(URI.create(LOGIN + enc(c.tenantId().trim()) + "/oauth2/v2.0/token"))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form))
                .build();
        HttpResponse<String> resp = send(request, HttpResponse.BodyHandlers.ofString());
        JsonNode body;
        try {
            body = mapper.readTree(resp.body());
        } catch (IOException e) {
            throw new GraphException("Réponse d'authentification Microsoft illisible (HTTP " + resp.statusCode() + ").");
        }
        if (resp.statusCode() / 100 != 2 || !body.hasNonNull("access_token")) {
            String desc = body.path("error_description").asText(body.path("error").asText("erreur inconnue"));
            int cut = desc.indexOf("\r\n");
            throw new GraphException("Authentification Microsoft refusée : " + (cut > 0 ? desc.substring(0, cut) : desc));
        }
        long expiresIn = body.path("expires_in").asLong(3600);
        CachedToken token = new CachedToken(body.get("access_token").asText(),
                Instant.now().plusSeconds(Math.max(60, expiresIn - 120)));
        tokens.put(key, token);
        return token.value();
    }

    private <T> HttpResponse<T> send(HttpRequest request, HttpResponse.BodyHandler<T> handler) {
        try {
            return http.send(request, handler);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new GraphException("Appel Microsoft interrompu.");
        } catch (IOException e) {
            throw new GraphException("Microsoft injoignable depuis le serveur (" + e.getClass().getSimpleName()
                    + (e.getMessage() != null ? " : " + e.getMessage() : "") + "). Vérifiez l'accès Internet / le proxy.");
        }
    }

    private String describeError(int status, String body) {
        String detail = "";
        try {
            JsonNode err = mapper.readTree(body).path("error");
            detail = err.path("message").asText("");
        } catch (Exception ignored) { }
        String prefix = switch (status) {
            case 401 -> "Jeton refusé par Microsoft Graph";
            case 403 -> "Accès refusé par Microsoft Graph : l'application doit avoir la permission Sites.Read.All "
                    + "(ou Sites.Selected sur ce site) avec consentement administrateur";
            case 404 -> "Élément SharePoint introuvable";
            case 429 -> "Microsoft Graph limite les appels (réessayez plus tard)";
            default -> "Erreur Microsoft Graph (HTTP " + status + ")";
        };
        return detail.isBlank() ? prefix + "." : prefix + " : " + detail;
    }

    private static String cacheKey(Credentials c) {
        return c.tenantId() + "|" + c.clientId() + "|" + Integer.toHexString(c.clientSecret().hashCode());
    }

    private static String encodePath(String path) {
        StringBuilder sb = new StringBuilder();
        for (String part : path.split("/")) {
            if (part.isEmpty()) continue;
            sb.append('/').append(URLEncoder.encode(part, StandardCharsets.UTF_8).replace("+", "%20"));
        }
        return sb.toString();
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
