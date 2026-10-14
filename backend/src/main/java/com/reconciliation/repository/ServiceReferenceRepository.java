package com.reconciliation.repository;

import com.reconciliation.entity.ServiceReferenceEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface ServiceReferenceRepository extends JpaRepository<ServiceReferenceEntity, Long> {
    List<ServiceReferenceEntity> findByPays(String pays);
    List<ServiceReferenceEntity> findByPaysIn(List<String> pays);
    Optional<ServiceReferenceEntity> findByCodeReco(String codeReco);

    /** Détection de conflit sur contrainte unique {@code code_reco} (casse selon la collation DB). */
    Optional<ServiceReferenceEntity> findByCodeRecoIgnoreCase(String codeReco);
    Optional<ServiceReferenceEntity> findByCodeService(String codeService);
    Optional<ServiceReferenceEntity> findByPaysAndCodeReco(String pays, String codeReco);
    Optional<ServiceReferenceEntity> findByPaysAndCodeServiceAndServiceLabelAndCodeReco(
        String pays, String codeService, String serviceLabel, String codeReco);

    /** Dernière ligne en cas d’historique dupliqué (import upsert dashboard). */
    Optional<ServiceReferenceEntity> findFirstByPaysIgnoreCaseAndCodeServiceIgnoreCaseOrderByIdDesc(
        String pays, String codeService);

    @Query("select s.codeReco from ServiceReferenceEntity s where s.codeReco is not null")
    List<String> findAllCodeRecoValues();

    @Query("select s.codeService from ServiceReferenceEntity s where s.codeService is not null")
    List<String> findAllCodeServiceValues();
}

