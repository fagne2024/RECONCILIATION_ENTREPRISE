package com.reconciliation.repository;

import com.reconciliation.entity.CommissionEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CommissionRepository extends JpaRepository<CommissionEntity, Long> {

    Optional<CommissionEntity> findByServiceAndAgenceAndActifTrue(String service, String agence);

    List<CommissionEntity> findByActifTrue();

    @Query("SELECT c FROM CommissionEntity c WHERE c.actif = true ORDER BY c.dateModification DESC")
    List<CommissionEntity> findByActifTrueOrderByDateModificationDesc();

    @Query("SELECT c FROM CommissionEntity c ORDER BY c.dateModification DESC")
    List<CommissionEntity> findAllOrderByDateModificationDesc();

    @Query("SELECT c FROM CommissionEntity c WHERE c.service = :service AND c.agence = :agence AND c.actif = true")
    Optional<CommissionEntity> findCommissionApplicable(@Param("service") String service, @Param("agence") String agence);

    List<CommissionEntity> findByService(String service);

    List<CommissionEntity> findByAgence(String agence);
}
