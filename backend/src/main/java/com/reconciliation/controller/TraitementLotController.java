package com.reconciliation.controller;

import com.reconciliation.service.traitement.TraitementExportService;
import com.reconciliation.service.traitement.TraitementLotService;
import com.reconciliation.service.traitement.TraitementOperationService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Traitement serveur par lots (phase 1) : les fichiers sont envoyés un par un et stockés
 * en base, le navigateur ne garde pas les lignes en mémoire.
 *
 * <p>Le chemin {@code /api/traitement/**} est rattaché au module « Traitement » par
 * {@code PermissionCheckService} : les droits du module s'appliquent automatiquement.</p>
 */
@RestController
@RequestMapping("/api/traitement/lots")
public class TraitementLotController {

    private final TraitementLotService service;
    private final TraitementOperationService operations;
    private final TraitementExportService exports;

    public TraitementLotController(TraitementLotService service, TraitementOperationService operations,
                                   TraitementExportService exports) {
        this.service = service;
        this.operations = operations;
        this.exports = exports;
    }

    /** Crée un lot vide. */
    @PostMapping
    public ResponseEntity<Map<String, Object>> creer(Authentication authentication) {
        String utilisateur = authentication != null ? authentication.getName() : null;
        long lotId = service.creerLot(utilisateur);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("lotId", lotId));
    }

    /** Ajoute un fichier au lot (un fichier par requête, limite multipart de l'application). */
    @PostMapping(value = "/{lotId}/fichiers", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> ajouterFichier(@PathVariable long lotId,
                                                              @RequestParam("file") MultipartFile fichier) {
        return ResponseEntity.ok(service.ajouterFichier(lotId, fichier));
    }

    /** Résumé du lot : statut, fichiers, colonnes et nombre de lignes. */
    @GetMapping("/{lotId}")
    public ResponseEntity<Map<String, Object>> resume(@PathVariable long lotId) {
        return ResponseEntity.ok(service.resume(lotId));
    }

    /** Page de lignes (pagination par curseur : {@code apresNumero} = dernier numéro reçu). */
    @GetMapping("/{lotId}/lignes")
    public ResponseEntity<Map<String, Object>> lignes(@PathVariable long lotId,
                                                      @RequestParam(value = "apresNumero", defaultValue = "0") long apresNumero,
                                                      @RequestParam(value = "taille", defaultValue = "500") int taille) {
        return ResponseEntity.ok(service.lignes(lotId, apresNumero, taille));
    }

    /**
     * Applique filtres, dédoublonnage et conversions à un lot. Le résultat est un nouveau lot
     * (le lot source n'est pas modifié).
     */
    @PostMapping("/{lotId}/operations")
    public ResponseEntity<TraitementOperationService.ResultatOperation> operer(
            @PathVariable long lotId,
            @RequestBody TraitementOperationService.Operation operation,
            Authentication authentication) {
        String utilisateur = authentication != null ? authentication.getName() : null;
        return ResponseEntity.ok(operations.executer(lotId, operation, utilisateur));
    }

    /** Supprime le lot et toutes ses lignes. */
    @DeleteMapping("/{lotId}")
    public ResponseEntity<Void> supprimer(@PathVariable long lotId) {
        service.supprimerLot(lotId);
        return ResponseEntity.noContent().build();
    }

    /**
     * Export du lot en CSV ou XLSX. Écriture directe dans la réponse, de façon synchrone : pas de
     * {@code StreamingResponseBody} (une seconde passe asynchrone refusée par la sécurité JWT
     * couperait le fichier). Les vérifications (lot, format, colonnes) sont faites avant
     * d'écrire le moindre octet, pour que les erreurs restent des réponses JSON.
     */
    @GetMapping("/{lotId}/export")
    public void exporter(@PathVariable long lotId,
                         @RequestParam(value = "format", defaultValue = "csv") String format,
                         @RequestParam(value = "nom", defaultValue = "resultat") String nom,
                         HttpServletResponse response) throws IOException {
        TraitementExportService.Format formatChoisi = TraitementExportService.Format.depuis(format);
        TraitementExportService.Plan plan = exports.preparer(lotId, formatChoisi);
        String base = nom.replaceAll("[^\\p{L}\\p{N}_\\- ]", "").trim();
        String fichier = (base.isEmpty() ? "resultat" : base) + "." + formatChoisi.extension();
        response.setContentType(formatChoisi.type().toString());
        response.setHeader(HttpHeaders.CONTENT_DISPOSITION,
                ContentDisposition.attachment().filename(fichier, StandardCharsets.UTF_8).build().toString());
        exports.ecrire(plan, response.getOutputStream());
        response.flushBuffer();
    }
}
