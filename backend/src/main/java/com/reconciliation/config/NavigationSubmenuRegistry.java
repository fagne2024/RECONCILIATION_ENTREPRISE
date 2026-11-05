package com.reconciliation.config;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Registre des sous-menus avec droits navigation distincts (aligné sur app-navigation-catalog.ts).
 * apiPathPrefixes : contrôle d'accès API à l'exécution (peut inclure des chemins partagés).
 * actionPathPrefixes : actions attribuables propres à chaque sous-menu dans les profils.
 */
public final class NavigationSubmenuRegistry {

    public static final String SEPARATOR = " · ";

    public record SubmenuAccessDefinition(
        String accessModuleName,
        String parentModuleName,
        List<String> apiPathPrefixes,
        List<String> actionPathPrefixes,
        String route
    ) {}

    private static final List<SubmenuAccessDefinition> DEFINITIONS = List.of(
        new SubmenuAccessDefinition(
            "Réconciliation · Lanceur",
            "Réconciliation",
            List.of("/api/reconciliation-launcher", "/api/reconciliation", "/api/auto-processing"),
            List.of(
                "/api/reconciliation/analyze-keys",
                "/api/reconciliation/execute-magic",
                "/api/reconciliation/start",
                "/api/reconciliation/progress",
                "/api/auto-processing/models",
                "/api/auto-processing/process-data",
                "/api/auto-processing/process-single-row"
            ),
            "/reconciliation-launcher"
        ),
        new SubmenuAccessDefinition(
            "Réconciliation · Mode Manuel",
            "Réconciliation",
            List.of("/api/reconciliation"),
            List.of(
                "/api/reconciliation/upload",
                "/api/reconciliation/reconcile",
                "/api/reconciliation/start",
                "/api/reconciliation/progress",
                "/api/reconciliation/save-summary",
                "/api/reconciliation/results"
            ),
            "/upload"
        ),
        new SubmenuAccessDefinition(
            "Réconciliation · Mode assisté",
            "Réconciliation",
            List.of("/api/reconciliation", "/api/auto-processing"),
            List.of(
                "/api/reconciliation/upload",
                "/api/reconciliation/reconcile",
                "/api/reconciliation/start",
                "/api/reconciliation/progress",
                "/api/reconciliation/save-summary",
                "/api/auto-processing"
            ),
            "/upload-assisted"
        ),
        new SubmenuAccessDefinition(
            "Réconciliation · Certification de solde",
            "Réconciliation",
            List.of("/api/reconciliation", "/api/auto-processing"),
            List.of(
                "/api/reconciliation/upload",
                "/api/reconciliation/reconcile",
                "/api/reconciliation/start",
                "/api/reconciliation/progress",
                "/api/compte-solde-bo",
                "/api/compte-solde-cloture",
                "/api/certification-solde-resultats",
                "/api/auto-processing"
            ),
            "/certification-solde"
        ),

        new SubmenuAccessDefinition(
            "Résultats · Vue d'ensemble",
            "Résultats",
            List.of("/api/results", "/api/result8rec", "/api/report-dashboard"),
            List.of("/api/results", "/api/result8rec", "/api/report-dashboard", "/api/reconciliation/results/summary"),
            "/results"
        ),
        new SubmenuAccessDefinition(
            "Résultats · Correspondances",
            "Résultats",
            List.of("/api/reconciliation", "/api/result8rec"),
            List.of("/api/reconciliation/results/matches", "/api/reconciliation/mark-ok", "/api/result8rec"),
            "/matches"
        ),
        new SubmenuAccessDefinition(
            "Résultats · Écarts BO",
            "Résultats",
            List.of("/api/reconciliation", "/api/result8rec"),
            List.of("/api/reconciliation/results/bo-only", "/api/reconciliation/status", "/api/result8rec"),
            "/ecart-bo"
        ),
        new SubmenuAccessDefinition(
            "Résultats · Écarts Partenaire",
            "Résultats",
            List.of("/api/reconciliation", "/api/result8rec"),
            List.of("/api/reconciliation/results/partner-only", "/api/result8rec"),
            "/ecart-partner"
        ),
        new SubmenuAccessDefinition(
            "Résultats · Suivi des écarts J-1 & J+1",
            "Résultats",
            List.of("/api/ecart-bo-summary"),
            List.of("/api/ecart-bo-summary"),
            "/ecart-bo-summary"
        ),
        new SubmenuAccessDefinition(
            "Résultats · Suivi TRX à annuler",
            "Résultats",
            List.of("/api/suivi-trx-a-annuler"),
            List.of("/api/suivi-trx-a-annuler"),
            "/suivi-trx-a-annuler"
        ),
        new SubmenuAccessDefinition(
            "Résultats · Rapport réconciliation",
            "Résultats",
            List.of("/api/reconciliation-report", "/api/result8rec"),
            List.of("/api/reconciliation-report", "/api/result8rec"),
            "/reconciliation-report"
        ),
        new SubmenuAccessDefinition(
            "Résultats · Rapport BO vs Partenaire",
            "Résultats",
            List.of("/api/result8rec"),
            List.of("/api/result8rec"),
            "/rapport-reconciliation-bo-partenaire"
        ),
        new SubmenuAccessDefinition(
            "Résultats · Contrôle interne BO vs Partenaire",
            "Résultats",
            List.of(
                "/api/bo-partenaire-controle-interne",
                "/api/result8rec",
                "/api/ecart-bo-summary",
                "/api/reconciliation-report"
            ),
            List.of(
                "/api/bo-partenaire-controle-interne",
                "/api/result8rec",
                "/api/ecart-bo-summary",
                "/api/reconciliation-report"
            ),
            "/controle-interne-bo-partenaire"
        ),

        new SubmenuAccessDefinition(
            "Statistiques · Statistiques",
            "Statistiques",
            List.of("/api/stats", "/api/statistics"),
            List.of(
                "/api/statistics/by-date",
                "/api/statistics/by-filters",
                "/api/statistics/filter-options",
                "/api/statistics/save"
            ),
            "/stats"
        ),
        new SubmenuAccessDefinition(
            "Statistiques · Rapport statistiques",
            "Statistiques",
            List.of("/api/stats", "/api/statistics"),
            List.of(
                "/api/statistics/detailed-metrics",
                "/api/statistics/dashboard-metrics",
                "/api/statistics/transaction-created-stats"
            ),
            "/stats-report"
        ),
        new SubmenuAccessDefinition(
            "Statistiques · Graphiques",
            "Statistiques",
            List.of("/api/statistics"),
            List.of("/api/statistics/detailed-metrics", "/api/statistics/dashboard-metrics"),
            "/stats-report-graph"
        ),

        new SubmenuAccessDefinition(
            "Comptes · Comptes",
            "Comptes",
            List.of("/api/comptes", "/api/flux", "/api/supply"),
            List.of("/api/comptes", "/api/flux", "/api/supply"),
            "/comptes"
        ),
        new SubmenuAccessDefinition(
            "Comptes · Redevance loterie",
            "Comptes",
            List.of("/api/redevance"),
            List.of("/api/redevance"),
            "/redevance-loterie"
        ),
        new SubmenuAccessDefinition(
            "Comptes · Service balance",
            "Comptes",
            List.of("/api/service-balance"),
            List.of("/api/service-balance"),
            "/service-balance"
        ),
        new SubmenuAccessDefinition(
            "Comptes · Prédictions",
            "Comptes",
            List.of("/api/predictions"),
            List.of("/api/predictions"),
            "/predictions"
        ),

        new SubmenuAccessDefinition(
            "BANQUE · Banque",
            "BANQUE",
            List.of("/api/banque"),
            List.of("/api/banque"),
            "/banque"
        ),

        new SubmenuAccessDefinition(
            "AIDE · Aide",
            "AIDE",
            List.of("/api/aide"),
            List.of("/api/aide"),
            "/aide"
        ),
        new SubmenuAccessDefinition(
            "AIDE · Guide utilisation",
            "AIDE",
            List.of("/api/aide"),
            List.of("/api/guide-nodes", "/api/guide-documents"),
            "/guide-utilisation"
        ),
        new SubmenuAccessDefinition(
            "AIDE · SOP Opérations",
            "AIDE",
            List.of("/api/aide"),
            List.of("/api/sop-nodes", "/api/sop-documents"),
            "/sop-operation"
        ),
        new SubmenuAccessDefinition(
            "AIDE · SOP Réconciliation TRX",
            "AIDE",
            List.of("/api/aide"),
            List.of("/api/sop-nodes", "/api/sop-documents"),
            "/sop-reconciliation-trx"
        ),

        new SubmenuAccessDefinition(
            "TSOP · Écart de solde",
            "TSOP",
            List.of("/api/ecart-solde"),
            List.of("/api/ecart-solde"),
            "/ecart-solde"
        )
    );

    private NavigationSubmenuRegistry() {
    }

    public static List<SubmenuAccessDefinition> allDefinitions() {
        return DEFINITIONS;
    }

    public static boolean isSubmenuAccessModule(String moduleName) {
        if (moduleName == null || moduleName.isBlank()) {
            return false;
        }
        return findByAccessModuleName(moduleName).isPresent();
    }

    public static Optional<SubmenuAccessDefinition> findByAccessModuleName(String accessModuleName) {
        if (accessModuleName == null || accessModuleName.isBlank()) {
            return Optional.empty();
        }
        String normalized = normalizeAccessModuleName(accessModuleName);
        return DEFINITIONS.stream()
            .filter(def -> normalizeAccessModuleName(def.accessModuleName()).equals(normalized))
            .findFirst();
    }

    /**
     * Actions déclaratives de secours lorsque l'analyse des contrôleurs ne retourne rien
     * (ex. backend non recompilé, proxy Spring).
     */
    public static List<Map<String, Object>> buildFallbackActions(SubmenuAccessDefinition definition) {
        if (definition == null) {
            return List.of();
        }
        String normalized = normalizeAccessModuleName(definition.accessModuleName());
        if (normalized.contains("controle interne bo vs partenaire")) {
            return controleInterneFallbackActions();
        }
        if (normalized.contains("suivi des ecarts j-1")) {
            return ecartBoSummaryFallbackActions();
        }

        List<Map<String, Object>> actions = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (String prefix : resolveActionPathPrefixes(definition)) {
            if (prefix == null || prefix.isBlank() || !seen.add(normalizeApiPath(prefix))) {
                continue;
            }
            actions.add(fallbackAction("consulter", "GET", prefix));
        }
        return actions;
    }

    private static List<Map<String, Object>> ecartBoSummaryFallbackActions() {
        List<Map<String, Object>> actions = new ArrayList<>();
        actions.add(fallbackAction("consulter", "GET", "/api/ecart-bo-summary"));
        actions.add(fallbackAction("creer", "POST", "/api/ecart-bo-summary"));
        actions.add(fallbackAction("modifier", "PUT", "/api/ecart-bo-summary/{id}"));
        actions.add(fallbackAction("modifier", "POST", "/api/ecart-bo-summary/batch/status-links/apply"));
        actions.add(fallbackAction("supprimer", "DELETE", "/api/ecart-bo-summary/{id}"));
        return actions;
    }

    private static List<Map<String, Object>> controleInterneFallbackActions() {
        List<Map<String, Object>> actions = new ArrayList<>();
        actions.add(fallbackAction("consulter", "GET", "/api/result8rec"));
        actions.add(fallbackAction("consulter", "GET", "/api/ecart-bo-summary"));
        actions.add(fallbackAction("consulter", "GET", "/api/reconciliation-report"));
        actions.add(fallbackAction("consulter", "GET", "/api/bo-partenaire-controle-interne"));
        actions.add(fallbackAction("valider_controle_interne", "POST", "/api/bo-partenaire-controle-interne/validate"));
        actions.add(fallbackAction("consulter_commentaire_controle_interne", "GET", "/api/bo-partenaire-controle-interne/comment"));
        actions.add(fallbackAction("modifier_commentaire_controle_interne", "PUT", "/api/bo-partenaire-controle-interne/comment"));
        actions.add(fallbackAction("envoyer_email_controle_interne", "POST", "/api/bo-partenaire-controle-interne/send-email"));
        return actions;
    }

    private static Map<String, Object> fallbackAction(String action, String httpMethod, String path) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("action", action);
        row.put("httpMethod", httpMethod);
        row.put("path", path);
        row.put("controller", "BoPartenaireControleInterneController");
        row.put("method", action);
        row.put("source", "fallback");
        return row;
    }

    private static String normalizeAccessModuleName(String accessModuleName) {
        return Normalizer.normalize(accessModuleName.trim(), Normalizer.Form.NFD)
            .replaceAll("\\p{M}+", "")
            .replaceAll("\\s*[·•]\\s*", " · ")
            .replaceAll("\\s+", " ")
            .toLowerCase(Locale.ROOT);
    }

    public static List<SubmenuAccessDefinition> findByParentModule(String parentModuleName) {
        if (parentModuleName == null || parentModuleName.isBlank()) {
            return List.of();
        }
        return DEFINITIONS.stream()
            .filter(def -> def.parentModuleName().equals(parentModuleName))
            .toList();
    }

    public static List<String> resolveActionPathPrefixes(SubmenuAccessDefinition definition) {
        if (definition == null) {
            return List.of();
        }
        if (definition.actionPathPrefixes() != null && !definition.actionPathPrefixes().isEmpty()) {
            return definition.actionPathPrefixes();
        }
        return definition.apiPathPrefixes() != null ? definition.apiPathPrefixes() : List.of();
    }

    public static List<String> resolveAccessModulesForApiPath(String apiPath) {
        if (apiPath == null || apiPath.isBlank()) {
            return List.of();
        }
        String normalized = normalizeApiPath(apiPath);
        Set<String> matches = new LinkedHashSet<>();
        for (SubmenuAccessDefinition definition : DEFINITIONS) {
            if (matchesApiPath(normalized, definition.apiPathPrefixes())) {
                matches.add(definition.accessModuleName());
            }
        }
        return new ArrayList<>(matches);
    }

    public static boolean matchesApiPath(String apiPath, List<String> prefixes) {
        if (apiPath == null || prefixes == null || prefixes.isEmpty()) {
            return false;
        }
        String normalized = normalizeApiPath(apiPath);
        for (String prefix : prefixes) {
            if (prefix == null || prefix.isBlank()) {
                continue;
            }
            String normalizedPrefix = normalizeApiPath(prefix);
            if (normalized.equals(normalizedPrefix) || normalized.startsWith(normalizedPrefix + "/")) {
                return true;
            }
        }
        return false;
    }

    private static String normalizeApiPath(String apiPath) {
        String path = apiPath.trim();
        if (!path.startsWith("/")) {
            path = "/" + path;
        }
        while (path.length() > 1 && path.endsWith("/")) {
            path = path.substring(0, path.length() - 1);
        }
        return path;
    }
}
