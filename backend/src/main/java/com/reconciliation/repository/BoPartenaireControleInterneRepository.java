package com.reconciliation.repository;

import com.reconciliation.entity.BoPartenaireControleInterneEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface BoPartenaireControleInterneRepository extends JpaRepository<BoPartenaireControleInterneEntity, Long> {

    Optional<BoPartenaireControleInterneEntity> findByMonthYyyyMmAndCountryAndEnvAndService(
        String monthYyyyMm, String country, String env, String service
    );

    List<BoPartenaireControleInterneEntity> findByCountryAndEnvAndMonthYyyyMmBetween(
        String country, String env, String startMonth, String endMonth
    );
}
