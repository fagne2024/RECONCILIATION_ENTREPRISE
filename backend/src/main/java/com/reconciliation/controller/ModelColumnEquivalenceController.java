package com.reconciliation.controller;

import com.reconciliation.entity.ModelColumnEquivalenceEntity;
import com.reconciliation.service.ModelColumnEquivalenceService;
import com.reconciliation.service.ModelColumnEquivalenceService.ColumnEquivalence;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Sous-module Configuration &gt; Normalisation modèle : en-têtes équivalents des colonnes
 * par défaut des modèles de traitement.
 *
 * <p>Lecture ouverte à tout utilisateur authentifié de l'entreprise (le traitement et la
 * réconciliation en ont besoin au chargement des fichiers, cf. PermissionInterceptor) ;
 * l'écriture reste soumise au module « Modèles ».</p>
 */
@RestController
@RequestMapping("/api/configuration/normalisation")
@CrossOrigin(origins = {"http://localhost:4200", "https://reconciliation.intouchgroup.net:4200"})
public class ModelColumnEquivalenceController {

    @Autowired
    private ModelColumnEquivalenceService service;

    @GetMapping
    public ResponseEntity<List<ModelColumnEquivalenceEntity>> list(@RequestParam(required = false) String modelId) {
        if (modelId != null && !modelId.isBlank()) {
            return ResponseEntity.ok(service.findByModel(modelId));
        }
        return ResponseEntity.ok(service.findAll());
    }

    /** Remplace toutes les équivalences d'un modèle. */
    @PutMapping("/models/{modelId}")
    public ResponseEntity<List<ModelColumnEquivalenceEntity>> replace(@PathVariable String modelId,
                                                                      @RequestBody List<ColumnEquivalence> items) {
        return ResponseEntity.ok(service.replaceForModel(modelId, items));
    }
}
