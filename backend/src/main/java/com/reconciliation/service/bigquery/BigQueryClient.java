package com.reconciliation.service.bigquery;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.ProxySelector;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Accès à BigQuery par l'API REST v2 avec un compte de service Google (clé JSON, jeton
 * OAuth signé RS256). Aucune dépendance Google n'est nécessaire.
 *
 * <p>Rôles attendus sur le projet : BigQuery Job User (exécuter des requêtes) et
 * BigQuery Data Viewer (lire les tables).</p>
 */
@Component
public class BigQueryClient {

    private static final String API = "https://bigquery.googleapis.com/bigquery/v2";
    private static final String SCOPE = "https://www.googleapis.com/auth/bigquery";
    private static final int PAGE_SIZE = 20_000;
    private static final Duration MAX_WAIT = Duration.ofMinutes(30);
    private static final Pattern DATE_PARAM = Pattern.compile("@date\\b", Pattern.CASE_INSENSITIVE);
    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(20))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .proxy(ProxySelector.getDefault())
            .build();
    private final Map<String, CachedToken> tokens = new ConcurrentHashMap<>();

    private record CachedToken(String value, Instant expiresAt) {}

    /** Clé de compte de service lue depuis le JSON fourni par Google. */
    public record ServiceAccount(String clientEmail, String privateKeyId, String privateKeyPem, String tokenUri,
                                 String projectId) {}

    /** Destinataire des lignes : en-tête puis lignes (valeurs déjà converties en texte). */
    public interface RowSink {
        void header(List<String> columns) throws IOException;

        void row(List<String> values) throws IOException;
    }

    /** Résultat d'une vérification à blanc. */
    public record DryRun(List<String> columns, long bytesProcessed) {}

    /** Erreur fonctionnelle (message lisible pour l'utilisateur). */
    public static class BigQueryException extends RuntimeException {
        public BigQueryException(String message) {
            super(message);
        }
    }

    /**
     * Lit et contrôle la clé JSON d'un compte de service.
     *
     * @throws IllegalArgumentException si le JSON n'est pas une clé de compte de service
     */
    public ServiceAccount parseServiceAccount(String json) {
        JsonNode n;
        try {
            n = mapper.readTree(json);
        } catch (Exception e) {
            throw new IllegalArgumentException("Clé JSON du compte de service illisible.");
        }
        if (n == null || !"service_account".equals(n.path("type").asText())
                || n.path("client_email").asText("").isBlank() || n.path("private_key").asText("").isBlank()) {
            throw new IllegalArgumentException(
                    "Ce JSON n'est pas une clé de compte de service Google (type « service_account » attendu).");
        }
        String tokenUri = n.path("token_uri").asText("https://oauth2.googleapis.com/token");
        if (!tokenUri.startsWith("https://oauth2.googleapis.com/")) {
            throw new IllegalArgumentException("token_uri inattendu dans la clé : " + tokenUri);
        }
        return new ServiceAccount(n.path("client_email").asText(), n.path("private_key_id").asText(null),
                n.path("private_key").asText(), tokenUri, n.path("project_id").asText(null));
    }

    /** Vérifie la clé en demandant un jeton. */
    public void checkCredentials(ServiceAccount sa) {
        token(sa, true);
    }

    /** Vérification à blanc (gratuite) : colonnes et volume qui serait lu. */
    public DryRun dryRun(ServiceAccount sa, String project, String location, String sql, LocalDate date) {
        ObjectNode body = queryBody(sql, location, date);
        body.put("dryRun", true);
        JsonNode resp = post(sa, API + "/projects/" + enc(project) + "/queries", body);
        List<String> columns = new ArrayList<>();
        JsonNode fields = resp.path("schema").path("fields");
        fields.forEach(f -> columns.add(f.path("name").asText()));
        long bytes = resp.path("totalBytesProcessed").asLong(0);
        return new DryRun(columns, bytes);
    }

    /**
     * Exécute la requête et envoie toutes les lignes au destinataire.
     *
     * @return nombre de lignes écrites
     * @throws BigQueryException si la requête échoue ou dépasse {@code maxRows} lignes
     */
    public long run(ServiceAccount sa, String project, String location, String sql, LocalDate date, long maxRows,
                    RowSink sink) throws IOException {
        ObjectNode body = queryBody(sql, location, date);
        body.put("maxResults", PAGE_SIZE);
        body.put("timeoutMs", 20_000);
        JsonNode resp = post(sa, API + "/projects/" + enc(project) + "/queries", body);
        String jobId = resp.path("jobReference").path("jobId").asText(null);
        String jobLocation = resp.path("jobReference").path("location").asText(location);

        Instant deadline = Instant.now().plus(MAX_WAIT);
        while (!resp.path("jobComplete").asBoolean(false)) {
            if (jobId == null) throw new BigQueryException("Réponse BigQuery sans identifiant de tâche.");
            if (Instant.now().isAfter(deadline)) throw new BigQueryException("Requête BigQuery trop longue (> 30 min).");
            resp = getResults(sa, project, jobId, jobLocation, null);
        }

        List<String> types = new ArrayList<>();
        List<String> columns = new ArrayList<>();
        resp.path("schema").path("fields").forEach(f -> {
            columns.add(f.path("name").asText());
            types.add(f.path("mode").asText("").equals("REPEATED") ? "REPEATED" : f.path("type").asText(""));
        });
        long total = resp.path("totalRows").asLong(0);
        if (total > maxRows) {
            throw new BigQueryException("La requête renvoie " + total + " lignes, au-delà de la limite configurée ("
                    + maxRows + "). Restreignez la requête ou augmentez la limite.");
        }
        sink.header(columns);
        long written = 0;
        while (true) {
            for (JsonNode row : resp.path("rows")) {
                sink.row(convert(row.path("f"), types));
                written++;
            }
            String pageToken = resp.path("pageToken").asText(null);
            if (pageToken == null || pageToken.isEmpty()) break;
            resp = getResults(sa, project, jobId, jobLocation, pageToken);
        }
        return written;
    }

    // ------------------------------------------------------------------ requête

    private ObjectNode queryBody(String sql, String location, LocalDate date) {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", sql);
        body.put("useLegacySql", false);
        if (location != null && !location.isBlank()) body.put("location", location.trim());
        body.putObject("formatOptions").put("useInt64Timestamp", true);
        if (date != null && DATE_PARAM.matcher(sql).find()) {
            body.put("parameterMode", "NAMED");
            ArrayNode params = body.putArray("queryParameters");
            ObjectNode p = params.addObject();
            p.put("name", "date");
            p.putObject("parameterType").put("type", "DATE");
            p.putObject("parameterValue").put("value", date.toString());
        }
        return body;
    }

    private JsonNode getResults(ServiceAccount sa, String project, String jobId, String location, String pageToken) {
        StringBuilder url = new StringBuilder(API).append("/projects/").append(enc(project))
                .append("/queries/").append(enc(jobId))
                .append("?timeoutMs=20000&maxResults=").append(PAGE_SIZE)
                .append("&formatOptions.useInt64Timestamp=true");
        if (location != null && !location.isBlank()) url.append("&location=").append(enc(location));
        if (pageToken != null) url.append("&pageToken=").append(enc(pageToken));
        return send(sa, HttpRequest.newBuilder(URI.create(url.toString())).GET());
    }

    /** Convertit une ligne BigQuery en textes (horodatages en UTC « aaaa-mm-jj hh:mm:ss »). */
    static List<String> convert(JsonNode cells, List<String> types) {
        List<String> out = new ArrayList<>(types.size());
        for (int i = 0; i < types.size(); i++) {
            JsonNode v = cells.path(i).path("v");
            if (v.isMissingNode() || v.isNull()) {
                out.add("");
                continue;
            }
            String type = types.get(i);
            if (!v.isValueNode()) {
                out.add(v.toString()); // RECORD / REPEATED : JSON
            } else if ("TIMESTAMP".equals(type)) {
                out.add(formatTimestamp(v.asText()));
            } else if ("DATETIME".equals(type)) {
                out.add(v.asText().replace('T', ' '));
            } else {
                out.add(v.asText());
            }
        }
        return out;
    }

    static String formatTimestamp(String raw) {
        try {
            long micros = Long.parseLong(raw);
            Instant instant = Instant.ofEpochSecond(Math.floorDiv(micros, 1_000_000L),
                    Math.floorMod(micros, 1_000_000L) * 1000L);
            return LocalDateTime.ofInstant(instant, ZoneOffset.UTC).format(TS);
        } catch (NumberFormatException e) {
            return raw;
        }
    }

    // ------------------------------------------------------------------ HTTP

    private JsonNode post(ServiceAccount sa, String url, JsonNode body) {
        try {
            return send(sa, HttpRequest.newBuilder(URI.create(url))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body))));
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new BigQueryException("Requête BigQuery impossible à construire.");
        }
    }

    private JsonNode send(ServiceAccount sa, HttpRequest.Builder builder) {
        HttpRequest request = builder.timeout(Duration.ofMinutes(2))
                .header("Authorization", "Bearer " + token(sa, false))
                .header("Accept", "application/json")
                .build();
        HttpResponse<String> resp = exchange(request);
        if (resp.statusCode() == 401) tokens.remove(sa.clientEmail());
        if (resp.statusCode() / 100 != 2) {
            throw new BigQueryException(describeError(resp.statusCode(), resp.body()));
        }
        try {
            return mapper.readTree(resp.body());
        } catch (IOException e) {
            throw new BigQueryException("Réponse BigQuery illisible.");
        }
    }

    private String token(ServiceAccount sa, boolean forceRefresh) {
        CachedToken cached = tokens.get(sa.clientEmail());
        if (!forceRefresh && cached != null && Instant.now().isBefore(cached.expiresAt())) return cached.value();
        long now = Instant.now().getEpochSecond();
        ObjectNode header = mapper.createObjectNode().put("alg", "RS256").put("typ", "JWT");
        if (sa.privateKeyId() != null) header.put("kid", sa.privateKeyId());
        ObjectNode claims = mapper.createObjectNode()
                .put("iss", sa.clientEmail())
                .put("scope", SCOPE)
                .put("aud", sa.tokenUri())
                .put("iat", now)
                .put("exp", now + 3600);
        String assertion;
        try {
            Base64.Encoder b64 = Base64.getUrlEncoder().withoutPadding();
            String unsigned = b64.encodeToString(mapper.writeValueAsBytes(header)) + "."
                    + b64.encodeToString(mapper.writeValueAsBytes(claims));
            Signature signature = Signature.getInstance("SHA256withRSA");
            signature.initSign(privateKey(sa.privateKeyPem()));
            signature.update(unsigned.getBytes(StandardCharsets.US_ASCII));
            assertion = unsigned + "." + b64.encodeToString(signature.sign());
        } catch (Exception e) {
            throw new BigQueryException("Clé privée du compte de service inutilisable : " + e.getClass().getSimpleName());
        }
        String form = "grant_type=" + enc("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + enc(assertion);
        HttpResponse<String> resp = exchange(HttpRequest.newBuilder(URI.create(sa.tokenUri()))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form))
                .build());
        JsonNode body;
        try {
            body = mapper.readTree(resp.body());
        } catch (IOException e) {
            throw new BigQueryException("Réponse d'authentification Google illisible (HTTP " + resp.statusCode() + ").");
        }
        if (resp.statusCode() / 100 != 2 || !body.hasNonNull("access_token")) {
            throw new BigQueryException("Authentification Google refusée : "
                    + body.path("error_description").asText(body.path("error").asText("erreur inconnue")));
        }
        CachedToken token = new CachedToken(body.get("access_token").asText(),
                Instant.now().plusSeconds(Math.max(60, body.path("expires_in").asLong(3600) - 120)));
        tokens.put(sa.clientEmail(), token);
        return token.value();
    }

    private static PrivateKey privateKey(String pem) throws Exception {
        String base64 = pem.replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replaceAll("\\s", "");
        return KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(base64)));
    }

    private HttpResponse<String> exchange(HttpRequest request) {
        try {
            return http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BigQueryException("Appel BigQuery interrompu.");
        } catch (IOException e) {
            throw new BigQueryException("Google injoignable depuis le serveur (" + e.getClass().getSimpleName()
                    + (e.getMessage() != null ? " : " + e.getMessage() : "") + "). Vérifiez l'accès Internet / le proxy.");
        }
    }

    private String describeError(int status, String body) {
        String detail = "";
        try {
            detail = mapper.readTree(body).path("error").path("message").asText("");
        } catch (Exception ignored) { }
        String prefix = switch (status) {
            case 400 -> "Requête BigQuery refusée";
            case 401 -> "Jeton refusé par Google";
            case 403 -> "Accès refusé par BigQuery (rôles BigQuery Job User et Data Viewer requis)";
            case 404 -> "Projet, jeu de données ou table introuvable";
            default -> "Erreur BigQuery (HTTP " + status + ")";
        };
        return detail.isBlank() ? prefix + "." : prefix + " : " + detail;
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8).replace("+", "%20");
    }
}
