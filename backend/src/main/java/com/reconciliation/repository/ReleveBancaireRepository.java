package com.reconciliation.repository;

import com.reconciliation.entity.ReleveBancaireEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

@Repository
public interface ReleveBancaireRepository extends JpaRepository<ReleveBancaireEntity, Long> {
    List<ReleveBancaireEntity> findByNumeroCompteAndDateComptableAndDateValeurAndLibelle(
            String numeroCompte,
            LocalDate dateComptable,
            LocalDate dateValeur,
            String libelle
    );

    List<ReleveBancaireEntity> findByDedupKeyIn(Set<String> dedupKeys);
}


