package com.reconciliation.service;

import com.reconciliation.entity.CompteSoldeBoEntity;
import com.reconciliation.repository.CompteSoldeBoRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Service
public class CompteSoldeBoService {
    @Autowired
    private CompteSoldeBoRepository repository;

    public CompteSoldeBoEntity saveOrUpdate(String numeroCompte, LocalDate dateSolde, Double soldeBo) {
        Optional<CompteSoldeBoEntity> existing = repository.findByNumeroCompteAndDateSolde(numeroCompte, dateSolde);
        CompteSoldeBoEntity entity = existing.orElse(new CompteSoldeBoEntity());
        entity.setNumeroCompte(numeroCompte);
        entity.setDateSolde(dateSolde);
        entity.setSoldeBo(soldeBo);
        return repository.save(entity);
    }

    public Optional<CompteSoldeBoEntity> getByNumeroCompteAndDate(String numeroCompte, LocalDate dateSolde) {
        return repository.findByNumeroCompteAndDateSolde(numeroCompte, dateSolde);
    }

    public List<CompteSoldeBoEntity> listByNumeroCompteAndDateRange(String numeroCompte, LocalDate dateDebut, LocalDate dateFin) {
        return repository.findByNumeroCompteAndDateSoldeBetweenOrderByDateSoldeAsc(numeroCompte, dateDebut, dateFin);
    }
} 