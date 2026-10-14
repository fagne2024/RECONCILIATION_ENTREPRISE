package com.reconciliation.repository;

import com.reconciliation.entity.FluxEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Optional;

public interface FluxRepository extends JpaRepository<FluxEntity, Long> {
    Optional<FluxEntity> findByAgenceAndDateDebutAndDateFin(String agence, LocalDate dateDebut, LocalDate dateFin);
}
