package com.reconciliation.service.traitement;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;

/**
 * Écriture des lignes de traitement ({@code traitement_ligne}) par blocs.
 *
 * <p>Chaque bloc est écrit par des {@code INSERT} multi-lignes ({@value #LIGNES_PAR_REQUETE}
 * lignes par requête) dans <b>une seule transaction</b>. Sans transaction, chaque ligne était
 * validée isolément (autocommit) : avec {@code innodb_flush_log_at_trx_commit=1} et le binlog
 * synchronisé ({@code sync_binlog=1}), cela coûtait deux écritures disque synchronisées par
 * ligne, soit ~175 lignes/s. Le multi-lignes explicite ne dépend pas non plus de l'option JDBC
 * {@code rewriteBatchedStatements}, absente des profils déployés.</p>
 */
@Component
public class TraitementLigneEcriture {

    /** 500 lignes × 5 paramètres : loin de la limite de 65 535 paramètres par requête. */
    static final int LIGNES_PAR_REQUETE = 500;

    private static final String DEBUT_INSERT =
            "INSERT INTO traitement_ligne (entreprise_id, lot_id, fichier_id, numero, valeurs_json) VALUES ";
    private static final String VALEURS_LIGNE = "(?, ?, ?, ?, ?)";
    private static final int NB_COLONNES = 5;

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;

    public TraitementLigneEcriture(JdbcTemplate jdbc, TransactionTemplate transaction) {
        this.jdbc = jdbc;
        this.transaction = transaction;
    }

    /**
     * Insère le bloc (tableaux {entreprise_id, lot_id, fichier_id, numero, valeurs_json})
     * dans une transaction, puis vide la liste.
     */
    public void inserer(List<Object[]> bloc) {
        if (bloc.isEmpty()) {
            return;
        }
        transaction.executeWithoutResult(statut -> {
            for (int debut = 0; debut < bloc.size(); debut += LIGNES_PAR_REQUETE) {
                List<Object[]> tranche = bloc.subList(debut, Math.min(debut + LIGNES_PAR_REQUETE, bloc.size()));
                jdbc.update(requete(tranche.size()), aplatir(tranche));
            }
        });
        bloc.clear();
    }

    static String requete(int nbLignes) {
        StringBuilder sql = new StringBuilder(DEBUT_INSERT.length() + nbLignes * (VALEURS_LIGNE.length() + 2));
        sql.append(DEBUT_INSERT);
        for (int i = 0; i < nbLignes; i++) {
            if (i > 0) {
                sql.append(", ");
            }
            sql.append(VALEURS_LIGNE);
        }
        return sql.toString();
    }

    static Object[] aplatir(List<Object[]> tranche) {
        Object[] parametres = new Object[tranche.size() * NB_COLONNES];
        int i = 0;
        for (Object[] ligne : tranche) {
            if (ligne.length != NB_COLONNES) {
                throw new IllegalArgumentException("Ligne de traitement mal formée : " + ligne.length + " valeurs");
            }
            System.arraycopy(ligne, 0, parametres, i, NB_COLONNES);
            i += NB_COLONNES;
        }
        return parametres;
    }
}
