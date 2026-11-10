package com.reconciliation.repository;

import com.reconciliation.entity.ModelColumnEquivalenceEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ModelColumnEquivalenceRepository extends JpaRepository<ModelColumnEquivalenceEntity, Long> {

    List<ModelColumnEquivalenceEntity> findAllByOrderByModelIdAscColumnNameAsc();

    List<ModelColumnEquivalenceEntity> findByModelIdOrderByColumnNameAsc(String modelId);
}
