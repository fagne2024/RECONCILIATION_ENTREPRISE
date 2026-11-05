package com.reconciliation.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.reconciliation.entity.CalculationRuleEntity;
import com.reconciliation.repository.CalculationRuleRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Gestion des règles de calcul configurables (sous-module Configuration &gt; Calcul).
 */
@Service
public class CalculationRuleService {

    public static final String MODULE_CERTIFICATION_SOLDE = "CERTIFICATION_SOLDE";
    public static final String MODULE_REDEVANCE_LOTERIE = "REDEVANCE_LOTERIE";
    public static final String MODULE_TRAITEMENT = "TRAITEMENT";

    // ------------------------------------------------------------------
    // Repls code par défaut
    // ------------------------------------------------------------------
    // Valeurs codées en dur dans les moteurs de calcul : elles ne s'appliquent
    // QUE si aucune règle active n'est configurée dans Configuration > Calcul.
    // Toute règle configurée devient prioritaire sur ces valeurs.

    /** Types d'opération bancaire classés en approvisionnement (crédit). */
    public static final List<String> DEFAULT_TYPES_APPROVISIONNEMENT = List.of("appro");
    /** Types d'opération bancaire classés en compensation (débit). */
    public static final List<String> DEFAULT_TYPES_COMPENSATION = List.of("compens", "compense", "compensation");
    /** Types d'opération bancaire classés en nivellement. */
    public static final List<String> DEFAULT_TYPES_NIVELLEMENT = List.of("nivellement");
    /** Services dont le montant TSOP est forcé en négatif. */
    public static final List<String> DEFAULT_SERVICES_TSOP_NEGATIFS = List.of("cashin", "send", "airtime");
    /** Mots-clés du nom de fichier identifiant un fichier OPPART. */
    public static final List<String> DEFAULT_TOKENS_OPPART = List.of("oppart");
    /** Mots-clés du nom de fichier identifiant un fichier TRXBO. */
    public static final List<String> DEFAULT_TOKENS_TRXBO = List.of("trxbo");
    /** Mots-clés du nom de fichier identifiant un fichier USSDPART. */
    public static final List<String> DEFAULT_TOKENS_USSDPART = List.of("ussdpart");
    /** Extensions de fichiers reconnues par le module Traitement. */
    public static final List<String> DEFAULT_EXTENSIONS_FICHIERS = List.of(".csv", ".txt", ".tsv", ".xls", ".xlsx");

    @Autowired
    private CalculationRuleRepository repository;

    @Autowired
    private ObjectMapper objectMapper;

    // ------------------------------------------------------------------
    // Lecture
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<CalculationRuleEntity> findAll() {
        return repository.findAllByOrderByModuleAscSousModuleAscOrdreAscIdAsc();
    }

    @Transactional(readOnly = true)
    public List<CalculationRuleEntity> findByModule(String module) {
        return repository.findByModuleOrderBySousModuleAscOrdreAscIdAsc(module);
    }

    @Transactional(readOnly = true)
    public CalculationRuleEntity findById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Règle de calcul introuvable"));
    }

    @Transactional(readOnly = true)
    public CalculationRuleEntity findByCode(String code) {
        return repository.findByCode(code)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Règle de calcul introuvable: " + code));
    }

    // ------------------------------------------------------------------
    // Écriture
    // ------------------------------------------------------------------

    @Transactional
    public CalculationRuleEntity create(CalculationRuleEntity rule) {
        if (rule.getCode() == null || rule.getCode().trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le code est obligatoire");
        }
        if (repository.existsByCode(rule.getCode())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Une règle avec ce code existe déjà");
        }
        validate(rule);
        rule.setId(null);
        rule.setSysteme(false);
        if (rule.getActif() == null) {
            rule.setActif(true);
        }
        return repository.save(rule);
    }

    @Transactional
    public CalculationRuleEntity update(Long id, CalculationRuleEntity changes) {
        CalculationRuleEntity existing = findById(id);

        // Le code, le module et le type sont figés pour garantir la stabilité des moteurs de calcul.
        if (changes.getLibelle() != null) {
            existing.setLibelle(changes.getLibelle());
        }
        existing.setDescription(changes.getDescription());
        existing.setSousModule(changes.getSousModule() != null ? changes.getSousModule() : existing.getSousModule());
        existing.setExpression(changes.getExpression());
        existing.setValeurs(changes.getValeurs());
        existing.setValeur(changes.getValeur());
        existing.setUnite(changes.getUnite());
        if (changes.getOrdre() != null) {
            existing.setOrdre(changes.getOrdre());
        }
        if (changes.getActif() != null) {
            existing.setActif(changes.getActif());
        }

        validate(existing);
        return repository.save(existing);
    }

    @Transactional
    public void delete(Long id) {
        CalculationRuleEntity existing = findById(id);
        if (Boolean.TRUE.equals(existing.getSysteme())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Cette règle système ne peut pas être supprimée (désactivez-la à la place)");
        }
        repository.delete(existing);
    }

    // ------------------------------------------------------------------
    // Seed des règles par défaut (certification de solde)
    // ------------------------------------------------------------------

    @PostConstruct
    public void seedDefaults() {
        // Initialisation technique : rattachee a l'entreprise historique.
        // (Pas de @Transactional ici : le contexte entreprise doit etre positionne
        // AVANT l'ouverture de la session Hibernate.)
        com.reconciliation.tenant.TenantContext.runAs(
            com.reconciliation.tenant.TenantContext.HISTORIQUE_ENTREPRISE_ID, this::seedDefaultsInternal);
    }

    private void seedDefaultsInternal() {
        for (CalculationRuleEntity rule : buildDefaultRules()) {
            if (!repository.existsByCode(rule.getCode())) {
                repository.save(rule);
            }
        }
    }

    /**
     * Copie les règles par défaut vers une entreprise (création d'un nouveau tenant).
     * Sans cela, la page Configuration &gt; Calcul serait vide pour ce tenant et
     * tous les calculs retomberaient sur les valeurs codées en dur.
     */
    @Transactional
    public void copyDefaultsTo(Long entrepriseId) {
        if (entrepriseId == null) {
            return;
        }
        com.reconciliation.tenant.TenantContext.runAs(entrepriseId, () -> {
            for (CalculationRuleEntity rule : buildDefaultRules()) {
                if (!repository.existsByCode(rule.getCode())) {
                    repository.save(rule);
                }
            }
        });
    }

    private List<CalculationRuleEntity> buildDefaultRules() {
        List<CalculationRuleEntity> rules = new ArrayList<>();

        // ===== Certification de solde =====
        rules.add(formule("CERTIF.ECART_MOUVEMENT", MODULE_CERTIFICATION_SOLDE, "ECART_MOUVEMENT", "Écart mouvement",
                "Variation du solde moins le mouvement net OPPART.", 10,
                terms(term("+", 1, "VARIATION", false), term("-", 1, "MOUVEMENT_NET_OPPART", false))));

        rules.add(formule("CERTIF.ECART_FRAIS", MODULE_CERTIFICATION_SOLDE, "ECART_FRAIS", "Écart frais",
                "Frais attendus moins frais facturés (OPPART).", 20,
                terms(term("+", 1, "FRAIS_ATTENDU", true), term("-", 1, "FRAIS_FACTURE", true))));

        rules.add(formule("CERTIF.ECART_CERTIFICATION", MODULE_CERTIFICATION_SOLDE, "ECART_CERTIFICATION",
                "Écart de certification (synthèse)", "Écart mouvement plus le total à régulariser.", 30,
                terms(term("+", 1, "ECART_MOUVEMENT", false), term("+", 1, "TOTAL_REGULARISATION", false))));

        rules.add(formule("CERTIF.SOLDE_CLOTURE_THEORIQUE", MODULE_CERTIFICATION_SOLDE, "ECART_CERTIFICATION",
                "Solde de clôture théorique", "Solde de clôture plus l'écart de certification.", 40,
                terms(term("+", 1, "SOLDE_CLOTURE", false), term("+", 1, "ECART_CERTIFICATION", false))));

        rules.add(liste("CERTIF.TYPES_ECART_PARTENAIRE_RETENUS", MODULE_CERTIFICATION_SOLDE, "ECART_PARTENAIRE",
                "Types retenus (écart partenaire)",
                "Types d'agrégat comptés dans l'écart partenaire retenu (hors compensation).", 50,
                Arrays.asList("IMPACTCOMPTEGENERAL", "FRAISTRANSACTION", "VERSEMENTCOMMISSION")));

        rules.add(liste("CERTIF.SERVICES_TSOP_NEGATIFS", MODULE_CERTIFICATION_SOLDE, "REGULARISATION",
                "Services TSOP à signe négatif",
                "Lorsque le service contient l'une de ces valeurs, le montant TSOP est forcé en négatif.", 60,
                Arrays.asList("CASHIN", "AIRTIME", "SEND")));

        rules.add(liste("CERTIF.TOKENS_COMPENSE", MODULE_CERTIFICATION_SOLDE, "REGULARISATION",
                "Mots-clés de compensation", "Mots-clés permettant d'identifier une ligne de compensation.", 70,
                Arrays.asList("COMPENS")));

        rules.add(liste("CERTIF.TOKENS_TRXSF", MODULE_CERTIFICATION_SOLDE, "REGULARISATION", "Mots-clés TRX SF",
                "Mots-clés permettant d'identifier une ligne TRX SF.", 80,
                Arrays.asList("TRXSF")));

        rules.add(liste("CERTIF.TOKENS_RGFRAIS", MODULE_CERTIFICATION_SOLDE, "REGULARISATION",
                "Mots-clés RGFRAIS / frais", "Mots-clés permettant d'identifier une ligne RGFRAIS ou frais.", 90,
                Arrays.asList("RGFRAIS", "FRAIS")));

        rules.add(parameter("CERTIF.FRAIS_SIGNE", MODULE_CERTIFICATION_SOLDE, "FRAIS",
                "Convention de signe des frais", "Multiplicateur appliqué au montant des frais (généralement -1).",
                100, -1.0));

        rules.add(parameter("CERTIF.TSOP_INCLURE_FRAIS", MODULE_CERTIFICATION_SOLDE, "REGULARISATION",
                "TSOP : inclure les frais au montant",
                "1 = montant TSOP = montantOppart + frais, 0 = montant OPPART seul.", 110, 1.0));

        rules.add(parameter("CERTIF.TSOP_INCLURE_COMMISSION", MODULE_CERTIFICATION_SOLDE, "REGULARISATION",
                "TSOP : inclure la commission au montant",
                "1 = la commission est ajoutée au montant à régulariser, 0 = commission ignorée.", 120, 1.0));

        rules.add(parameter("CERTIF.COMMISSION_SIGNE", MODULE_CERTIFICATION_SOLDE, "REGULARISATION",
                "Convention de signe des commissions",
                "Multiplicateur appliqué au montant des commissions (généralement 1).", 130, 1.0));

        // ===== Écart de solde =====
        rules.add(parameter("ECARTSOLDE.FRAIS_SIGNE", "ECART_SOLDE", "FRAIS", "Convention de signe des frais",
                "Multiplicateur appliqué au montant des frais calculés (généralement -1).", 200, -1.0));

        // ===== Comptes (criticité) =====
        rules.add(parameter("COMPTES.SEUIL_CRITICITE_TRES", "COMPTES", "CRITICITE", "Seuil très critique",
                "Ratio (solde / moyenne volume) sous lequel le compte est classé très critique.", 210, 0.3));
        rules.add(parameter("COMPTES.SEUIL_CRITICITE_MOYEN", "COMPTES", "CRITICITE", "Seuil critique",
                "Ratio sous lequel le compte est classé critique.", 220, 0.6));
        rules.add(parameter("COMPTES.SEUIL_CRITICITE_FAIBLE", "COMPTES", "CRITICITE", "Seuil modérément critique",
                "Ratio sous lequel le compte est classé modérément critique.", 230, 0.8));

        // ===== Sélection des colonnes =====
        rules.add(parameter("COLUMNSELECTION.SEUIL_CONFIANCE", "COLUMN_SELECTION", "CONFIANCE",
                "Seuil de confiance (suggestions)",
                "Confiance minimale pour appliquer automatiquement la meilleure suggestion de clé.", 240, 0.7));

        // ===== Banque (classification des opérations) =====
        rules.add(liste("BANQUE.TYPES_APPROVISIONNEMENT", "BANQUE", "CLASSIFICATION", "Types approvisionnement",
                "Mots-clés de type d'opération classés en approvisionnement (crédit).", 250,
                Arrays.asList("APPRO")));
        rules.add(liste("BANQUE.TYPES_COMPENSATION", "BANQUE", "CLASSIFICATION", "Types compensation",
                "Mots-clés de type d'opération classés en compensation (débit).", 260,
                Arrays.asList("COMPENS", "COMPENSE")));
        rules.add(liste("BANQUE.TYPES_NIVELLEMENT", "BANQUE", "CLASSIFICATION", "Types nivellement",
                "Mots-clés de type d'opération classés en nivellement.", 270,
                Arrays.asList("NIVEL", "NIVELLEMENT")));

        // ===== Modèles (détection des fichiers) =====
        rules.add(liste("MODELES.TOKENS_OPPART", "MODELES", "DETECTION_FICHIERS", "Mots-clés fichier OPPART",
                "Mots-clés du nom de fichier identifiant un fichier OPPART.", 280, Arrays.asList("OPPART")));
        rules.add(liste("MODELES.TOKENS_TRXBO", "MODELES", "DETECTION_FICHIERS", "Mots-clés fichier TRXBO",
                "Mots-clés du nom de fichier identifiant un fichier TRXBO.", 290, Arrays.asList("TRXBO")));
        rules.add(liste("MODELES.TOKENS_USSDPART", "MODELES", "DETECTION_FICHIERS", "Mots-clés fichier USSDPART",
                "Mots-clés du nom de fichier identifiant un fichier USSDPART.", 300, Arrays.asList("USSDPART")));

        // ===== Traitement (formats de fichiers) =====
        rules.add(liste("TRAITEMENT.EXTENSIONS_FICHIERS", MODULE_TRAITEMENT, "FORMATS_FICHIERS",
                "Extensions de fichiers acceptées",
                "Extensions (avec le point) reconnues par le module Traitement pour l'import des fichiers.", 310,
                DEFAULT_EXTENSIONS_FICHIERS));

        // ===== Redevance loterie =====
        rules.add(formule("REDEVANCE.CA_BRUT", MODULE_REDEVANCE_LOTERIE, "INDICATEURS_BRUTS",
                "Chiffre d'affaires brut", "Total des mises moins le total des bonus.", 400,
                terms(term("+", 1, "TOTAL_MISES", false), term("-", 1, "TOTAL_BONUS", false))));
        rules.add(formule("REDEVANCE.PBJ", MODULE_REDEVANCE_LOTERIE, "PRODUITS",
                "Produit brut de jeux", "Coefficient × (PAYIN − PAYOUT). Le coefficient 0,95 correspond à 95 %.", 410,
                terms(term("+", 0.95, "PAYIN", false), term("-", 0.95, "PAYOUT", false))));
        rules.add(formule("REDEVANCE.REMUNERATION", MODULE_REDEVANCE_LOTERIE, "PRODUITS",
                "Rémunération intégrateur", "PAYIN × taux payin + PAYOUT × taux payout.", 420,
                terms(term("+", 1, "PAYIN_X_TAUX", false), term("+", 1, "PAYOUT_X_TAUX", false))));
        rules.add(formule("REDEVANCE.REVENU", MODULE_REDEVANCE_LOTERIE, "PRODUITS",
                "Revenu généré (act. com.)", "Produit brut de jeux moins la rémunération intégrateur.", 430,
                terms(term("+", 1, "PBJ", false), term("-", 1, "REMUNERATION", false))));
        rules.add(formule("REDEVANCE.BASE", MODULE_REDEVANCE_LOTERIE, "REDEVANCE",
                "Base de calcul de la redevance", "Par défaut égale au revenu généré. Ajoutez ou retirez des termes au besoin.", 440,
                terms(term("+", 1, "REVENU", false))));
        rules.add(parameter("REDEVANCE.TAXE_JEUX_HASARD_PCT", MODULE_REDEVANCE_LOTERIE, "PARAMETRES",
                "Taxe jeux de hasard (défaut)",
                "Pourcentage du CA brut (surchargé par les paramètres d'agence s'ils existent).", 450, 5.0));
        rules.add(parameter("REDEVANCE.RETENUE_GAINS_PCT", MODULE_REDEVANCE_LOTERIE, "PARAMETRES",
                "Retenue sur gains (défaut)",
                "Pourcentage de retenue sur les gains (surchargé par les paramètres d'agence).", 460, 15.0));
        rules.add(parameter("REDEVANCE.RETENUE_SEUIL", MODULE_REDEVANCE_LOTERIE, "PARAMETRES",
                "Seuil retenue sur gains (défaut)",
                "Seuil en XOF à partir duquel la retenue s'applique (surchargé par les paramètres d'agence).", 470, 500000.0));
        rules.add(parameter("REDEVANCE.TAUX_DEFAUT", MODULE_REDEVANCE_LOTERIE, "PARAMETRES",
                "Taux de redevance (défaut)",
                "Pourcentage appliqué à la base de calcul (surchargé par les paramètres d'agence).", 480, 50.0));
        rules.add(parameter("REDEVANCE.TAUX_PAYIN_DEFAUT", MODULE_REDEVANCE_LOTERIE, "PARAMETRES",
                "Taux payin (défaut)",
                "Pourcentage de rémunération payin si aucun frais d'agence n'est configuré.", 490, 2.5));
        rules.add(parameter("REDEVANCE.TAUX_PAYOUT_DEFAUT", MODULE_REDEVANCE_LOTERIE, "PARAMETRES",
                "Taux payout (défaut)",
                "Pourcentage de rémunération payout si aucun frais d'agence n'est configuré.", 500, 3.0));
        rules.add(liste("REDEVANCE.SERVICES_PAYIN", MODULE_REDEVANCE_LOTERIE, "FLUX_TRANSACTION",
                "Services PAYIN",
                "Mots-clés de service (agency_summary) agrégés en PAYIN lorsque le flux n'est pas saisi.", 510,
                Arrays.asList("PAIEMENT")));
        rules.add(liste("REDEVANCE.SERVICES_PAYOUT", MODULE_REDEVANCE_LOTERIE, "FLUX_TRANSACTION",
                "Services PAYOUT",
                "Mots-clés de service (agency_summary) agrégés en PAYOUT lorsque le flux n'est pas saisi.", 520,
                Arrays.asList("CASHIN")));

        return rules;
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private CalculationRuleEntity formule(String code, String module, String sousModule, String libelle,
                                          String description, int ordre, String expression) {
        CalculationRuleEntity e = base(code, module, sousModule, libelle, description, ordre);
        e.setType("FORMULE");
        e.setExpression(expression);
        return e;
    }

    private CalculationRuleEntity liste(String code, String module, String sousModule, String libelle,
                                        String description, int ordre, List<String> valeurs) {
        CalculationRuleEntity e = base(code, module, sousModule, libelle, description, ordre);
        e.setType("LISTE");
        e.setValeurs(toJson(valeurs));
        return e;
    }

    private CalculationRuleEntity parameter(String code, String module, String sousModule, String libelle,
                                            String description, int ordre, Double valeur) {
        CalculationRuleEntity e = base(code, module, sousModule, libelle, description, ordre);
        e.setType("PARAMETRE");
        e.setValeur(valeur);
        return e;
    }

    private CalculationRuleEntity base(String code, String module, String sousModule, String libelle,
                                       String description, int ordre) {
        CalculationRuleEntity e = new CalculationRuleEntity();
        e.setCode(code);
        e.setModule(module);
        e.setSousModule(sousModule);
        e.setLibelle(libelle);
        e.setDescription(description);
        e.setOrdre(ordre);
        e.setActif(true);
        e.setSysteme(true);
        return e;
    }

    /** Terme d'une formule (sérialisé en JSON). */
    public static class Term {
        public String signe;
        public double coefficient;
        public String variable;
        public boolean absolue;

        public Term(String signe, double coefficient, String variable, boolean absolue) {
            this.signe = signe;
            this.coefficient = coefficient;
            this.variable = variable;
            this.absolue = absolue;
        }
    }

    private Term term(String signe, double coefficient, String variable, boolean absolue) {
        return new Term(signe, coefficient, variable, absolue);
    }

    private String terms(Term... t) {
        return toJson(Arrays.asList(t));
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Erreur de sérialisation de la règle");
        }
    }

    @Transactional(readOnly = true)
    public Optional<CalculationRuleEntity> findActiveByCode(String code) {
        if (code == null || code.isBlank()) {
            return Optional.empty();
        }
        return repository.findByCode(code).filter(r -> !Boolean.FALSE.equals(r.getActif()));
    }

    @Transactional(readOnly = true)
    public double getNumber(String code, double fallback) {
        return findActiveByCode(code)
                .filter(r -> "PARAMETRE".equals(r.getType()) && r.getValeur() != null)
                .map(CalculationRuleEntity::getValeur)
                .orElse(fallback);
    }

    /**
     * Liste de mots-clés d'une règle LISTE, normalisée pour une recherche par sous-chaîne
     * (MAJUSCULES, sans accents). La règle configurée est prioritaire ; en son absence
     * (règle supprimée, désactivée ou absente), le repli code est conservé.
     */
    @Transactional(readOnly = true)
    public List<String> getKeywordList(String code, List<String> fallback) {
        return getList(code, fallback).stream()
                .map(this::normalizeKeyword)
                .filter(keyword -> !keyword.isEmpty())
                .toList();
    }

    /**
     * Vrai si le texte contient l'un des mots-clés de la règle LISTE.
     * Utilisé pour les classifications par type d'opération / service : la règle configurée
     * dans Configuration &gt; Calcul est prioritaire, le code reste le repli par défaut.
     */
    @Transactional(readOnly = true)
    public boolean matchesAny(String text, String code, List<String> fallback) {
        if (text == null || text.isBlank()) {
            return false;
        }
        String normalizedText = normalizeKeyword(text);
        if (normalizedText.isEmpty()) {
            return false;
        }
        for (String keyword : getKeywordList(code, fallback)) {
            if (normalizedText.contains(keyword)) {
                return true;
            }
        }
        return false;
    }

    /** Normalisation d'un mot-clé : MAJUSCULES, sans accents (séparateurs conservés). */
    private String normalizeKeyword(String value) {
        if (value == null) {
            return "";
        }
        return Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toUpperCase(Locale.ROOT)
                .trim();
    }

    @Transactional(readOnly = true)
    public List<String> getList(String code, List<String> fallback) {
        Optional<CalculationRuleEntity> rule = findActiveByCode(code)
                .filter(r -> "LISTE".equals(r.getType()) && r.getValeurs() != null && !r.getValeurs().isBlank());
        if (rule.isEmpty()) {
            return fallback != null ? fallback : Collections.emptyList();
        }
        try {
            List<String> parsed = objectMapper.readValue(rule.get().getValeurs(), new TypeReference<List<String>>() {});
            if (parsed == null || parsed.isEmpty()) {
                return fallback != null ? fallback : Collections.emptyList();
            }
            return parsed;
        } catch (Exception e) {
            return fallback != null ? fallback : Collections.emptyList();
        }
    }

    @Transactional(readOnly = true)
    public double evaluate(String code, Map<String, Double> variables, double fallback) {
        Optional<CalculationRuleEntity> rule = findActiveByCode(code)
                .filter(r -> "FORMULE".equals(r.getType()) && r.getExpression() != null && !r.getExpression().isBlank());
        if (rule.isEmpty()) {
            return fallback;
        }
        return evaluateExpression(rule.get().getExpression(), variables, fallback);
    }

    @Transactional(readOnly = true)
    public String formulaPreview(String code) {
        Optional<CalculationRuleEntity> rule = findActiveByCode(code)
                .filter(r -> "FORMULE".equals(r.getType()) && r.getExpression() != null);
        if (rule.isEmpty()) {
            return "";
        }
        try {
            JsonNode arr = objectMapper.readTree(rule.get().getExpression());
            if (!arr.isArray() || arr.isEmpty()) {
                return "";
            }
            StringBuilder sb = new StringBuilder();
            int i = 0;
            for (JsonNode t : arr) {
                String signe = t.path("signe").asText("+");
                double coef = t.path("coefficient").asDouble(1);
                String variable = t.path("variable").asText("");
                boolean absolue = t.path("absolue").asBoolean(false);
                String abs = absolue ? "|" + variable + "|" : variable;
                String coefStr = (coef != 1.0) ? (stripTrailingZeros(coef) + "×") : "";
                String termStr = coefStr + abs;
                if (i == 0) {
                    sb.append("-".equals(signe) ? "−" + termStr : termStr);
                } else {
                    sb.append("-".equals(signe) ? " − " + termStr : " + " + termStr);
                }
                i++;
            }
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    public double evaluateExpression(String expression, Map<String, Double> variables, double fallback) {
        try {
            JsonNode arr = objectMapper.readTree(expression);
            if (!arr.isArray() || arr.isEmpty()) {
                return fallback;
            }
            double sum = 0;
            for (JsonNode t : arr) {
                String signe = t.path("signe").asText("+");
                double coef = t.path("coefficient").asDouble(1);
                String variable = t.path("variable").asText("");
                boolean absolue = t.path("absolue").asBoolean(false);
                double dir = "-".equals(signe) ? -1 : 1;
                double value = 0;
                if (variables != null && variable != null) {
                    Double v = variables.get(variable);
                    if (v != null) {
                        value = v;
                    }
                }
                if (absolue) {
                    value = Math.abs(value);
                }
                sum += dir * coef * value;
            }
            return sum;
        } catch (Exception e) {
            return fallback;
        }
    }

    private static String stripTrailingZeros(double coef) {
        if (coef == (long) coef) {
            return String.valueOf((long) coef);
        }
        return String.valueOf(coef);
    }

    /** Valide le contenu selon le type (JSON bien formé, champs obligatoires). */
    private void validate(CalculationRuleEntity rule) {
        String type = rule.getType();
        if (type == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le type est obligatoire");
        }
        switch (type) {
            case "FORMULE" -> {
                if (rule.getExpression() == null || rule.getExpression().trim().isEmpty()) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Une formule doit contenir une expression");
                }
                try {
                    objectMapper.readTree(rule.getExpression());
                } catch (Exception e) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Expression JSON invalide");
                }
            }
            case "LISTE" -> {
                if (rule.getValeurs() == null || rule.getValeurs().trim().isEmpty()) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Une liste doit contenir des valeurs");
                }
                try {
                    objectMapper.readTree(rule.getValeurs());
                } catch (Exception e) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Valeurs JSON invalides");
                }
            }
            case "PARAMETRE" -> {
                if (rule.getValeur() == null) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Un paramètre doit contenir une valeur");
                }
            }
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Type de règle inconnu: " + type);
        }
    }
}
