package com.reconciliation.service;

import com.reconciliation.dto.FluxRequest;
import com.reconciliation.entity.CompteEntity;
import com.reconciliation.entity.FluxEntity;
import com.reconciliation.repository.CompteRepository;
import com.reconciliation.repository.FluxRepository;
import com.reconciliation.util.RequestContextUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Service
public class FluxService {

    @Autowired
    private FluxRepository fluxRepository;

    @Autowired
    private CompteRepository compteRepository;

    @Autowired
    private PaysFilterService paysFilterService;

    public boolean canAccessAgence(String agence) {
        if (agence == null || agence.isBlank()) {
            return false;
        }
        String username = RequestContextUtil.getUsernameFromRequest();
        List<String> allowedPays = paysFilterService.getAllowedPaysCodes(username);
        if (allowedPays == null) {
            return true;
        }
        if (allowedPays.isEmpty()) {
            return false;
        }
        List<CompteEntity> comptes = compteRepository.findByAgency(agence.trim());
        if (comptes == null || comptes.isEmpty()) {
            return false;
        }
        return comptes.stream()
            .map(CompteEntity::getPays)
            .anyMatch(pays -> pays != null && allowedPays.contains(pays));
    }

    public Optional<FluxEntity> findByAgenceAndPeriod(String agence, LocalDate dateDebut, LocalDate dateFin) {
        if (!canAccessAgence(agence)) {
            return Optional.empty();
        }
        return fluxRepository.findByAgenceAndDateDebutAndDateFin(agence, dateDebut, dateFin);
    }

    public FluxEntity saveOrUpdate(FluxRequest request) {
        if (request == null || !canAccessAgence(request.getAgence())) {
            throw new org.springframework.security.access.AccessDeniedException(
                "Accès refusé à l'agence demandée");
        }
        FluxEntity entity = fluxRepository.findByAgenceAndDateDebutAndDateFin(
            request.getAgence(),
            request.getDateDebut(),
            request.getDateFin()
        ).orElse(new FluxEntity());

        entity.setAgence(request.getAgence());
        entity.setDateDebut(request.getDateDebut());
        entity.setDateFin(request.getDateFin());
        entity.setTotalMises(request.getTotalMises() != null ? request.getTotalMises() : 0.0);
        entity.setTotalGains(request.getTotalGains() != null ? request.getTotalGains() : 0.0);
        entity.setTotalBonus(request.getTotalBonus() != null ? request.getTotalBonus() : 0.0);
        entity.setPayin(request.getPayin() != null ? request.getPayin() : 0.0);
        entity.setPayout(request.getPayout() != null ? request.getPayout() : 0.0);
        entity.setRetenueSurGains(request.getRetenueSurGains() != null ? request.getRetenueSurGains() : 0.0);

        return fluxRepository.save(entity);
    }
}
