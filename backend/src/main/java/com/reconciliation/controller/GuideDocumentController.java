package com.reconciliation.controller;

import com.reconciliation.entity.GuideDocumentEntity;
import com.reconciliation.service.GuideDocumentService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@Slf4j
@RestController
@RequestMapping("/api/guide-documents")
@CrossOrigin(origins = "*", allowedHeaders = "*")
public class GuideDocumentController {

    @Autowired
    private GuideDocumentService guideDocumentService;

    @GetMapping("/exists")
    public ResponseEntity<Map<String, Object>> checkDocumentExists(
            @RequestParam String nodeId,
            @RequestParam String optionType) {
        boolean exists = guideDocumentService.documentExists(nodeId, optionType);
        Map<String, Object> response = new HashMap<>();
        response.put("exists", exists);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/content")
    public ResponseEntity<Map<String, Object>> getDocumentContent(
            @RequestParam String nodeId,
            @RequestParam String optionType) {
        Optional<GuideDocumentEntity> documentOpt = guideDocumentService.getDocument(nodeId, optionType);
        
        if (documentOpt.isPresent()) {
            GuideDocumentEntity document = documentOpt.get();
            Map<String, Object> response = new HashMap<>();
            response.put("exists", true);
            response.put("fileName", document.getFileName());
            response.put("fileType", document.getFileType());
            response.put("extractedText", document.getExtractedText());
            response.put("createdAt", document.getCreatedAt());
            return ResponseEntity.ok(response);
        } else {
            Map<String, Object> response = new HashMap<>();
            response.put("exists", false);
            return ResponseEntity.ok(response);
        }
    }

    @PostMapping("/upload")
    public ResponseEntity<Map<String, Object>> uploadDocument(
            @RequestParam("file") MultipartFile file,
            @RequestParam String nodeId,
            @RequestParam String optionType,
            @RequestParam(required = false) String extractedText) {
        try {
            log.info("📤 === REQUÊTE D'UPLOAD GUIDE REÇUE ===");
            log.info("📁 Nom du fichier: {}", file.getOriginalFilename());
            log.info("📁 Type MIME: {}", file.getContentType());
            log.info("📁 Taille: {} bytes", file.getSize());
            log.info("📁 nodeId: {}", nodeId);
            log.info("📁 optionType: {}", optionType);
            log.info("📁 Texte extrait fourni: {}", extractedText != null ? "Oui (" + extractedText.length() + " caractères)" : "Non");
            
            if (file.isEmpty()) {
                log.warn("❌ Le fichier est vide");
                Map<String, Object> error = new HashMap<>();
                error.put("error", "Le fichier est vide");
                return ResponseEntity.badRequest().body(error);
            }

            log.info("💾 Sauvegarde du document guide...");
            GuideDocumentEntity savedDocument = guideDocumentService.saveDocument(
                    nodeId, 
                    optionType, 
                    file, 
                    extractedText != null ? extractedText : ""
            );

            log.info("✅ Document guide sauvegardé avec succès");
            log.info("📊 ID document: {}", savedDocument.getId());
            log.info("📊 Nom fichier: {}", savedDocument.getFileName());
            log.info("📊 Type fichier: {}", savedDocument.getFileType());
            log.info("📊 Texte extrait: {}", savedDocument.getExtractedText() != null ? savedDocument.getExtractedText().length() + " caractères" : "null");

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Document guide uploadé avec succès");
            response.put("documentId", savedDocument.getId());
            response.put("fileName", savedDocument.getFileName());
            response.put("extractedText", savedDocument.getExtractedText());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("❌ Erreur lors de l'upload: {}", e.getMessage(), e);
            Map<String, Object> error = new HashMap<>();
            error.put("error", "Erreur lors de l'upload: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }

    @GetMapping("/download")
    public ResponseEntity<byte[]> downloadDocument(
            @RequestParam String nodeId,
            @RequestParam String optionType) {
        Optional<GuideDocumentEntity> documentOpt = guideDocumentService.getDocument(nodeId, optionType);
        
        if (documentOpt.isPresent()) {
            GuideDocumentEntity document = documentOpt.get();
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
            headers.setContentDispositionFormData("attachment", document.getFileName());
            return new ResponseEntity<>(document.getFileContent(), headers, HttpStatus.OK);
        } else {
            return ResponseEntity.notFound().build();
        }
    }

    @PutMapping("/update")
    public ResponseEntity<Map<String, Object>> updateDocument(
            @RequestParam String nodeId,
            @RequestParam String optionType,
            @RequestParam(required = false) MultipartFile file,
            @RequestParam(required = false) String extractedText) {
        try {
            GuideDocumentEntity updatedDocument = guideDocumentService.updateDocument(
                    nodeId,
                    optionType,
                    file,
                    extractedText
            );

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Document guide modifié avec succès");
            response.put("documentId", updatedDocument.getId());
            response.put("fileName", updatedDocument.getFileName());
            response.put("extractedText", updatedDocument.getExtractedText());
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", "Erreur lors de la modification: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }

    @DeleteMapping("/delete")
    public ResponseEntity<Map<String, Object>> deleteDocument(
            @RequestParam String nodeId,
            @RequestParam String optionType) {
        try {
            boolean deleted = guideDocumentService.deleteDocument(nodeId, optionType);
            Map<String, Object> response = new HashMap<>();
            if (deleted) {
                response.put("success", true);
                response.put("message", "Document guide supprimé avec succès");
                return ResponseEntity.ok(response);
            } else {
                response.put("success", false);
                response.put("error", "Document guide non trouvé");
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(response);
            }
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("error", "Erreur lors de la suppression: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
}
