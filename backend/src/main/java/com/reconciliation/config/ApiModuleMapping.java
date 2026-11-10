package com.reconciliation.config;

/**
 * Correspondance chemin d'API -> module metier.
 *
 * <p>Source unique partagee par le controle d'acces ({@code PermissionCheckService})
 * et le generateur du catalogue des permissions ({@code PermissionGeneratorService}) :
 * une permission proposee dans « Gerer les droits » porte ainsi exactement sur le
 * module verifie a l'appel de l'API. L'ordre compte (premier prefixe qui correspond).</p>
 */
public final class ApiModuleMapping {

    private ApiModuleMapping() {
    }

    public static String moduleForPath(String apiPath) {
        if (apiPath == null) return null;

        if (apiPath.startsWith("/api/statistics/dashboard-metrics")) return "Dashboard";
        if (apiPath.startsWith("/api/statistics/filter-options")) return "Dashboard";
        if (apiPath.startsWith("/api/statistics/detailed-metrics")) return "Dashboard";
        if (apiPath.startsWith("/api/statistics/transaction-created-stats")) return "Dashboard";
        if (apiPath.startsWith("/api/operations")) return "Opérations";
        if (apiPath.startsWith("/api/operations-bancaires")) return "Opérations";
        if (apiPath.startsWith("/api/comptes")) return "Comptes";
        if (apiPath.startsWith("/api/service-balance")) return "Comptes";
        if (apiPath.startsWith("/api/redevance")) return "Comptes";
        if (apiPath.startsWith("/api/flux")) return "Comptes";
        if (apiPath.startsWith("/api/supply")) return "Comptes";
        if (apiPath.startsWith("/api/predictions")) return "Comptes";
        if (apiPath.startsWith("/api/releve-bancaire")) return "BANQUE";
        if (apiPath.startsWith("/api/frais")) return "Frais";
        if (apiPath.startsWith("/api/frais-transaction")) return "Frais";
        if (apiPath.startsWith("/api/commission")) return "Commission";
        if (apiPath.startsWith("/api/reconciliation")) return "Réconciliation";
        if (apiPath.startsWith("/api/reconciliation-launcher")) return "Réconciliation";
        if (apiPath.startsWith("/api/stats")) return "Statistiques";
        if (apiPath.startsWith("/api/statistics")) return "Statistiques";
        if (apiPath.startsWith("/api/ranking")) return "Classements";
        if (apiPath.startsWith("/api/rankings")) return "Classements";
        if (apiPath.startsWith("/api/ecart-solde")) return "TSOP";
        if (apiPath.startsWith("/api/trx-sf")) return "TRX SF";
        if (apiPath.startsWith("/api/impact-op")) return "Impact OP";
        if (apiPath.startsWith("/api/banque-dashboard")) return "Dashboard";
        if (apiPath.startsWith("/api/banque")) return "BANQUE";
        if (apiPath.startsWith("/api/comptabilite")) return "Comptabilité";
        if (apiPath.startsWith("/api/auto-processing-models")) return "Modèles";
        if (apiPath.startsWith("/api/auto-processing")) return "Modèles";
        if (apiPath.startsWith("/api/model-management")) return "Modèles";
        if (apiPath.startsWith("/api/file-watcher")) return "Modèles";
        if (apiPath.startsWith("/api/profils")) return "Profil";
        if (apiPath.startsWith("/api/users")) return "Utilisateur";
        if (apiPath.startsWith("/api/log-utilisateur")) return "Log utilisateur";
        if (apiPath.startsWith("/api/dashboard")) return "Dashboard";
        if (apiPath.startsWith("/api/traitement")) return "Traitement";
        if (apiPath.startsWith("/api/results")) return "Résultats";
        if (apiPath.startsWith("/api/reconciliation-report")) return "Résultats";
        if (apiPath.startsWith("/api/reco-j1-blocking-comments")) return "Résultats";
        if (apiPath.startsWith("/api/result8rec")) return "Résultats";
        if (apiPath.startsWith("/api/ecart-bo-summary")) return "Résultats";
        if (apiPath.startsWith("/api/bo-partenaire-controle-interne")) return "Résultats";
        if (apiPath.startsWith("/api/report-dashboard")) return "Résultats";
        if (apiPath.startsWith("/api/service-references")) return "Dashboard";
        if (apiPath.startsWith("/api/aide")) return "AIDE";
        if (apiPath.startsWith("/api/guide-nodes")) return "AIDE";
        if (apiPath.startsWith("/api/guide-documents")) return "AIDE";
        if (apiPath.startsWith("/api/sop-nodes")) return "AIDE";
        if (apiPath.startsWith("/api/sop-documents")) return "AIDE";
        if (apiPath.startsWith("/api/configuration/calcul")) return "Modèles";
        if (apiPath.startsWith("/api/configuration/normalisation")) return "Modèles";
        if (apiPath.startsWith("/api/configuration/top-users")) return "Dashboard";
        if (apiPath.startsWith("/api/configuration")) return "Profil";
        if (apiPath.startsWith("/api/conversion")) return "Modèles";
        if (apiPath.startsWith("/api/renommer")) return "Traitement";
        if (apiPath.startsWith("/api/suivi-ecart")) return "Résultats";
        if (apiPath.startsWith("/api/suivi-trx-a-annuler")) return "Résultats";
        if (apiPath.startsWith("/api/agency-summary")) return "Dashboard";
        if (apiPath.startsWith("/api/modules")) return "Dashboard";
        if (apiPath.startsWith("/api/pays")) return "Profil";
        if (apiPath.startsWith("/api/oppart")) return "OPPART";
        if (apiPath.startsWith("/api/compte-solde-bo")) return "Comptes";
        if (apiPath.startsWith("/api/compte-solde-cloture")) return "Comptes";
        if (apiPath.startsWith("/api/certification-solde-resultats")) return "Réconciliation";
        if (apiPath.startsWith("/api/user-profil")) return "Profil";

        return null;
    }
}
