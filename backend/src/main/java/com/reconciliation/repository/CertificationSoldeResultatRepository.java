package com.reconciliation.repository;

import com.reconciliation.entity.CertificationSoldeResultatEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Optional;

public interface CertificationSoldeResultatRepository extends JpaRepository<CertificationSoldeResultatEntity, Long> {

    Optional<CertificationSoldeResultatEntity> findByNumeroCompteAndDateDebutAndDateFin(
            String numeroCompte, LocalDate dateDebut, LocalDate dateFin);

    /** Certifications dont la période chevauche [dateDebut, dateFin] ; filtres nuls ignorés. */
    @Query(value = "SELECT c FROM CertificationSoldeResultatEntity c "
            + "WHERE (:numeroCompte IS NULL OR c.numeroCompte = :numeroCompte) "
            + "AND (:env IS NULL OR c.env = :env) "
            + "AND (:pays IS NULL OR c.pays = :pays) "
            + "AND (:dateDebut IS NULL OR c.dateFin >= :dateDebut) "
            + "AND (:dateFin IS NULL OR c.dateDebut <= :dateFin) "
            + "ORDER BY c.dateFin DESC, c.updatedAt DESC, c.id DESC",
            countQuery = "SELECT COUNT(c) FROM CertificationSoldeResultatEntity c "
            + "WHERE (:numeroCompte IS NULL OR c.numeroCompte = :numeroCompte) "
            + "AND (:env IS NULL OR c.env = :env) "
            + "AND (:pays IS NULL OR c.pays = :pays) "
            + "AND (:dateDebut IS NULL OR c.dateFin >= :dateDebut) "
            + "AND (:dateFin IS NULL OR c.dateDebut <= :dateFin)")
    Page<CertificationSoldeResultatEntity> search(@Param("numeroCompte") String numeroCompte,
                                                  @Param("env") String env,
                                                  @Param("pays") String pays,
                                                  @Param("dateDebut") LocalDate dateDebut,
                                                  @Param("dateFin") LocalDate dateFin,
                                                  Pageable pageable);
}
