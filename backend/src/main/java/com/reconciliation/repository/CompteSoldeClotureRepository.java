package com.reconciliation.repository;

import com.reconciliation.entity.CompteSoldeClotureEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface CompteSoldeClotureRepository extends JpaRepository<CompteSoldeClotureEntity, Long> {

    Optional<CompteSoldeClotureEntity> findByNumeroCompteAndDateSolde(String numeroCompte, LocalDate dateSolde);

    List<CompteSoldeClotureEntity> findByNumeroCompteAndDateSoldeBetween(String numeroCompte, LocalDate start, LocalDate end);

    List<CompteSoldeClotureEntity> findByNumeroCompteOrderByDateSoldeDesc(String numeroCompte);

    void deleteByNumeroCompteAndDateSolde(String numeroCompte, LocalDate dateSolde);
}

