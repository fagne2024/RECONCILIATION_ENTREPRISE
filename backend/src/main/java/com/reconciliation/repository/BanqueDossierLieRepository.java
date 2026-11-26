package com.reconciliation.repository;

import com.reconciliation.entity.BanqueDossierLieEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BanqueDossierLieRepository extends JpaRepository<BanqueDossierLieEntity, Long> {
    List<BanqueDossierLieEntity> findAllByOrderByCreatedAtDesc();
}
