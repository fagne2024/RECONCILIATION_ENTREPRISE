package com.reconciliation.repository;

import com.reconciliation.entity.TopUsersConfigEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Acces a la configuration « Top des utilisateurs » (une ligne par entreprise).
 * Le filtrage par entreprise est automatique ({@code @TenantId}).
 */
@Repository
public interface TopUsersConfigRepository extends JpaRepository<TopUsersConfigEntity, Long> {

    Optional<TopUsersConfigEntity> findFirstByOrderByIdAsc();
}
