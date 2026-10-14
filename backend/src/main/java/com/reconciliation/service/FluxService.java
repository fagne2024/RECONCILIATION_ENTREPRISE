package com.reconciliation.service;

import com.reconciliation.dto.FluxRequest;
import com.reconciliation.entity.FluxEntity;
import com.reconciliation.repository.FluxRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.Optional;

@Service
public class FluxService {

    @Autowired
    private FluxRepository fluxRepository;

    public Optional<FluxEntity> findByAgenceAndPeriod(String agence, LocalDate dateDebut, LocalDate dateFin) {
        return fluxRepository.findByAgenceAndDateDebutAndDateFin(agence, dateDebut, dateFin);
    }

    public FluxEntity saveOrUpdate(FluxRequest request) {
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
