package com.reconciliation.repository;

import com.reconciliation.entity.ReleveManualEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface ReleveManualRepository extends JpaRepository<ReleveManualEntity, Long> {

    Optional<ReleveManualEntity> findByDateAndServiceAndCountry(LocalDate date, String service, String country);

    /**
     * Cloisonnement relevé : même date / service / pays / ENV (les lignes historiques sans env comptent comme TOTAL).
     */
    @Query("SELECT e FROM ReleveManualEntity e WHERE e.date = :date AND e.service = :service AND e.country = :country AND COALESCE(e.env, 'TOTAL') = :env")
    Optional<ReleveManualEntity> findByReleveKey(
            @Param("date") LocalDate date,
            @Param("service") String service,
            @Param("country") String country,
            @Param("env") String env);

    List<ReleveManualEntity> findByDateBetween(LocalDate startInclusive, LocalDate endInclusive);

    @Query("""
        SELECT e FROM ReleveManualEntity e
        WHERE e.date >= :start AND e.date <= :end
          AND (:country IS NULL OR e.country = :country)
          AND (
              :services IS NULL
              OR e.service IN :services
          )
        """)
    List<ReleveManualEntity> findForReportRange(
            @Param("start") LocalDate start,
            @Param("end") LocalDate end,
            @Param("country") String country,
            @Param("services") List<String> services);
}

