package com.reconciliation.repository;

import com.reconciliation.entity.ProfilPaysEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface ProfilPaysRepository extends JpaRepository<ProfilPaysEntity, Long> {
    List<ProfilPaysEntity> findByProfilId(Long profilId);
    List<ProfilPaysEntity> findByPaysId(Long paysId);
    void deleteByProfilId(Long profilId);
    void deleteByProfilIdAndPaysId(Long profilId, Long paysId);
    boolean existsByProfilIdAndPaysId(Long profilId, Long paysId);
}

