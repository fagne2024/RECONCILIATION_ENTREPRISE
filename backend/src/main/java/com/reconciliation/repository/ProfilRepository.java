package com.reconciliation.repository;

import com.reconciliation.entity.ProfilEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProfilRepository extends JpaRepository<ProfilEntity, Long> {
    boolean existsByNom(String nom);
    ProfilEntity findByNom(String nom);
} 