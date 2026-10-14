package com.reconciliation.controller;

import com.reconciliation.entity.CompteSoldeBoEntity;
import com.reconciliation.service.CompteSoldeBoService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/compte-solde-bo")
public class CompteSoldeBoController {
    @Autowired
    private CompteSoldeBoService service;

    @PostMapping("/set")
    public CompteSoldeBoEntity setSoldeBo(@RequestBody Map<String, Object> payload) {
        String numeroCompte = (String) payload.get("numeroCompte");
        String dateSolde = (String) payload.get("dateSolde");
        Double soldeBo = Double.valueOf(payload.get("soldeBo").toString());
        return service.saveOrUpdate(numeroCompte, LocalDate.parse(dateSolde), soldeBo);
    }

    @GetMapping("/get")
    public Double getSoldeBo(@RequestParam String numeroCompte, @RequestParam String dateSolde) {
        Optional<CompteSoldeBoEntity> entity = service.getByNumeroCompteAndDate(numeroCompte, LocalDate.parse(dateSolde));
        return entity.map(CompteSoldeBoEntity::getSoldeBo).orElse(null);
    }

    @GetMapping("/list")
    public List<CompteSoldeBoEntity> listSoldesBo(
            @RequestParam String numeroCompte,
            @RequestParam String dateDebut,
            @RequestParam String dateFin) {
        return service.listByNumeroCompteAndDateRange(numeroCompte, LocalDate.parse(dateDebut), LocalDate.parse(dateFin));
    }
} 