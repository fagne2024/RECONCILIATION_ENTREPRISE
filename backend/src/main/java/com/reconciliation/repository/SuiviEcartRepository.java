package com.reconciliation.repository;

import com.reconciliation.entity.SuiviEcartEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface SuiviEcartRepository extends JpaRepository<SuiviEcartEntity, Long> {
    
    @Query("SELECT s FROM SuiviEcartEntity s ORDER BY s.date DESC")
    List<SuiviEcartEntity> findAllOrderByDateDesc();
    
    @Query("SELECT COUNT(s) > 0 FROM SuiviEcartEntity s WHERE s.date = :date " +
           "AND s.agence = :agence AND s.service = :service AND s.pays = :pays " +
           "AND s.token = :token AND s.idPartenaire = :idPartenaire")
    boolean existsByDateAndAgenceAndServiceAndPaysAndTokenAndIdPartenaire(
            @Param("date") LocalDate date,
            @Param("agence") String agence,
            @Param("service") String service,
            @Param("pays") String pays,
            @Param("token") String token,
            @Param("idPartenaire") String idPartenaire
    );
}

