package com.reconciliation.controller;

import com.reconciliation.entity.RedevanceAgenceParamEntity;
import com.reconciliation.dto.RedevanceParamRequest;
import com.reconciliation.service.RedevanceService;
import com.reconciliation.util.RequestContextUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/redevance")
@CrossOrigin(origins = {"http://localhost:4200", "https://reconciliation.intouchgroup.net:4200"})
public class RedevanceController {

    @Autowired
    private RedevanceService redevanceService;

    @GetMapping("/compute")
    public ResponseEntity<Map<String, Object>> computeRedevance(
            @RequestParam(required = false) String agence,
            @RequestParam(required = false) List<String> pays,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        String username = RequestContextUtil.getUsernameFromRequest();
        if (username == null) username = "";
        Map<String, Object> result = redevanceService.computeRedevance(agence, pays, startDate, endDate, username);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/params/{agence}")
    public ResponseEntity<RedevanceAgenceParamEntity> getParams(@PathVariable String agence) {
        RedevanceAgenceParamEntity params = redevanceService.getOrCreateParams(agence);
        return ResponseEntity.ok(params);
    }

    @PutMapping("/params")
    public ResponseEntity<RedevanceAgenceParamEntity> saveParams(@RequestBody RedevanceParamRequest request) {
        RedevanceAgenceParamEntity params = new RedevanceAgenceParamEntity();
        params.setAgence(request.getAgence());
        params.setRetenueSurGainsPourcentage(request.getRetenueSurGainsPourcentage() != null ? request.getRetenueSurGainsPourcentage() : 15.0);
        params.setRetenueSurGainsSeuil(request.getRetenueSurGainsSeuil() != null ? request.getRetenueSurGainsSeuil() : 500000.0);
        params.setTaxeJeuxHasardPourcentage(request.getTaxeJeuxHasardPourcentage() != null ? request.getTaxeJeuxHasardPourcentage() : 5.0);
        params.setTauxRedevancePourcentage(request.getTauxRedevancePourcentage() != null ? request.getTauxRedevancePourcentage() : 50.0);
        RedevanceAgenceParamEntity saved = redevanceService.saveParams(params);
        return ResponseEntity.ok(saved);
    }
}
