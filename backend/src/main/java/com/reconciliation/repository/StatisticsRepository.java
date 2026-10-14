package com.reconciliation.repository;

import com.reconciliation.model.Statistics;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.math.BigDecimal;

@Repository
public interface StatisticsRepository extends JpaRepository<Statistics, Long> {
    Optional<Statistics> findByAgencyAndServiceAndDate(String agency, String service, LocalDate date);
    List<Statistics> findByDate(LocalDate date);
    
    @Query("SELECT s FROM Statistics s WHERE s.date = :date AND (:countries IS NULL OR s.country IN :countries)")
    List<Statistics> findByDateAndCountries(@Param("date") LocalDate date, @Param("countries") List<String> countries);
    
    List<Statistics> findByDateAndAgencyAndService(LocalDate date, String agency, String service);

    @Query("SELECT s FROM Statistics s WHERE " +
           "(:agency IS NULL OR s.agency = :agency) AND " +
           "(:service IS NULL OR s.service = :service) AND " +
           "(:startDate IS NULL OR s.date >= :startDate) AND " +
           "(:endDate IS NULL OR s.date <= :endDate)")
    List<Statistics> findByFilters(
        @Param("agency") String agency,
        @Param("service") String service,
        @Param("startDate") LocalDate startDate,
        @Param("endDate") LocalDate endDate
    );
    
    @Query("SELECT s FROM Statistics s WHERE " +
           "(:agency IS NULL OR s.agency = :agency) AND " +
           "(:service IS NULL OR s.service = :service) AND " +
           "(:countries IS NULL OR s.country IN :countries) AND " +
           "(:startDate IS NULL OR s.date >= :startDate) AND " +
           "(:endDate IS NULL OR s.date <= :endDate)")
    List<Statistics> findByFiltersWithCountries(
        @Param("agency") String agency,
        @Param("service") String service,
        @Param("countries") List<String> countries,
        @Param("startDate") LocalDate startDate,
        @Param("endDate") LocalDate endDate
    );

    @Query("SELECT COUNT(DISTINCT s.agency) FROM Statistics s")
    long countDistinctAgency();

    @Query("SELECT MAX(s.date) FROM Statistics s")
    LocalDate findMaxDate();

    @Query("SELECT COUNT(s) FROM Statistics s WHERE s.date = :date")
    long countByDate(@Param("date") LocalDate date);

    @Query("SELECT COALESCE(SUM(s.totalVolume), 0) FROM Statistics s WHERE " +
           "(:agency IS NULL OR s.agency = :agency) AND " +
           "(:service IS NULL OR s.service = :service) AND " +
           "(:country IS NULL OR s.country = :country)")
    BigDecimal calculateTotalVolume(
        @Param("agency") String agency,
        @Param("service") String service,
        @Param("country") String country
    );
    
    @Query("SELECT COUNT(s) FROM Statistics s WHERE " +
           "(:agency IS NULL OR s.agency = :agency) AND " +
           "(:service IS NULL OR s.service = :service) AND " +
           "(:country IS NULL OR s.country = :country)")
    long countTransactions(
        @Param("agency") String agency,
        @Param("service") String service,
        @Param("country") String country
    );
    
    @Query("SELECT COUNT(DISTINCT s.agency) FROM Statistics s WHERE " +
           "(:agency IS NULL OR s.agency = :agency) AND " +
           "(:service IS NULL OR s.service = :service) AND " +
           "(:country IS NULL OR s.country = :country)")
    long countDistinctAgency(
        @Param("agency") String agency,
        @Param("service") String service,
        @Param("country") String country
    );
    
    @Query("SELECT s.service as operationType, " +
           "COUNT(s) as transactionCount, " +
           "COALESCE(SUM(s.totalVolume), 0) as totalVolume, " +
           "COALESCE(AVG(s.totalVolume), 0) as averageVolume " +
           "FROM Statistics s WHERE " +
           "(:agency IS NULL OR s.agency = :agency) AND " +
           "(:service IS NULL OR s.service = :service) AND " +
           "(:country IS NULL OR s.country = :country) " +
           "GROUP BY s.service")
    List<Object[]> getOperationTypeStatistics(
        @Param("agency") String agency,
        @Param("service") String service,
        @Param("country") String country
    );
    
    @Query("SELECT s.service as operationType, " +
           "COUNT(s) as frequency " +
           "FROM Statistics s WHERE " +
           "(:agency IS NULL OR s.agency = :agency) AND " +
           "(:service IS NULL OR s.service = :service) AND " +
           "(:country IS NULL OR s.country = :country) " +
           "GROUP BY s.service " +
           "ORDER BY frequency DESC")
    List<Object[]> getOperationFrequency(
        @Param("agency") String agency,
        @Param("service") String service,
        @Param("country") String country
    );
    
    @Query("SELECT COALESCE(SUM(s.totalVolume), 0) FROM Statistics s WHERE " +
           "(:agency IS NULL OR s.agency = :agency) AND " +
           "(:service IS NULL OR s.service = :service) AND " +
           "(:country IS NULL OR s.country = :country) AND " +
           "(:startDate IS NULL OR s.date >= :startDate) AND " +
           "(:endDate IS NULL OR s.date <= :endDate)")
    BigDecimal calculateTotalVolumeWithDateRange(
        @Param("agency") String agency,
        @Param("service") String service,
        @Param("country") String country,
        @Param("startDate") LocalDate startDate,
        @Param("endDate") LocalDate endDate
    );
    
    @Query("SELECT COUNT(s) FROM Statistics s WHERE " +
           "(:agency IS NULL OR s.agency = :agency) AND " +
           "(:service IS NULL OR s.service = :service) AND " +
           "(:country IS NULL OR s.country = :country) AND " +
           "(:startDate IS NULL OR s.date >= :startDate) AND " +
           "(:endDate IS NULL OR s.date <= :endDate)")
    long countTransactionsWithDateRange(
        @Param("agency") String agency,
        @Param("service") String service,
        @Param("country") String country,
        @Param("startDate") LocalDate startDate,
        @Param("endDate") LocalDate endDate
    );

    @Query("SELECT COUNT(s) FROM Statistics s WHERE (:countries IS NULL OR s.country IN :countries)")
    long countByCountries(@Param("countries") List<String> countries);

    @Query("SELECT MAX(s.date) FROM Statistics s WHERE (:countries IS NULL OR s.country IN :countries)")
    LocalDate findMaxDateByCountries(@Param("countries") List<String> countries);

    @Query("SELECT COUNT(s) FROM Statistics s WHERE s.date = :date AND (:countries IS NULL OR s.country IN :countries)")
    long countByDateAndCountries(@Param("date") LocalDate date, @Param("countries") List<String> countries);
    
    @Query("SELECT COUNT(DISTINCT s.agency) FROM Statistics s WHERE " +
           "(:agency IS NULL OR s.agency = :agency) AND " +
           "(:service IS NULL OR s.service = :service) AND " +
           "(:country IS NULL OR s.country = :country) AND " +
           "(:startDate IS NULL OR s.date >= :startDate) AND " +
           "(:endDate IS NULL OR s.date <= :endDate)")
    long countDistinctAgencyWithDateRange(
        @Param("agency") String agency,
        @Param("service") String service,
        @Param("country") String country,
        @Param("startDate") LocalDate startDate,
        @Param("endDate") LocalDate endDate
    );
    
    @Query("SELECT s.service as operationType, " +
           "COUNT(s) as transactionCount, " +
           "COALESCE(SUM(s.totalVolume), 0) as totalVolume, " +
           "COALESCE(AVG(s.totalVolume), 0) as averageVolume " +
           "FROM Statistics s WHERE " +
           "(:agency IS NULL OR s.agency = :agency) AND " +
           "(:service IS NULL OR s.service = :service) AND " +
           "(:country IS NULL OR s.country = :country) AND " +
           "(:startDate IS NULL OR s.date >= :startDate) AND " +
           "(:endDate IS NULL OR s.date <= :endDate) " +
           "GROUP BY s.service")
    List<Object[]> getOperationTypeStatisticsWithDateRange(
        @Param("agency") String agency,
        @Param("service") String service,
        @Param("country") String country,
        @Param("startDate") LocalDate startDate,
        @Param("endDate") LocalDate endDate
    );
    
    @Query("SELECT s.service as operationType, " +
           "COUNT(s) as frequency " +
           "FROM Statistics s WHERE " +
           "(:agency IS NULL OR s.agency = :agency) AND " +
           "(:service IS NULL OR s.service = :service) AND " +
           "(:country IS NULL OR s.country = :country) AND " +
           "(:startDate IS NULL OR s.date >= :startDate) AND " +
           "(:endDate IS NULL OR s.date <= :endDate) " +
           "GROUP BY s.service " +
           "ORDER BY frequency DESC")
    List<Object[]> getOperationFrequencyWithDateRange(
        @Param("agency") String agency,
        @Param("service") String service,
        @Param("country") String country,
        @Param("startDate") LocalDate startDate,
        @Param("endDate") LocalDate endDate
    );
} 