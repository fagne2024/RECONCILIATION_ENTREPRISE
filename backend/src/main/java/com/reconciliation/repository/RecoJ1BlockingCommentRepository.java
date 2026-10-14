package com.reconciliation.repository;

import com.reconciliation.entity.RecoJ1BlockingCommentEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RecoJ1BlockingCommentRepository extends JpaRepository<RecoJ1BlockingCommentEntity, Long> {

    List<RecoJ1BlockingCommentEntity> findByRecoDateGreaterThanEqualAndRecoDateLessThanEqual(
        String startDate,
        String endDate
    );

    Optional<RecoJ1BlockingCommentEntity> findByRecoDateAndServiceAndCountryAndEnv(
        String recoDate,
        String service,
        String country,
        String env
    );
}
