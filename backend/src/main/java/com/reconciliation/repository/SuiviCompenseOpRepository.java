package com.reconciliation.repository;

import com.reconciliation.entity.SuiviCompenseOpEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SuiviCompenseOpRepository extends JpaRepository<SuiviCompenseOpEntity, Long> {
    List<SuiviCompenseOpEntity> findAllByOrderByDateOperationDescIdDesc();
}
