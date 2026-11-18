package com.reconciliation.dto;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * Ligne d'un fichier banque (opérations ou relevé) déjà présente en base, proposée à
 * l'utilisateur avant le chargement : il coche celles à charger quand même, les autres sont rejetées.
 */
public class DoublonImportLigne {
    /** Motif : même référence, même libellé ou même clé (agence + type + date + montant / compte + dates + montant). */
    public static final String MOTIF_REFERENCE = "REFERENCE";
    public static final String MOTIF_LIBELLE = "LIBELLE";
    public static final String MOTIF_CLE = "CLE";

    /** Identifiant de la ligne dans le fichier, renvoyé tel quel dans la décision. */
    public int ligne;
    public String motif;
    /** Colonnes affichées dans le pop-up (ordre conservé). */
    public Map<String, Object> valeurs = new LinkedHashMap<>();

    public DoublonImportLigne() {}

    public DoublonImportLigne(int ligne, String motif) {
        this.ligne = ligne;
        this.motif = motif;
    }

    public DoublonImportLigne put(String cle, Object valeur) {
        valeurs.put(cle, valeur);
        return this;
    }

    /**
     * Décision transmise par le client : {@code null} = pas encore de décision (détection seule) ;
     * sinon numéros de lignes en doublon à charger quand même (liste vide = tous rejetés).
     */
    public static Set<Integer> parseDecision(Boolean decision, String acceptes) {
        if (decision == null || !decision) return null;
        Set<Integer> out = new LinkedHashSet<>();
        if (acceptes == null || acceptes.isBlank()) return out;
        for (String part : acceptes.split("[,;\\s]+")) {
            if (part.isBlank()) continue;
            try {
                out.add(Integer.parseInt(part.trim()));
            } catch (NumberFormatException ignore) {
                // valeur invalide ignorée : la ligne correspondante est rejetée
            }
        }
        return out;
    }

    /** Découpe une collection en paquets (requêtes IN bornées). */
    public static <T> java.util.List<java.util.List<T>> paquets(Collection<T> source, int taille) {
        java.util.List<T> liste = new java.util.ArrayList<>(source);
        java.util.List<java.util.List<T>> out = new java.util.ArrayList<>();
        for (int i = 0; i < liste.size(); i += taille) {
            out.add(liste.subList(i, Math.min(i + taille, liste.size())));
        }
        return out;
    }
}
