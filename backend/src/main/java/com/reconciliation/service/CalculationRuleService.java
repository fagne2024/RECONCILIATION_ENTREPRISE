package com.reconciliation.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.reconciliation.entity.CalculationRuleEntity;
import com.reconciliation.repository.CalculationRuleRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Gestion des règles de calcul configurables (sous-module Configuration &gt; Calcul).
 */
@Service
public class CalculationRuleService {

    public static final String MODULE_CERTIFICATION_SOLDE = "CERTIFICATION_SOLDE";

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
                Arrays.asList("CASHIN", "AIRTIME")));

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

        for (CalculationRuleEntity rule : rules) {
            if (!repository.existsByCode(rule.getCode())) {
                repository.save(rule);
            }
        }
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
