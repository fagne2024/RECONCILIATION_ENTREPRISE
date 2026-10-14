package com.reconciliation.repository;

import com.reconciliation.entity.CalculationRuleEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CalculationRuleRepository extends JpaRepository<CalculationRuleEntity, Long> {

    Optional<CalculationRuleEntity> findByCode(String code);

    List<CalculationRuleEntity> findAllByOrderByModuleAscSousModuleAscOrdreAscIdAsc();

    List<CalculationRuleEntity> findByModuleOrderBySousModuleAscOrdreAscIdAsc(String module);

    boolean existsByCode(String code);
}
