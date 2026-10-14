package com.reconciliation.repository;

import com.reconciliation.entity.UserEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.List;

public interface UserRepository extends JpaRepository<UserEntity, Long> {
    Optional<UserEntity> findByUsername(String username);
    Optional<UserEntity> findByEmail(String email);
    List<UserEntity> findByProfilId(Long profilId);
    Optional<UserEntity> findFirstByEntrepriseIdIsNull();
    List<UserEntity> findByEntrepriseId(Long entrepriseId);
}
