package com.reconciliation.repository;

import com.reconciliation.entity.SuiviTrxAnnulerEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SuiviTrxAnnulerRepository extends JpaRepository<SuiviTrxAnnulerEntity, Long> {

    List<SuiviTrxAnnulerEntity> findAllByOrderByCreatedAtDescIdDesc();

    Optional<SuiviTrxAnnulerEntity> findFirstByMatchKeyOrderByIdAsc(String matchKey);
}
