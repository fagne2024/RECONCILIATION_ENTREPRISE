package com.reconciliation.controller;

import com.reconciliation.entity.CompteSoldeClotureEntity;
import com.reconciliation.service.CompteSoldeClotureService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/compte-solde-cloture")
public class CompteSoldeClotureController {

    @Autowired
    private CompteSoldeClotureService service;

    @PostMapping("/set")
    public ResponseEntity<CompteSoldeClotureEntity> setSoldeCloture(@RequestBody Map<String, Object> payload) {
        String numeroCompte = (String) payload.get("numeroCompte");
        String dateSolde = (String) payload.get("dateSolde");
        Double soldeCloture = Double.valueOf(payload.get("soldeCloture").toString());

        CompteSoldeClotureEntity entity = service.saveOrUpdate(numeroCompte, LocalDate.parse(dateSolde), soldeCloture);
        return ResponseEntity.ok(entity);
    }

    @GetMapping("/get")
    public ResponseEntity<Double> getSoldeCloture(@RequestParam String numeroCompte,
                                                  @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateSolde) {
        return service.getByNumeroCompteAndDate(numeroCompte, dateSolde)
                .map(e -> ResponseEntity.ok(e.getSoldeCloture()))
                .orElse(ResponseEntity.ok(null));
    }

    @GetMapping("/list")
    public ResponseEntity<List<CompteSoldeClotureEntity>> list(@RequestParam String numeroCompte,
                                                               @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateDebut,
                                                               @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFin) {
        return ResponseEntity.ok(service.list(numeroCompte, dateDebut, dateFin));
    }

    @DeleteMapping("/delete")
    public ResponseEntity<Map<String, Object>> delete(@RequestParam String numeroCompte,
                                                      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateSolde) {
        boolean deleted = service.delete(numeroCompte, dateSolde);
        Map<String, Object> response = new HashMap<>();
        response.put("success", deleted);
        if (deleted) {
            response.put("message", "Solde de clôture supprimé");
        } else {
            response.put("message", "Aucun solde de clôture à supprimer");
        }
        return ResponseEntity.ok(response);
    }
}

