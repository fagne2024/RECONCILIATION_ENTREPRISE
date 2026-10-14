package com.reconciliation.service;

import com.reconciliation.entity.CompteSoldeClotureEntity;
import com.reconciliation.repository.CompteSoldeClotureRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

@Service
public class CompteSoldeClotureService {

    @Autowired
    private CompteSoldeClotureRepository repository;

    public CompteSoldeClotureEntity saveOrUpdate(String numeroCompte, LocalDate dateSolde, Double soldeCloture) {
        Optional<CompteSoldeClotureEntity> existing = repository.findByNumeroCompteAndDateSolde(numeroCompte, dateSolde);
        CompteSoldeClotureEntity entity = existing.orElse(new CompteSoldeClotureEntity());
        entity.setNumeroCompte(numeroCompte);
        entity.setDateSolde(dateSolde);
        entity.setSoldeCloture(soldeCloture);
        return repository.save(entity);
    }

    public Optional<CompteSoldeClotureEntity> getByNumeroCompteAndDate(String numeroCompte, LocalDate dateSolde) {
        return repository.findByNumeroCompteAndDateSolde(numeroCompte, dateSolde);
    }

    public List<CompteSoldeClotureEntity> list(String numeroCompte, LocalDate dateDebut, LocalDate dateFin) {
        if (numeroCompte == null || numeroCompte.isEmpty()) {
            return Collections.emptyList();
        }
        if (dateDebut != null && dateFin != null) {
            return repository.findByNumeroCompteAndDateSoldeBetween(numeroCompte, dateDebut, dateFin);
        }
        if (dateDebut != null) {
            return repository.findByNumeroCompteAndDateSoldeBetween(numeroCompte, dateDebut, dateDebut);
        }
        if (dateFin != null) {
            return repository.findByNumeroCompteAndDateSoldeBetween(numeroCompte, dateFin, dateFin);
        }
        return repository.findByNumeroCompteOrderByDateSoldeDesc(numeroCompte);
    }

    public boolean delete(String numeroCompte, LocalDate dateSolde) {
        Optional<CompteSoldeClotureEntity> existing = repository.findByNumeroCompteAndDateSolde(numeroCompte, dateSolde);
        if (existing.isPresent()) {
            repository.delete(existing.get());
            return true;
        }
        return false;
    }
}

