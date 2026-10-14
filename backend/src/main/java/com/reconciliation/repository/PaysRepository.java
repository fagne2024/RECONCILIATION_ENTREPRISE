package com.reconciliation.repository;

import com.reconciliation.entity.PaysEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface PaysRepository extends JpaRepository<PaysEntity, Long> {
    Optional<PaysEntity> findByCode(String code);
    Optional<PaysEntity> findByNom(String nom);
}

