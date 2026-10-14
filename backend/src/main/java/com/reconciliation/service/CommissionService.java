package com.reconciliation.service;

import com.reconciliation.dto.CommissionRequest;
import com.reconciliation.entity.CommissionEntity;
import com.reconciliation.repository.CommissionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Gestion de la configuration des commissions (versement de commission) par couple
 * service + agence. Calquée sur {@link FraisTransactionService}.
 */
@Service
public class CommissionService {

    @Autowired
    private CommissionRepository commissionRepository;

    @Transactional
    public CommissionEntity createCommission(CommissionRequest request) {
        Optional<CommissionEntity> existing = commissionRepository.findCommissionApplicable(request.getService(), request.getAgence());
        if (existing.isPresent()) {
            throw new IllegalArgumentException("Une commission existe déjà pour le service '" + request.getService() + "' et l'agence '" + request.getAgence() + "'");
        }

        CommissionEntity commission = new CommissionEntity();
        commission.setService(request.getService());
        commission.setAgence(request.getAgence());
        commission.setMontantCommission(request.getMontantCommission());
        commission.setTypeCalcul(request.getTypeCalcul() != null ? request.getTypeCalcul() : "NOMINAL");
        commission.setPourcentage(request.getPourcentage());
        commission.setDescription(request.getDescription());
        commission.setActif(request.getActif() != null ? request.getActif() : true);
        commission.setDateCreation(LocalDateTime.now());
        commission.setDateModification(LocalDateTime.now());
        return commissionRepository.save(commission);
    }

    @Transactional
    public CommissionEntity updateCommission(Long id, CommissionRequest request) {
        CommissionEntity commission = commissionRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Commission non trouvée avec ID: " + id));

        Optional<CommissionEntity> existing = commissionRepository.findCommissionApplicable(request.getService(), request.getAgence());
        if (existing.isPresent() && !existing.get().getId().equals(id)) {
            throw new IllegalArgumentException("Une commission existe déjà pour le service '" + request.getService() + "' et l'agence '" + request.getAgence() + "'");
        }

        commission.setService(request.getService());
        commission.setAgence(request.getAgence());
        commission.setMontantCommission(request.getMontantCommission());
        commission.setTypeCalcul(request.getTypeCalcul() != null ? request.getTypeCalcul() : "NOMINAL");
        commission.setPourcentage(request.getPourcentage());
        commission.setDescription(request.getDescription());
        if (request.getActif() != null) {
            commission.setActif(request.getActif());
        }
        commission.setDateModification(LocalDateTime.now());
        return commissionRepository.save(commission);
    }

    public Optional<CommissionEntity> getCommissionById(Long id) {
        return commissionRepository.findById(id);
    }

    public List<CommissionEntity> getAllCommissionsActifs() {
        return commissionRepository.findByActifTrueOrderByDateModificationDesc();
    }

    public List<CommissionEntity> getAllCommissions() {
        return commissionRepository.findAllOrderByDateModificationDesc();
    }

    public List<CommissionEntity> getCommissionsByService(String service) {
        return commissionRepository.findByService(service);
    }

    public List<CommissionEntity> getCommissionsByAgence(String agence) {
        return commissionRepository.findByAgence(agence);
    }

    public Optional<CommissionEntity> getCommissionApplicable(String service, String agence) {
        return commissionRepository.findCommissionApplicable(service, agence);
    }

    @Transactional
    public boolean deleteCommission(Long id) {
        Optional<CommissionEntity> commission = commissionRepository.findById(id);
        if (commission.isPresent()) {
            commissionRepository.deleteById(id);
            return true;
        }
        return false;
    }

    @Transactional
    public boolean toggleCommission(Long id) {
        Optional<CommissionEntity> commission = commissionRepository.findById(id);
        if (commission.isPresent()) {
            CommissionEntity entity = commission.get();
            entity.setActif(!entity.getActif());
            entity.setDateModification(LocalDateTime.now());
            commissionRepository.save(entity);
            return true;
        }
        return false;
    }
}
