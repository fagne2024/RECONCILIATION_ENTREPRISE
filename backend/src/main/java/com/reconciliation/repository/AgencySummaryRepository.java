package com.reconciliation.repository;

import com.reconciliation.entity.AgencySummaryEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

public interface AgencySummaryRepository extends JpaRepository<AgencySummaryEntity, Long> {
    @Query("SELECT a FROM AgencySummaryEntity a WHERE a.date = :date AND a.agency = :agency AND a.service = :service AND a.recordCount = :recordCount AND ABS(a.totalVolume - :totalVolume) < 0.01")
    List<AgencySummaryEntity> findDuplicates(
        @Param("date") String date,
        @Param("agency") String agency,
        @Param("service") String service,
        @Param("totalVolume") double totalVolume,
        @Param("recordCount") int recordCount
    );
    
    @Query("SELECT a FROM AgencySummaryEntity a WHERE a.service = :service AND a.date = :date")
    List<AgencySummaryEntity> findByServiceAndDate(
        @Param("service") String service,
        @Param("date") String date
    );

    @Query("SELECT COALESCE(SUM(a.totalVolume), 0) FROM AgencySummaryEntity a WHERE (:agencies IS NULL OR a.agency IN :agencies) AND (:services IS NULL OR a.service IN :services) AND (:countries IS NULL OR a.country IN :countries) AND (:startDate IS NULL OR a.date >= :startDate) AND (:endDate IS NULL OR a.date <= :endDate)")
    Double calculateTotalVolumeWithDateRange(
        @Param("agencies") List<String> agencies,
        @Param("services") List<String> services,
        @Param("countries") List<String> countries,
        @Param("startDate") String startDate,
        @Param("endDate") String endDate
    );

    @Query("SELECT COALESCE(SUM(a.recordCount), 0) FROM AgencySummaryEntity a WHERE (:agencies IS NULL OR a.agency IN :agencies) AND (:services IS NULL OR a.service IN :services) AND (:countries IS NULL OR a.country IN :countries) AND (:startDate IS NULL OR a.date >= :startDate) AND (:endDate IS NULL OR a.date <= :endDate)")
    long countTransactionsWithDateRange(
        @Param("agencies") List<String> agencies,
        @Param("services") List<String> services,
        @Param("countries") List<String> countries,
        @Param("startDate") String startDate,
        @Param("endDate") String endDate
    );

    @Query("SELECT COUNT(DISTINCT a.agency) FROM AgencySummaryEntity a WHERE (:agencies IS NULL OR a.agency IN :agencies) AND (:services IS NULL OR a.service IN :services) AND (:countries IS NULL OR a.country IN :countries) AND (:startDate IS NULL OR a.date >= :startDate) AND (:endDate IS NULL OR a.date <= :endDate)")
    long countDistinctAgencyWithDateRange(
        @Param("agencies") List<String> agencies,
        @Param("services") List<String> services,
        @Param("countries") List<String> countries,
        @Param("startDate") String startDate,
        @Param("endDate") String endDate
    );

    @Query("SELECT a.service as operationType, COUNT(a) as transactionCount, COALESCE(SUM(a.totalVolume), 0) as totalVolume, COALESCE(AVG(a.totalVolume), 0) as averageVolume FROM AgencySummaryEntity a WHERE (:agencies IS NULL OR a.agency IN :agencies) AND (:services IS NULL OR a.service IN :services) AND (:countries IS NULL OR a.country IN :countries) AND (:startDate IS NULL OR a.date >= :startDate) AND (:endDate IS NULL OR a.date <= :endDate) GROUP BY a.service")
    List<Object[]> getOperationTypeStatisticsWithDateRange(
        @Param("agencies") List<String> agencies,
        @Param("services") List<String> services,
        @Param("countries") List<String> countries,
        @Param("startDate") String startDate,
        @Param("endDate") String endDate
    );

    @Query("SELECT a.service as operationType, COUNT(a) as frequency FROM AgencySummaryEntity a WHERE (:agencies IS NULL OR a.agency IN :agencies) AND (:services IS NULL OR a.service IN :services) AND (:countries IS NULL OR a.country IN :countries) AND (:startDate IS NULL OR a.date >= :startDate) AND (:endDate IS NULL OR a.date <= :endDate) GROUP BY a.service ORDER BY frequency DESC")
    List<Object[]> getOperationFrequencyWithDateRange(
        @Param("agencies") List<String> agencies,
        @Param("services") List<String> services,
        @Param("countries") List<String> countries,
        @Param("startDate") String startDate,
        @Param("endDate") String endDate
    );

    @Query("SELECT COALESCE(MAX(a.date), NULL) FROM AgencySummaryEntity a")
    String findMaxDate();
    
    @Query("SELECT COALESCE(MAX(a.date), NULL) FROM AgencySummaryEntity a WHERE (:countries IS NULL OR a.country IN :countries)")
    String findMaxDateByCountries(@Param("countries") List<String> countries);

    @Query("SELECT COUNT(DISTINCT a.agency) FROM AgencySummaryEntity a")
    long countDistinctAgency();
    
    @Query("SELECT COUNT(DISTINCT a.agency) FROM AgencySummaryEntity a WHERE (:countries IS NULL OR a.country IN :countries)")
    long countDistinctAgencyByCountries(@Param("countries") List<String> countries);

    @Query("SELECT COUNT(a) FROM AgencySummaryEntity a WHERE a.date = :date")
    long countByDate(@Param("date") String date);
    
    @Query("SELECT COUNT(a) FROM AgencySummaryEntity a WHERE a.date = :date AND (:countries IS NULL OR a.country IN :countries)")
    long countByDateAndCountries(@Param("date") String date, @Param("countries") List<String> countries);
    
    @Query("SELECT COUNT(a) FROM AgencySummaryEntity a WHERE (:countries IS NULL OR a.country IN :countries)")
    long countByCountries(@Param("countries") List<String> countries);

    @Query("SELECT a FROM AgencySummaryEntity a WHERE a.date = :date AND a.agency = :agency AND a.service = :service")
    List<AgencySummaryEntity> findByDateAndAgencyAndService(
        @Param("date") String date,
        @Param("agency") String agency,
        @Param("service") String service
    );

    @Modifying
    @Transactional
    @Query("DELETE FROM AgencySummaryEntity a WHERE a.date = :date AND a.agency = :agency AND a.service = :service")
    void deleteByDateAndAgencyAndService(
        @Param("date") String date,
        @Param("agency") String agency,
        @Param("service") String service
    );

    @Query("SELECT COALESCE(MIN(a.date), NULL) FROM AgencySummaryEntity a")
    String findMinDate();

    @Query("SELECT a FROM AgencySummaryEntity a WHERE a.agency = :agency AND a.service = :service ORDER BY a.date DESC")
    List<AgencySummaryEntity> findByAgencyAndServiceOrderByDateDesc(
        @Param("agency") String agency,
        @Param("service") String service
    );

    @Query("SELECT a FROM AgencySummaryEntity a WHERE a.date = :date AND a.agency = :agency")
    List<AgencySummaryEntity> findByDateAndAgency(
        @Param("date") String date,
        @Param("agency") String agency
    );

    @Query("""
        SELECT a FROM AgencySummaryEntity a
        WHERE (:agencies IS NULL OR a.agency IN :agencies)
          AND (:services IS NULL OR a.service IN :services)
          AND (:countries IS NULL OR a.country IN :countries)
          AND (:startDate IS NULL OR a.date >= :startDate)
          AND (:endDate IS NULL OR a.date <= :endDate)
        ORDER BY a.date DESC, a.agency ASC, a.service ASC
    """)
    List<AgencySummaryEntity> findByStatsFilters(
        @Param("agencies") List<String> agencies,
        @Param("services") List<String> services,
        @Param("countries") List<String> countries,
        @Param("startDate") String startDate,
        @Param("endDate") String endDate
    );

    boolean existsByService(String service);

    @Query("SELECT CASE WHEN COUNT(a) > 0 THEN TRUE ELSE FALSE END FROM AgencySummaryEntity a WHERE LOWER(a.service) = LOWER(:service)")
    boolean existsByServiceIgnoreCase(@Param("service") String service);

    @Query("SELECT DISTINCT LOWER(a.service) FROM AgencySummaryEntity a WHERE LOWER(a.service) IN :services")
    List<String> findExistingServicesIgnoreCase(@Param("services") List<String> services);

    @Query("""
        SELECT CASE WHEN COUNT(a) > 0 THEN TRUE ELSE FALSE END
        FROM AgencySummaryEntity a
        WHERE UPPER(TRIM(a.country)) = UPPER(TRIM(:country))
          AND LOWER(TRIM(a.service)) = LOWER(TRIM(:service))
          AND (:startDate IS NULL OR :startDate = '' OR a.date >= :startDate)
          AND (:endDate IS NULL OR :endDate = '' OR a.date <= :endDate)
        """)
    boolean existsByCountryAndServiceIgnoreCase(
        @Param("country") String country,
        @Param("service") String service,
        @Param("startDate") String startDate,
        @Param("endDate") String endDate
    );

    @Query("""
        SELECT DISTINCT UPPER(TRIM(a.country)), LOWER(TRIM(a.service))
        FROM AgencySummaryEntity a
        WHERE LOWER(TRIM(a.service)) IN :services
          AND (:startDate IS NULL OR :startDate = '' OR a.date >= :startDate)
          AND (:endDate IS NULL OR :endDate = '' OR a.date <= :endDate)
        """)
    List<Object[]> findDistinctCountryServiceByServices(
        @Param("services") List<String> services,
        @Param("startDate") String startDate,
        @Param("endDate") String endDate
    );

    @Query("""
        SELECT DISTINCT UPPER(TRIM(a.country)), LOWER(TRIM(a.service))
        FROM AgencySummaryEntity a
        WHERE (:countries IS NULL OR UPPER(TRIM(a.country)) IN :countries)
          AND (:startDate IS NULL OR :startDate = '' OR a.date >= :startDate)
          AND (:endDate IS NULL OR :endDate = '' OR a.date <= :endDate)
        """)
    List<Object[]> findDistinctCountryService(
        @Param("countries") List<String> countries,
        @Param("startDate") String startDate,
        @Param("endDate") String endDate
    );

    @Query("""
        SELECT UPPER(a.country) as country, LOWER(a.service) as service, SUM(a.totalVolume) as totalVolume, SUM(a.recordCount) as totalTransactions
        FROM AgencySummaryEntity a
        WHERE UPPER(a.country) IN :countries
          AND (:startDate IS NULL OR :startDate = '' OR a.date >= :startDate)
          AND (:endDate IS NULL OR :endDate = '' OR a.date <= :endDate)
        GROUP BY UPPER(a.country), LOWER(a.service)
        """)
    List<Object[]> aggregateByCountryAndService(
        @Param("countries") List<String> countries,
        @Param("startDate") String startDate,
        @Param("endDate") String endDate
    );

    @Query("""
        SELECT UPPER(a.country) as country, SUM(a.totalVolume) as totalVolume, SUM(a.recordCount) as totalTransactions
        FROM AgencySummaryEntity a
        WHERE UPPER(a.country) IN :countries
          AND (:startDate IS NULL OR :startDate = '' OR a.date >= :startDate)
          AND (:endDate IS NULL OR :endDate = '' OR a.date <= :endDate)
        GROUP BY UPPER(a.country)
        """)
    List<Object[]> aggregateByCountry(
        @Param("countries") List<String> countries,
        @Param("startDate") String startDate,
        @Param("endDate") String endDate
    );

    @Query("""
        SELECT UPPER(a.country) as country, SUM(a.totalVolume) as totalVolume, SUM(a.recordCount) as totalTransactions
        FROM AgencySummaryEntity a
        WHERE (:startDate IS NULL OR :startDate = '' OR a.date >= :startDate)
          AND (:endDate IS NULL OR :endDate = '' OR a.date <= :endDate)
        GROUP BY UPPER(a.country)
        """)
    List<Object[]> aggregateByCountryAll(
        @Param("startDate") String startDate,
        @Param("endDate") String endDate
    );

    @Query("""
        SELECT UPPER(a.country) as country, LOWER(a.service) as service, SUM(a.totalVolume) as totalVolume, SUM(a.recordCount) as totalTransactions
        FROM AgencySummaryEntity a
        WHERE (:startDate IS NULL OR :startDate = '' OR a.date >= :startDate)
          AND (:endDate IS NULL OR :endDate = '' OR a.date <= :endDate)
        GROUP BY UPPER(a.country), LOWER(a.service)
        """)
    List<Object[]> aggregateByCountryAndServiceAll(
        @Param("startDate") String startDate,
        @Param("endDate") String endDate
    );

    @Query("SELECT a FROM AgencySummaryEntity a WHERE " +
           "(:agency IS NULL OR :agency = '' OR a.agency = :agency) AND " +
           "(:countries IS NULL OR UPPER(TRIM(a.country)) IN :countries) AND " +
           "(:startDate IS NULL OR :startDate = '' OR a.date >= :startDate) AND " +
           "(:endDate IS NULL OR :endDate = '' OR a.date <= :endDate)")
    List<AgencySummaryEntity> findByFiltersForRedevance(
        @Param("agency") String agency,
        @Param("countries") List<String> countries,
        @Param("startDate") String startDate,
        @Param("endDate") String endDate
    );
} 