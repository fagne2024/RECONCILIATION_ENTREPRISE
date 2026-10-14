package com.reconciliation.repository;

import com.reconciliation.entity.Result8RecEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface Result8RecRepository extends JpaRepository<Result8RecEntity, Long> {
    boolean existsByDateAndAgencyAndServiceAndCountry(String date, String agency, String service, String country);

    Result8RecEntity findFirstByDateAndAgencyAndServiceAndCountryOrderByIdDesc(String date, String agency, String service, String country);

    @Query("SELECT r FROM Result8RecEntity r WHERE LOWER(r.country) IN :countries")
    List<Result8RecEntity> findByCountryCodes(@Param("countries") List<String> countries);

    @Query("""
        SELECT r FROM Result8RecEntity r
        WHERE (:startDate IS NULL OR r.date >= :startDate)
          AND (:endDate IS NULL OR r.date <= :endDate)
          AND (
              :countries IS NULL
              OR LOWER(TRIM(r.country)) IN :countries
          )
          AND (
              :env IS NULL
              OR UPPER(COALESCE(r.env, '')) = UPPER(:env)
              OR (:env = 'T-E' AND (r.env IS NULL OR TRIM(r.env) = '' OR UPPER(r.env) = 'TOTAL'))
          )
        ORDER BY r.date DESC, r.country ASC, r.service ASC, r.agency ASC
    """)
    List<Result8RecEntity> findForReport(
            @Param("startDate") String startDate,
            @Param("endDate") String endDate,
            @Param("countries") List<String> countries,
            @Param("env") String env
    );

    @Query("""
        SELECT COUNT(r) FROM Result8RecEntity r
        WHERE (:startDate IS NULL OR r.date >= :startDate)
          AND (:endDate IS NULL OR r.date <= :endDate)
          AND (
              :countries IS NULL
              OR LOWER(TRIM(r.country)) IN :countries
          )
          AND (
              :env IS NULL
              OR UPPER(COALESCE(r.env, '')) = UPPER(:env)
              OR (:env = 'T-E' AND (r.env IS NULL OR TRIM(r.env) = '' OR UPPER(r.env) = 'TOTAL'))
          )
    """)
    long countForReport(
            @Param("startDate") String startDate,
            @Param("endDate") String endDate,
            @Param("countries") List<String> countries,
            @Param("env") String env
    );

    // Nombre total de relevés distincts (date + service + pays)
    @Query("SELECT COUNT(DISTINCT CONCAT(r.date, '|', r.service, '|', r.country)) FROM Result8RecEntity r")
    long countDistinctReconciliations();

    // Nombre de relevés distincts pour une date donnée (YYYY-MM-DD)
    @Query("SELECT COUNT(DISTINCT CONCAT(r.date, '|', r.service, '|', r.country)) FROM Result8RecEntity r WHERE r.date = :date")
    long countDistinctReconciliationsByDate(@Param("date") String date);

    // Dernière date de relevé dans result8rec
    @Query("SELECT COALESCE(MAX(r.date), NULL) FROM Result8RecEntity r")
    String findMaxResultDate();

    /**
     * Agrégation KPI réconciliation par mois (YYYY-MM), basée sur les colonnes result8rec.
     * NB: r.date est stockée en String ; on s'appuie sur les 7 premiers caractères "YYYY-MM".
     */
    @Query("""
        SELECT substring(r.date, 1, 7) as ym,
               SUM(r.totalTransactions) as totalTransactions,
               SUM(r.totalVolume) as totalVolume,
               SUM(r.matches) as matches
        FROM Result8RecEntity r
        WHERE (r.date IS NOT NULL AND length(r.date) >= 7)
          AND (:startYm IS NULL OR substring(r.date, 1, 7) >= :startYm)
          AND (:endYm IS NULL OR substring(r.date, 1, 7) <= :endYm)
          AND (:service IS NULL OR r.service = :service)
          AND (:env IS NULL OR r.env = :env)
          AND (:country IS NULL OR LOWER(r.country) = LOWER(:country))
          AND (:countries IS NULL OR LOWER(r.country) IN :countries)
        GROUP BY substring(r.date, 1, 7)
        ORDER BY substring(r.date, 1, 7)
    """)
    List<Object[]> aggregateMonthlyKpis(
            @Param("startYm") String startYm,
            @Param("endYm") String endYm,
            @Param("service") String service,
            @Param("env") String env,
            @Param("country") String country,
            @Param("countries") List<String> countries
    );

    @Query("""
        SELECT COUNT(DISTINCT r.service)
        FROM Result8RecEntity r
        WHERE (r.date IS NOT NULL AND length(r.date) >= 7)
          AND (:startYm IS NULL OR substring(r.date, 1, 7) >= :startYm)
          AND (:endYm IS NULL OR substring(r.date, 1, 7) <= :endYm)
          AND (:service IS NULL OR r.service = :service)
          AND (:env IS NULL OR r.env = :env)
          AND (:country IS NULL OR LOWER(r.country) = LOWER(:country))
          AND (:countries IS NULL OR LOWER(r.country) IN :countries)
    """)
    Long countDistinctServices(
            @Param("startYm") String startYm,
            @Param("endYm") String endYm,
            @Param("service") String service,
            @Param("env") String env,
            @Param("country") String country,
            @Param("countries") List<String> countries
    );

    @Query("""
        SELECT COUNT(DISTINCT LOWER(r.country))
        FROM Result8RecEntity r
        WHERE (r.date IS NOT NULL AND length(r.date) >= 7)
          AND (:startYm IS NULL OR substring(r.date, 1, 7) >= :startYm)
          AND (:endYm IS NULL OR substring(r.date, 1, 7) <= :endYm)
          AND (:service IS NULL OR r.service = :service)
          AND (:env IS NULL OR r.env = :env)
          AND (:country IS NULL OR LOWER(r.country) = LOWER(:country))
          AND (:countries IS NULL OR LOWER(r.country) IN :countries)
    """)
    Long countDistinctCountries(
            @Param("startYm") String startYm,
            @Param("endYm") String endYm,
            @Param("service") String service,
            @Param("env") String env,
            @Param("country") String country,
            @Param("countries") List<String> countries
    );

    @Query("""
        SELECT COUNT(DISTINCT r.agency)
        FROM Result8RecEntity r
        WHERE (r.date IS NOT NULL AND length(r.date) >= 7)
          AND (:startYm IS NULL OR substring(r.date, 1, 7) >= :startYm)
          AND (:endYm IS NULL OR substring(r.date, 1, 7) <= :endYm)
          AND (:service IS NULL OR r.service = :service)
          AND (:env IS NULL OR r.env = :env)
          AND (:country IS NULL OR LOWER(r.country) = LOWER(:country))
          AND (:countries IS NULL OR LOWER(r.country) IN :countries)
    """)
    Long countDistinctAgencies(
            @Param("startYm") String startYm,
            @Param("endYm") String endYm,
            @Param("service") String service,
            @Param("env") String env,
            @Param("country") String country,
            @Param("countries") List<String> countries
    );

    @Query("""
        SELECT CASE WHEN COUNT(r) > 0 THEN TRUE ELSE FALSE END
        FROM Result8RecEntity r
        WHERE LOWER(TRIM(r.service)) = LOWER(TRIM(:service))
          AND (:startDate IS NULL OR :startDate = '' OR r.date >= :startDate)
          AND (:endDate IS NULL OR :endDate = '' OR r.date <= :endDate)
        """)
    boolean existsByServiceIgnoreCase(
            @Param("service") String service,
            @Param("startDate") String startDate,
            @Param("endDate") String endDate
    );

    @Query("""
        SELECT CASE WHEN COUNT(r) > 0 THEN TRUE ELSE FALSE END
        FROM Result8RecEntity r
        WHERE UPPER(TRIM(r.country)) = UPPER(TRIM(:country))
          AND LOWER(TRIM(r.service)) = LOWER(TRIM(:service))
          AND (:startDate IS NULL OR :startDate = '' OR r.date >= :startDate)
          AND (:endDate IS NULL OR :endDate = '' OR r.date <= :endDate)
        """)
    boolean existsByCountryAndServiceIgnoreCase(
            @Param("country") String country,
            @Param("service") String service,
            @Param("startDate") String startDate,
            @Param("endDate") String endDate
    );

    @Query("""
        SELECT DISTINCT UPPER(TRIM(r.country)), LOWER(TRIM(r.service))
        FROM Result8RecEntity r
        WHERE LOWER(TRIM(r.service)) IN :services
          AND (:startDate IS NULL OR :startDate = '' OR r.date >= :startDate)
          AND (:endDate IS NULL OR :endDate = '' OR r.date <= :endDate)
        """)
    List<Object[]> findDistinctCountryServiceByServices(
            @Param("services") List<String> services,
            @Param("startDate") String startDate,
            @Param("endDate") String endDate
    );

    @Query("""
        SELECT DISTINCT UPPER(TRIM(r.country)), LOWER(TRIM(r.service))
        FROM Result8RecEntity r
        WHERE UPPER(TRIM(r.country)) IN :countries
          AND (:startDate IS NULL OR :startDate = '' OR r.date >= :startDate)
          AND (:endDate IS NULL OR :endDate = '' OR r.date <= :endDate)
        """)
    List<Object[]> findDistinctCountryService(
            @Param("countries") List<String> countries,
            @Param("startDate") String startDate,
            @Param("endDate") String endDate
    );

    /** Tous pays (admin / GNL) — évite IN :countries avec collection null (Hibernate). */
    @Query("""
        SELECT DISTINCT UPPER(TRIM(r.country)), LOWER(TRIM(r.service))
        FROM Result8RecEntity r
        WHERE (:startDate IS NULL OR :startDate = '' OR r.date >= :startDate)
          AND (:endDate IS NULL OR :endDate = '' OR r.date <= :endDate)
        """)
    List<Object[]> findDistinctCountryServiceAll(
            @Param("startDate") String startDate,
            @Param("endDate") String endDate
    );

    @Query("""
        SELECT DISTINCT r.date, r.country FROM Result8RecEntity r
        WHERE (:startDate IS NULL OR r.date >= :startDate)
          AND (:endDate IS NULL OR r.date <= :endDate)
        ORDER BY r.date DESC
    """)
    List<Object[]> findDistinctDateCountryPairsForReport(
            @Param("startDate") String startDate,
            @Param("endDate") String endDate
    );

    @Query("""
        SELECT DISTINCT r.country, r.service, COALESCE(r.env, '')
        FROM Result8RecEntity r
        WHERE r.country IS NOT NULL AND TRIM(r.country) <> ''
          AND r.service IS NOT NULL AND TRIM(r.service) <> ''
    """)
    List<Object[]> findDistinctCountryServiceEnvRows();
}


