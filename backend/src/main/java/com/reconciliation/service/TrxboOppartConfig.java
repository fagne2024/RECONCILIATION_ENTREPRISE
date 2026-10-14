package com.reconciliation.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Configuration métier TRXBO/OPPART portée par un modèle partenaire.
 *
 * <p>Stockée dans {@code reconciliation_logic.parameters.trxboOppart} :</p>
 * <pre>
 * {
 *   "type": "SPECIAL_RATIO",
 *   "parameters": {
 *     "expectedRatio": "1:3",
 *     "trxboOppart": {
 *       "operationTypes": { "impact": "IMPACT_COMPTE_GENERAL", "fees": "FRAIS_TRANSACTION", "commission": "VERSEMENT_COMMISSION" },
 *       "comments": { "tsop": "TSOP", "trxsf": "TRXSF", "rgfrais": "RGFRAIS",
 *                     "trxsvc": "TRXSVC", "trxsfTrxsvc": "TRXSF &amp; TRXSVC",
 *                     "ecart": "Ecart", "partnerOnly": "Ecart" }
 *     }
 *   }
 * }
 * </pre>
 *
 * <p>Toute valeur absente ou vide conserve le libellé par défaut : la configuration
 * surcharge le code, elle ne le remplace pas.</p>
 */
public class TrxboOppartConfig {

    public static final String CONFIG_KEY = "trxboOppart";
    public static final String OPERATION_TYPES_KEY = "operationTypes";
    public static final String COMMENTS_KEY = "comments";
    public static final String ADDITIONAL_OPERATION_TYPES_KEY = "additionalOperationTypes";
    /** Règles de régularisation paramétrables par cas (libellé du commentaire). */
    public static final String REGULARISATION_RULES_KEY = "regularisationRules";
    /** Description des types d'agrégats des écarts (mode de régularisation BO/partenaire + libellés). */
    public static final String AGGREGATION_TYPES_KEY = "aggregationTypes";

    /* Modes de régularisation côté BO. */
    public static final String BO_MODE_MONTANT_FRAIS = "MONTANT_FRAIS";
    public static final String BO_MODE_MONTANT = "MONTANT";
    public static final String BO_MODE_FRAIS = "FRAIS";
    public static final String BO_MODE_SIMPLE = "SIMPLE";
    public static final String BO_MODE_NONE = "NONE";

    /* Modes de régularisation côté partenaire. */
    public static final String PARTNER_MODE_MONTANT = "MONTANT";
    public static final String PARTNER_MODE_FRAIS = "FRAIS";
    public static final String PARTNER_MODE_ZERO = "ZERO";
    public static final String PARTNER_MODE_NONE = "NONE";

    /**
     * Type d'opération supplémentaire déclaré sur le modèle, avec son commentaire associé.
     * Le commentaire est appliqué quand le groupe partenaire contient ce type et aucun des
     * trois types principaux (impact, frais, commission).
     */
    public static class AdditionalOperationType {
        private String label;
        private String commentBo;
        private String commentPartner;

        public AdditionalOperationType() {
        }

        public AdditionalOperationType(String label, String commentBo, String commentPartner) {
            this.label = label;
            this.commentBo = commentBo;
            this.commentPartner = commentPartner;
        }

        public String getLabel() {
            return this.label;
        }

        public void setLabel(String label) {
            this.label = label;
        }

        public String getCommentBo() {
            return this.commentBo;
        }

        public void setCommentBo(String commentBo) {
            this.commentBo = commentBo;
        }

        public String getCommentPartner() {
            return this.commentPartner;
        }

        public void setCommentPartner(String commentPartner) {
            this.commentPartner = commentPartner;
        }
    }

    /**
     * Règle de régularisation paramétrable pour un cas (identifié par le libellé de son
     * commentaire de réconciliation). La règle compose le montant à régulariser à partir de
     * plusieurs composants, chacun référençant une source de montant et son signe.
     */
    public static class RegularisationRule {
        private String caseLabel;
        private List<RegularisationComponent> components = new ArrayList<RegularisationComponent>();

        public RegularisationRule() {
        }

        public RegularisationRule(String caseLabel) {
            this.caseLabel = caseLabel;
        }

        public String getCaseLabel() {
            return this.caseLabel;
        }

        public void setCaseLabel(String caseLabel) {
            this.caseLabel = caseLabel;
        }

        public List<RegularisationComponent> getComponents() {
            return this.components;
        }

        public void setComponents(List<RegularisationComponent> components) {
            this.components = components == null ? new ArrayList<RegularisationComponent>() : components;
        }

        public void addComponent(RegularisationComponent component) {
            if (this.components == null) {
                this.components = new ArrayList<RegularisationComponent>();
            }
            this.components.add(component);
        }
    }

    /**
     * Composant d'une règle de régularisation.
     *
     * <ul>
     *   <li>{@code source} : {@code BO_AMOUNT} (montant de la ligne BO), {@code OPPART_TYPE}
     *       (montant des lignes OPPART du {@code type} indiqué) ou {@code CALCULATED_FRAIS}
     *       (frais calculés via la configuration /frais pour le service + client) ;</li>
     *   <li>{@code sign} : {@code POSITIVE}, {@code NEGATIVE}, {@code SOURCE} (signe du montant
     *       source) ou {@code SERVICE_BASED} (négatif si le service BO contient un des
     *       {@code negativeTokens}, sinon {@code defaultSign}) ;</li>
     *   <li>{@code coefficient} : multiplicateur optionnel (1 par défaut).</li>
     * </ul>
     */
    public static class RegularisationComponent {
        private String source;
        private String type;
        private String sign = "SOURCE";
        private List<String> negativeTokens = new ArrayList<String>();
        private String defaultSign = "POSITIVE";
        private Double coefficient;

        public RegularisationComponent() {
        }

        public String getSource() {
            return this.source;
        }

        public void setSource(String source) {
            this.source = source;
        }

        public String getType() {
            return this.type;
        }

        public void setType(String type) {
            this.type = type;
        }

        public String getSign() {
            return this.sign;
        }

        public void setSign(String sign) {
            this.sign = sign;
        }

        public List<String> getNegativeTokens() {
            return this.negativeTokens;
        }

        public void setNegativeTokens(List<String> negativeTokens) {
            this.negativeTokens = negativeTokens == null ? new ArrayList<String>() : negativeTokens;
        }

        public String getDefaultSign() {
            return this.defaultSign;
        }

        public void setDefaultSign(String defaultSign) {
            this.defaultSign = defaultSign;
        }

        public Double getCoefficient() {
            return this.coefficient;
        }

        public void setCoefficient(Double coefficient) {
            this.coefficient = coefficient;
        }
    }

    /**
     * Description d'un agrégat d'écart : comment il est détecté (commentaire BO/partenaire),
     * comment il est libellé et comment il est régularisé de chaque côté.
     *
     * <p>Modes BO : {@code MONTANT_FRAIS} (montant + frais + commission), {@code MONTANT}
     * (montant seul), {@code FRAIS} (frais seuls), {@code SIMPLE} (agrégat simple sans
     * détail, volume = montant), {@code NONE} (aucun agrégat BO).</p>
     * <p>Modes partenaire : {@code MONTANT} (montant seul), {@code FRAIS} (frais seuls,
     * agrégat simple), {@code ZERO} (détail affiché, montant à régulariser = 0),
     * {@code NONE} (aucun agrégat partenaire).</p>
     */
    public static class AggregationType {
        private String kind;
        private String commentBo;
        private String commentPartner;
        private String boLabel;
        private String partnerLabel;
        private String boMode = BO_MODE_MONTANT_FRAIS;
        private String partnerMode = PARTNER_MODE_MONTANT;

        public AggregationType() {
        }

        public AggregationType(String kind, String commentBo, String commentPartner,
                               String boLabel, String partnerLabel, String boMode, String partnerMode) {
            this.kind = kind;
            this.commentBo = commentBo;
            this.commentPartner = commentPartner;
            this.boLabel = boLabel;
            this.partnerLabel = partnerLabel;
            this.boMode = boMode;
            this.partnerMode = partnerMode;
        }

        public String getKind() {
            return this.kind;
        }

        public void setKind(String kind) {
            this.kind = kind;
        }

        public String getCommentBo() {
            return this.commentBo;
        }

        public void setCommentBo(String commentBo) {
            this.commentBo = commentBo;
        }

        public String getCommentPartner() {
            return this.commentPartner;
        }

        public void setCommentPartner(String commentPartner) {
            this.commentPartner = commentPartner;
        }

        public String getBoLabel() {
            return this.boLabel;
        }

        public void setBoLabel(String boLabel) {
            this.boLabel = boLabel;
        }

        public String getPartnerLabel() {
            return this.partnerLabel;
        }

        public void setPartnerLabel(String partnerLabel) {
            this.partnerLabel = partnerLabel;
        }

        public String getBoMode() {
            return this.boMode;
        }

        public void setBoMode(String boMode) {
            this.boMode = boMode == null || boMode.isEmpty() ? BO_MODE_MONTANT_FRAIS : boMode;
        }

        public String getPartnerMode() {
            return this.partnerMode;
        }

        public void setPartnerMode(String partnerMode) {
            this.partnerMode = partnerMode == null || partnerMode.isEmpty() ? PARTNER_MODE_MONTANT : partnerMode;
        }
    }

    private String impactType = "IMPACT_COMPTE_GENERAL";
    private String feesType = "FRAIS_TRANSACTION";
    private String commissionType = "VERSEMENT_COMMISSION";
    private List<AdditionalOperationType> additionalOperationTypes = new ArrayList<AdditionalOperationType>();
    private List<RegularisationRule> regularisationRules = new ArrayList<RegularisationRule>();
    private List<AggregationType> aggregationTypes = new ArrayList<AggregationType>();

    private String commentTsop = "TSOP";
    private String commentTrxsf = "TRXSF";
    private String commentRgfrais = "RGFRAIS";
    private String commentTrxsvc = "TRXSVC";
    private String commentFraisSansCommission = "TRXSC";
    private String commentRegcom = "REGCOM";
    private String commentFraisEtCommission = "RGFRAIS & REGCOM";
    private String commentTrxsfTrxsvc = "TRXSF & TRXSVC";
    private String commentEcart = "Ecart";
    private String commentPartnerOnly = "Ecart";

    public static TrxboOppartConfig defaults() {
        return new TrxboOppartConfig();
    }

    @SuppressWarnings("unchecked")
    public static TrxboOppartConfig fromMap(Map<String, Object> rawConfig) {
        TrxboOppartConfig config = new TrxboOppartConfig();
        if (rawConfig == null || rawConfig.isEmpty()) {
            return config;
        }

        Object rawOperationTypes = rawConfig.get(OPERATION_TYPES_KEY);
        if (rawOperationTypes instanceof Map) {
            Map<String, Object> operationTypes = (Map<String, Object>) rawOperationTypes;
            config.impactType = readValue(operationTypes, "impact", config.impactType);
            config.feesType = readValue(operationTypes, "fees", config.feesType);
            config.commissionType = readValue(operationTypes, "commission", config.commissionType);
        }

        Object rawComments = rawConfig.get(COMMENTS_KEY);
        if (rawComments instanceof Map) {
            Map<String, Object> comments = (Map<String, Object>) rawComments;
            config.commentTsop = readValue(comments, "tsop", config.commentTsop);
            config.commentTrxsf = readValue(comments, "trxsf", config.commentTrxsf);
            config.commentRgfrais = readValue(comments, "rgfrais", config.commentRgfrais);
            config.commentTrxsvc = readValue(comments, "trxsvc", config.commentTrxsvc);
            config.commentFraisSansCommission = readValue(comments, "fraisSansCommission", config.commentFraisSansCommission);
            config.commentRegcom = readValue(comments, "regcom", config.commentRegcom);
            config.commentFraisEtCommission = readValue(comments, "fraisEtCommission", config.commentFraisEtCommission);
            config.commentTrxsfTrxsvc = readValue(comments, "trxsfTrxsvc", config.commentTrxsfTrxsvc);
            config.commentEcart = readValue(comments, "ecart", config.commentEcart);
            config.commentPartnerOnly = readValue(comments, "partnerOnly", config.commentPartnerOnly);
        }

        Object rawAdditionalTypes = rawConfig.get(ADDITIONAL_OPERATION_TYPES_KEY);
        if (rawAdditionalTypes instanceof List) {
            for (Object rawEntry : (List<?>) rawAdditionalTypes) {
                if (!(rawEntry instanceof Map)) {
                    continue;
                }
                Map<String, Object> entry = (Map<String, Object>) rawEntry;
                String label = readValue(entry, "label", null);
                if (label == null) {
                    continue;
                }
                config.additionalOperationTypes.add(new AdditionalOperationType(
                        label,
                        readValue(entry, "commentBo", ""),
                        readValue(entry, "commentPartner", "")));
            }
        }

        Object rawRules = rawConfig.get(REGULARISATION_RULES_KEY);
        if (rawRules instanceof List) {
            for (Object rawRule : (List<?>) rawRules) {
                if (!(rawRule instanceof Map)) {
                    continue;
                }
                Map<String, Object> ruleMap = (Map<String, Object>) rawRule;
                String caseLabel = readValue(ruleMap, "case", null);
                if (caseLabel == null) {
                    continue;
                }
                RegularisationRule rule = new RegularisationRule(caseLabel);
                Object rawComponents = ruleMap.get("components");
                if (rawComponents instanceof List) {
                    for (Object rawComponent : (List<?>) rawComponents) {
                        if (!(rawComponent instanceof Map)) {
                            continue;
                        }
                        Map<String, Object> componentMap = (Map<String, Object>) rawComponent;
                        String source = readValue(componentMap, "source", null);
                        if (source == null) {
                            continue;
                        }
                        RegularisationComponent component = new RegularisationComponent();
                        component.setSource(source);
                        component.setType(readValue(componentMap, "type", null));
                        component.setSign(readValue(componentMap, "sign", "SOURCE"));
                        component.setNegativeTokens(readStringList(componentMap, "negativeTokens"));
                        component.setDefaultSign(readValue(componentMap, "defaultSign", "POSITIVE"));
                        Object coefficient = componentMap.get("coefficient");
                        if (coefficient instanceof Number) {
                            component.setCoefficient(((Number) coefficient).doubleValue());
                        }
                        rule.addComponent(component);
                    }
                }
                config.regularisationRules.add(rule);
            }
        }

        Object rawAggregationTypes = rawConfig.get(AGGREGATION_TYPES_KEY);
        if (rawAggregationTypes instanceof List) {
            for (Object rawEntry : (List<?>) rawAggregationTypes) {
                if (!(rawEntry instanceof Map)) {
                    continue;
                }
                Map<String, Object> entry = (Map<String, Object>) rawEntry;
                AggregationType type = new AggregationType();
                type.setKind(readValue(entry, "kind", null));
                type.setCommentBo(readValue(entry, "commentBo", ""));
                type.setCommentPartner(readValue(entry, "commentPartner", ""));
                type.setBoLabel(readValue(entry, "boLabel", ""));
                type.setPartnerLabel(readValue(entry, "partnerLabel", ""));
                type.setBoMode(readValue(entry, "boMode", BO_MODE_MONTANT_FRAIS));
                type.setPartnerMode(readValue(entry, "partnerMode", PARTNER_MODE_MONTANT));
                config.aggregationTypes.add(type);
            }
        }
        if (config.aggregationTypes.isEmpty()) {
            config.aggregationTypes = config.buildDefaultAggregationTypes();
        }

        return config;
    }

    private static List<String> readStringList(Map<String, Object> source, String key) {
        List<String> result = new ArrayList<String>();
        Object value = source.get(key);
        if (!(value instanceof List)) {
            return result;
        }
        for (Object item : (List<?>) value) {
            if (item == null) {
                continue;
            }
            String text = String.valueOf(item).trim();
            if (!text.isEmpty()) {
                result.add(text);
            }
        }
        return result;
    }

    private static String readValue(Map<String, Object> source, String key, String defaultValue) {
        Object value = source.get(key);
        if (value == null) {
            return defaultValue;
        }
        String text = String.valueOf(value).trim();
        if (text.isEmpty()) {
            return defaultValue == null ? null : defaultValue;
        }
        return text;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> operationTypes = new LinkedHashMap<>();
        operationTypes.put("impact", this.impactType);
        operationTypes.put("fees", this.feesType);
        operationTypes.put("commission", this.commissionType);

        Map<String, Object> comments = new LinkedHashMap<>();
        comments.put("tsop", this.commentTsop);
        comments.put("trxsf", this.commentTrxsf);
        comments.put("rgfrais", this.commentRgfrais);
        comments.put("trxsvc", this.commentTrxsvc);
        comments.put("fraisSansCommission", this.commentFraisSansCommission);
        comments.put("regcom", this.commentRegcom);
        comments.put("fraisEtCommission", this.commentFraisEtCommission);
        comments.put("trxsfTrxsvc", this.commentTrxsfTrxsvc);
        comments.put("ecart", this.commentEcart);
        comments.put("partnerOnly", this.commentPartnerOnly);

        Map<String, Object> config = new LinkedHashMap<>();
        config.put(OPERATION_TYPES_KEY, operationTypes);
        config.put(COMMENTS_KEY, comments);
        if (this.additionalOperationTypes != null && !this.additionalOperationTypes.isEmpty()) {
            List<Map<String, Object>> additionalTypes = new ArrayList<>();
            for (AdditionalOperationType additionalType : this.additionalOperationTypes) {
                if (additionalType == null || additionalType.getLabel() == null || additionalType.getLabel().trim().isEmpty()) {
                    continue;
                }
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("label", additionalType.getLabel());
                entry.put("commentBo", additionalType.getCommentBo() == null ? "" : additionalType.getCommentBo());
                entry.put("commentPartner", additionalType.getCommentPartner() == null ? "" : additionalType.getCommentPartner());
                additionalTypes.add(entry);
            }
            if (!additionalTypes.isEmpty()) {
                config.put(ADDITIONAL_OPERATION_TYPES_KEY, additionalTypes);
            }
        }
        List<Map<String, Object>> rules = this.regularisationRulesAsList();
        if (!rules.isEmpty()) {
            config.put(REGULARISATION_RULES_KEY, rules);
        }
        List<Map<String, Object>> aggregationTypes = this.aggregationTypesAsList();
        if (!aggregationTypes.isEmpty()) {
            config.put(AGGREGATION_TYPES_KEY, aggregationTypes);
        }
        return config;
    }

    /**
     * Commentaires configurés (clés: tsop, trxsf, rgfrais, …) exposés au front via la réponse de
     * réconciliation, afin d'identifier de façon fiable le type de chaque écart (ex. TRX SANS FRAIS).
     */
    public Map<String, String> commentsAsMap() {
        Map<String, String> comments = new LinkedHashMap<>();
        comments.put("tsop", this.commentTsop);
        comments.put("trxsf", this.commentTrxsf);
        comments.put("rgfrais", this.commentRgfrais);
        comments.put("trxsvc", this.commentTrxsvc);
        comments.put("fraisSansCommission", this.commentFraisSansCommission);
        comments.put("regcom", this.commentRegcom);
        comments.put("fraisEtCommission", this.commentFraisEtCommission);
        comments.put("trxsfTrxsvc", this.commentTrxsfTrxsvc);
        comments.put("ecart", this.commentEcart);
        comments.put("partnerOnly", this.commentPartnerOnly);
        return comments;
    }

    /** Règles de régularisation sérialisées pour la réponse de réconciliation. */
    public List<Map<String, Object>> regularisationRulesAsList() {
        List<Map<String, Object>> rules = new ArrayList<>();
        if (this.regularisationRules == null) {
            return rules;
        }
        for (RegularisationRule rule : this.regularisationRules) {
            if (rule == null || rule.getCaseLabel() == null || rule.getCaseLabel().trim().isEmpty()) {
                continue;
            }
            Map<String, Object> ruleMap = new LinkedHashMap<>();
            ruleMap.put("case", rule.getCaseLabel());
            List<Map<String, Object>> components = new ArrayList<>();
            for (RegularisationComponent component : rule.getComponents()) {
                if (component == null || component.getSource() == null || component.getSource().trim().isEmpty()) {
                    continue;
                }
                Map<String, Object> componentMap = new LinkedHashMap<>();
                componentMap.put("source", component.getSource());
                if (component.getType() != null && !component.getType().trim().isEmpty()) {
                    componentMap.put("type", component.getType());
                }
                componentMap.put("sign", component.getSign() == null ? "SOURCE" : component.getSign());
                if (component.getNegativeTokens() != null && !component.getNegativeTokens().isEmpty()) {
                    componentMap.put("negativeTokens", component.getNegativeTokens());
                }
                if (component.getDefaultSign() != null && !component.getDefaultSign().trim().isEmpty()) {
                    componentMap.put("defaultSign", component.getDefaultSign());
                }
                if (component.getCoefficient() != null) {
                    componentMap.put("coefficient", component.getCoefficient());
                }
                components.add(componentMap);
            }
            ruleMap.put("components", components);
            rules.add(ruleMap);
        }
        return rules;
    }

    /**
     * Description des agrégats des écarts (types reconnus, libellés BO/partenaire et mode de
     * régularisation de chaque côté) exposés au front via la réponse de réconciliation.
     */
    public List<Map<String, Object>> aggregationTypesAsList() {
        List<Map<String, Object>> types = new ArrayList<>();
        for (AggregationType type : this.getAggregationTypes()) {
            if (type == null) {
                continue;
            }
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("kind", type.getKind());
            entry.put("commentBo", type.getCommentBo() == null ? "" : type.getCommentBo());
            entry.put("commentPartner", type.getCommentPartner() == null ? "" : type.getCommentPartner());
            entry.put("boLabel", type.getBoLabel() == null ? "" : type.getBoLabel());
            entry.put("partnerLabel", type.getPartnerLabel() == null ? "" : type.getPartnerLabel());
            entry.put("boMode", type.getBoMode() == null ? BO_MODE_MONTANT_FRAIS : type.getBoMode());
            entry.put("partnerMode", type.getPartnerMode() == null ? PARTNER_MODE_MONTANT : type.getPartnerMode());
            types.add(entry);
        }
        return types;
    }

    /** Types d'agrégats par défaut, bâtis à partir des commentaires configurés. */
    private List<AggregationType> buildDefaultAggregationTypes() {
        List<AggregationType> types = new ArrayList<>();
        types.add(new AggregationType("tsop", this.commentTsop, this.commentTsop,
                this.commentTsop, this.commentTsop, BO_MODE_MONTANT_FRAIS, PARTNER_MODE_MONTANT));
        types.add(new AggregationType("trxsf", this.commentTrxsf, this.commentTrxsf,
                this.commentTrxsf, "OP SANS FRAIS", BO_MODE_FRAIS, PARTNER_MODE_ZERO));
        types.add(new AggregationType("rgfrais", this.commentRgfrais, this.commentRgfrais,
                this.commentRgfrais, this.commentRgfrais, BO_MODE_NONE, PARTNER_MODE_FRAIS));
        types.add(new AggregationType("ecart", this.commentEcart, this.commentEcart,
                "Écart BO", "Écart Partenaire", BO_MODE_SIMPLE, PARTNER_MODE_MONTANT));
        types.add(new AggregationType("partnerOnly", this.commentPartnerOnly, this.commentPartnerOnly,
                this.commentPartnerOnly, this.commentPartnerOnly, BO_MODE_NONE, PARTNER_MODE_MONTANT));
        types.add(new AggregationType("trxsvc", this.commentTrxsvc, this.commentTrxsvc,
                this.commentTrxsvc, this.commentTrxsvc, BO_MODE_MONTANT_FRAIS, PARTNER_MODE_MONTANT));
        types.add(new AggregationType("fraisSansCommission", this.commentFraisSansCommission, this.commentFraisSansCommission,
                this.commentFraisSansCommission, this.commentFraisSansCommission, BO_MODE_MONTANT_FRAIS, PARTNER_MODE_MONTANT));
        types.add(new AggregationType("regcom", this.commentRegcom, this.commentRegcom,
                this.commentRegcom, this.commentRegcom, BO_MODE_MONTANT_FRAIS, PARTNER_MODE_MONTANT));
        types.add(new AggregationType("fraisEtCommission", this.commentFraisEtCommission, this.commentFraisEtCommission,
                this.commentFraisEtCommission, this.commentFraisEtCommission, BO_MODE_MONTANT_FRAIS, PARTNER_MODE_MONTANT));
        types.add(new AggregationType("trxsfTrxsvc", this.commentTrxsfTrxsvc, this.commentTrxsfTrxsvc,
                this.commentTrxsfTrxsvc, this.commentTrxsfTrxsvc, BO_MODE_MONTANT_FRAIS, PARTNER_MODE_MONTANT));
        if (this.additionalOperationTypes != null) {
            for (AdditionalOperationType additionalType : this.additionalOperationTypes) {
                if (additionalType == null || additionalType.getLabel() == null || additionalType.getLabel().trim().isEmpty()) {
                    continue;
                }
                String commentBo = additionalType.getCommentBo() == null || additionalType.getCommentBo().trim().isEmpty()
                        ? additionalType.getLabel() : additionalType.getCommentBo();
                String commentPartner = additionalType.getCommentPartner() == null || additionalType.getCommentPartner().trim().isEmpty()
                        ? commentBo : additionalType.getCommentPartner();
                types.add(new AggregationType("additional:" + additionalType.getLabel(),
                        commentBo, commentPartner,
                        commentBo, commentPartner, BO_MODE_MONTANT_FRAIS, PARTNER_MODE_MONTANT));
            }
        }
        return types;
    }

    /**
     * Types d'agrégats résolus : configuration explicite si renseignée, sinon dérivés des
     * commentaires configurés.
     */
    public List<AggregationType> getAggregationTypes() {
        if (this.aggregationTypes == null || this.aggregationTypes.isEmpty()) {
            this.aggregationTypes = this.buildDefaultAggregationTypes();
        }
        return this.aggregationTypes;
    }

    public void setAggregationTypes(List<AggregationType> aggregationTypes) {
        this.aggregationTypes = aggregationTypes == null ? new ArrayList<AggregationType>() : aggregationTypes;
    }

    public boolean isCustomized() {
        TrxboOppartConfig defaults = new TrxboOppartConfig();
        return !this.impactType.equals(defaults.impactType)
                || !this.feesType.equals(defaults.feesType)
                || !this.commissionType.equals(defaults.commissionType)
                || !this.commentTsop.equals(defaults.commentTsop)
                || !this.commentTrxsf.equals(defaults.commentTrxsf)
                || !this.commentRgfrais.equals(defaults.commentRgfrais)
                || !this.commentTrxsvc.equals(defaults.commentTrxsvc)
                || !this.commentFraisSansCommission.equals(defaults.commentFraisSansCommission)
                || !this.commentRegcom.equals(defaults.commentRegcom)
                || !this.commentFraisEtCommission.equals(defaults.commentFraisEtCommission)
                || !this.commentTrxsfTrxsvc.equals(defaults.commentTrxsfTrxsvc)
                || !this.commentEcart.equals(defaults.commentEcart)
                || !this.commentPartnerOnly.equals(defaults.commentPartnerOnly)
                || (this.additionalOperationTypes != null && !this.additionalOperationTypes.isEmpty())
                || (this.regularisationRules != null && !this.regularisationRules.isEmpty());
    }

    public List<RegularisationRule> getRegularisationRules() {
        return this.regularisationRules;
    }

    public void setRegularisationRules(List<RegularisationRule> regularisationRules) {
        this.regularisationRules = regularisationRules == null ? new ArrayList<RegularisationRule>() : regularisationRules;
    }

    public void addRegularisationRule(RegularisationRule regularisationRule) {
        if (this.regularisationRules == null) {
            this.regularisationRules = new ArrayList<RegularisationRule>();
        }
        this.regularisationRules.add(regularisationRule);
    }

    public List<AdditionalOperationType> getAdditionalOperationTypes() {
        return this.additionalOperationTypes;
    }

    public void setAdditionalOperationTypes(List<AdditionalOperationType> additionalOperationTypes) {
        this.additionalOperationTypes = additionalOperationTypes == null ? new ArrayList<AdditionalOperationType>() : additionalOperationTypes;
    }

    public void addAdditionalOperationType(AdditionalOperationType additionalOperationType) {
        if (this.additionalOperationTypes == null) {
            this.additionalOperationTypes = new ArrayList<AdditionalOperationType>();
        }
        this.additionalOperationTypes.add(additionalOperationType);
    }

    public String getImpactType() {
        return this.impactType;
    }

    public void setImpactType(String impactType) {
        this.impactType = impactType;
    }

    public String getFeesType() {
        return this.feesType;
    }

    public void setFeesType(String feesType) {
        this.feesType = feesType;
    }

    public String getCommissionType() {
        return this.commissionType;
    }

    public void setCommissionType(String commissionType) {
        this.commissionType = commissionType;
    }

    public String getCommentTsop() {
        return this.commentTsop;
    }

    public void setCommentTsop(String commentTsop) {
        this.commentTsop = commentTsop;
    }

    public String getCommentTrxsf() {
        return this.commentTrxsf;
    }

    public void setCommentTrxsf(String commentTrxsf) {
        this.commentTrxsf = commentTrxsf;
    }

    public String getCommentRgfrais() {
        return this.commentRgfrais;
    }

    public void setCommentRgfrais(String commentRgfrais) {
        this.commentRgfrais = commentRgfrais;
    }

    public String getCommentTrxsvc() {
        return this.commentTrxsvc;
    }

    public void setCommentTrxsvc(String commentTrxsvc) {
        this.commentTrxsvc = commentTrxsvc;
    }

    public String getCommentFraisEtCommission() {
        return this.commentFraisEtCommission;
    }

    public void setCommentFraisEtCommission(String commentFraisEtCommission) {
        this.commentFraisEtCommission = commentFraisEtCommission;
    }

    public String getCommentRegcom() {
        return this.commentRegcom;
    }

    public void setCommentRegcom(String commentRegcom) {
        this.commentRegcom = commentRegcom;
    }

    public String getCommentFraisSansCommission() {
        return this.commentFraisSansCommission;
    }

    public void setCommentFraisSansCommission(String commentFraisSansCommission) {
        this.commentFraisSansCommission = commentFraisSansCommission;
    }

    public String getCommentTrxsfTrxsvc() {
        return this.commentTrxsfTrxsvc;
    }

    public void setCommentTrxsfTrxsvc(String commentTrxsfTrxsvc) {
        this.commentTrxsfTrxsvc = commentTrxsfTrxsvc;
    }

    public String getCommentEcart() {
        return this.commentEcart;
    }

    public void setCommentEcart(String commentEcart) {
        this.commentEcart = commentEcart;
    }

    public String getCommentPartnerOnly() {
        return this.commentPartnerOnly;
    }

    public void setCommentPartnerOnly(String commentPartnerOnly) {
        this.commentPartnerOnly = commentPartnerOnly;
    }
}
