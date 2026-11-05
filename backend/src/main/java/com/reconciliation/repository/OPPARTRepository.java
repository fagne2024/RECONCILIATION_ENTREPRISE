package com.reconciliation.repository;

import com.reconciliation.entity.OPPARTEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface OPPARTRepository extends JpaRepository<OPPARTEntity, Long> {

    List<OPPARTEntity> findByClient(String client);
    List<OPPARTEntity> findByTypeOp(String typeOp);
    List<OPPARTEntity> findByPays(String pays);
    List<OPPARTEntity> findBySource(String source);
    List<OPPARTEntity> findByDateOperationBetween(LocalDateTime dateDebut, LocalDateTime dateFin);
    List<OPPARTEntity> findByStatut(String statut);
    List<OPPARTEntity> findByToken(String token);
    Optional<OPPARTEntity> findFirstByToken(String token);

    @Query("SELECT o FROM OPPARTEntity o WHERE " +
           "(:client IS NULL OR LOWER(o.client) LIKE LOWER(CONCAT('%', :client, '%'))) AND " +
           "(:typeOp IS NULL OR LOWER(o.typeOp) = LOWER(:typeOp)) AND " +
           "(:typeOpContains IS NULL OR LOWER(o.typeOp) LIKE LOWER(CONCAT('%', :typeOpContains, '%'))) AND " +
           "(:pays IS NULL OR LOWER(o.pays) = LOWER(:pays)) AND " +
           "(:source IS NULL OR LOWER(o.source) = LOWER(:source)) AND " +
           "(:statut IS NULL OR LOWER(o.statut) = LOWER(:statut)) AND " +
           "(:token IS NULL OR LOWER(o.token) LIKE LOWER(CONCAT('%', :token, '%'))) AND " +
           "(:dateDebut IS NULL OR o.dateOperation >= :dateDebut) AND " +
           "(:dateFin IS NULL OR o.dateOperation <= :dateFin) " +
           "ORDER BY o.dateOperation DESC, o.id DESC")
    List<OPPARTEntity> findWithFilters(
            @Param("client") String client,
            @Param("typeOp") String typeOp,
            @Param("typeOpContains") String typeOpContains,
            @Param("pays") String pays,
            @Param("source") String source,
            @Param("statut") String statut,
            @Param("token") String token,
            @Param("dateDebut") LocalDateTime dateDebut,
            @Param("dateFin") LocalDateTime dateFin);

    /**
     * Lignes dont l'identifiant de transaction correspond, comparaison faite sur la valeur
     * normalisée (casse et espaces). Utilisé par le contrôle de doublon à l'import :
     * la table n'est pas chargé en mémoire, seules les lignes candidates le sont.
     * La comparaison reste faite en Java, seule source de vérité.
     */
    @Query("SELECT o FROM OPPARTEntity o WHERE UPPER(TRIM(o.idTransaction)) IN :ids")
    List<OPPARTEntity> findByNormalizedIdTransactions(@Param("ids") List<String> ids);

    /**
     * Correspondances complètes rattachées à un lot de tokens. Le token est le seul
     * lien fiable entre les deux lignes d'une compensation : les montants et les
     * dates diffèrent d'une jambe à l'autre (une ligne BO peut grouper plusieurs
     * lignes partenaires et porter sa propre date comptable).
     */
    @Query("SELECT o FROM OPPARTEntity o WHERE UPPER(TRIM(o.token)) IN :tokens")
    List<OPPARTEntity> findByNormalizedTokens(@Param("tokens") List<String> tokens);

    /**
     * Repli pour les lignes sans identifiant de transaction : même client et
     * même jour. Volontairement permissif, un faux positif est sans conséquence,
     * un faux négatif laisserait passer un doublon.
     */
    @Query("SELECT o FROM OPPARTEntity o WHERE UPPER(TRIM(o.client)) IN :clients " +
           "AND o.dateOperation >= :debut AND o.dateOperation < :fin")
    List<OPPARTEntity> findByNormalizedClientsAndDates(@Param("clients") List<String> clients,
                                                       @Param("debut") LocalDateTime debut,
                                                       @Param("fin") LocalDateTime fin);

    /**
     * Valeurs distinctes d'une colonne, pour alimenter les listes de filtres.
     * Retourne un scalaire par valeur : aucune entité n'est hydratée, donc le
     * coût ne dépend pas du volume de la table.
     */
    @Query("SELECT DISTINCT o.client FROM OPPARTEntity o WHERE o.client IS NOT NULL AND TRIM(o.client) <> '' ORDER BY o.client")
    List<String> findDistinctClients();

    @Query("SELECT DISTINCT o.typeOp FROM OPPARTEntity o WHERE o.typeOp IS NOT NULL AND TRIM(o.typeOp) <> '' ORDER BY o.typeOp")
    List<String> findDistinctTypeOps();

    @Query("SELECT DISTINCT o.pays FROM OPPARTEntity o WHERE o.pays IS NOT NULL AND TRIM(o.pays) <> '' ORDER BY o.pays")
    List<String> findDistinctPays();

    @Query("SELECT DISTINCT o.source FROM OPPARTEntity o WHERE o.source IS NOT NULL AND TRIM(o.source) <> '' ORDER BY o.source")
    List<String> findDistinctSources();
}
