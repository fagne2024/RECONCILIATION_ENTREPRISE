package com.reconciliation.repository;

import com.reconciliation.entity.RecoBlockingCommentMailAlertEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RecoBlockingCommentMailAlertRepository extends JpaRepository<RecoBlockingCommentMailAlertEntity, Long> {

    Optional<RecoBlockingCommentMailAlertEntity> findByRecoDateAndServiceAndCountryAndEnv(
        String recoDate,
        String service,
        String country,
        String env
    );

    List<RecoBlockingCommentMailAlertEntity> findByRecoDateGreaterThanEqualAndRecoDateLessThanEqual(
        String startDate,
        String endDate
    );

    List<RecoBlockingCommentMailAlertEntity> findByActiveTrue();
}
