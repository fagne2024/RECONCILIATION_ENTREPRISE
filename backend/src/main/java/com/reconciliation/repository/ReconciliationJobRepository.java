package com.reconciliation.repository;

import com.reconciliation.entity.ReconciliationJob;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface ReconciliationJobRepository extends JpaRepository<ReconciliationJob, Long> {
    
    Optional<ReconciliationJob> findByJobId(String jobId);
    
    List<ReconciliationJob> findByStatus(ReconciliationJob.JobStatus status);
    
    List<ReconciliationJob> findByClientId(String clientId);
    
    @Query("SELECT j FROM ReconciliationJob j WHERE j.createdAt < :cutoffDate AND j.status IN ('PENDING', 'PREPARING', 'PROCESSING')")
    List<ReconciliationJob> findStaleJobs(@Param("cutoffDate") LocalDateTime cutoffDate);
    
    @Query("SELECT COUNT(j) FROM ReconciliationJob j WHERE j.status = :status")
    long countByStatus(@Param("status") ReconciliationJob.JobStatus status);
    
    @Query("SELECT j FROM ReconciliationJob j WHERE j.status IN ('PENDING', 'PREPARING', 'PROCESSING') ORDER BY j.createdAt ASC")
    List<ReconciliationJob> findActiveJobs();
}
