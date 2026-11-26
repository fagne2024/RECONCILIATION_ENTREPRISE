package com.reconciliation.repository;

import com.reconciliation.entity.BanqueDossierLieLigneEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface BanqueDossierLieLigneRepository extends JpaRepository<BanqueDossierLieLigneEntity, Long> {
    List<BanqueDossierLieLigneEntity> findByDossierIdOrderByIdAsc(Long dossierId);

    List<BanqueDossierLieLigneEntity> findByTypeLigneAndLigneIdIn(String typeLigne, Collection<Long> ligneIds);

    @Modifying
    @Query("delete from BanqueDossierLieLigneEntity l where l.dossierId = :dossierId")
    void deleteByDossierId(@Param("dossierId") Long dossierId);
}
