package com.reconciliation.repository;

import com.reconciliation.entity.EntrepriseEntity;
import com.reconciliation.entity.EntrepriseStatut;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface EntrepriseRepository extends JpaRepository<EntrepriseEntity, Long> {
    Optional<EntrepriseEntity> findByCode(String code);
    boolean existsByCode(String code);
    boolean existsByCodeAndStatut(String code, EntrepriseStatut statut);
    List<EntrepriseEntity> findByStatut(EntrepriseStatut statut);
}