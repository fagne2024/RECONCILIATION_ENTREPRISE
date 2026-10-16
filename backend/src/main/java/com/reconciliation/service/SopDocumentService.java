package com.reconciliation.service;

import com.reconciliation.entity.SopDocumentEntity;
import com.reconciliation.repository.SopDocumentRepository;
import com.reconciliation.util.HtmlSanitizer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Optional;

@Slf4j
@Service
public class SopDocumentService {

    @Autowired
    private SopDocumentRepository sopDocumentRepository;

    public boolean documentExists(String nodeId, String optionType) {
        return sopDocumentRepository.existsByNodeIdAndOptionType(nodeId, optionType);
    }

    public Optional<SopDocumentEntity> getDocument(String nodeId, String optionType) {
        return sopDocumentRepository.findByNodeIdAndOptionType(nodeId, optionType);
    }

    public SopDocumentEntity saveDocument(String nodeId, String optionType, MultipartFile file, String extractedText) throws IOException {
        log.info("💾 Sauvegarde document - nodeId: {}, optionType: {}", nodeId, optionType);
        log.info("💾 Nom fichier: {}", file.getOriginalFilename());
        
        SopDocumentEntity document = sopDocumentRepository.findByNodeIdAndOptionType(nodeId, optionType)
                .orElse(new SopDocumentEntity(nodeId, optionType));

        String fileName = file.getOriginalFilename();
        String fileType = getFileType(fileName);
        
        log.info("💾 Type fichier détecté: {}", fileType);
        log.info("💾 Texte extrait reçu: {}", extractedText != null && !extractedText.isEmpty() ? extractedText.length() + " caractères" : "vide ou null");

        document.setFileName(fileName);
        document.setFileType(fileType);
        document.setFileContent(file.getBytes());
        document.setExtractedText(HtmlSanitizer.sanitize(extractedText != null ? extractedText : ""));

        SopDocumentEntity saved = sopDocumentRepository.save(document);
        log.info("✅ Document sauvegardé avec ID: {}", saved.getId());
        
        return saved;
    }

    public SopDocumentEntity updateDocument(String nodeId, String optionType, MultipartFile file, String extractedText) throws IOException {
        Optional<SopDocumentEntity> documentOpt = sopDocumentRepository.findByNodeIdAndOptionType(nodeId, optionType);
        
        if (documentOpt.isEmpty()) {
            throw new IllegalArgumentException("Document non trouvé pour nodeId: " + nodeId + " et optionType: " + optionType);
        }

        SopDocumentEntity document = documentOpt.orElseThrow();
        
        if (file != null && !file.isEmpty()) {
            document.setFileName(file.getOriginalFilename());
            document.setFileType(getFileType(file.getOriginalFilename()));
            document.setFileContent(file.getBytes());
        }
        
        if (extractedText != null) {
            document.setExtractedText(HtmlSanitizer.sanitize(extractedText));
        }

        return sopDocumentRepository.save(document);
    }

    @Transactional
    public boolean deleteDocument(String nodeId, String optionType) {
        Optional<SopDocumentEntity> documentOpt = sopDocumentRepository.findByNodeIdAndOptionType(nodeId, optionType);
        if (documentOpt.isPresent()) {
            SopDocumentEntity document = documentOpt.get();
            Long documentId = document.getId();
            sopDocumentRepository.deleteById(documentId);
            sopDocumentRepository.flush(); // Forcer la synchronisation avec la base de données
            // Vérifier que la suppression a bien eu lieu
            return !sopDocumentRepository.existsById(documentId);
        }
        return false;
    }

    private String getFileType(String fileName) {
        log.debug("🔍 Détection type fichier pour: {}", fileName);
        if (fileName == null) {
            log.warn("⚠️ Nom de fichier null, retour: unknown");
            return "unknown";
        }
        String lower = fileName.toLowerCase();
        log.debug("🔍 Nom fichier (lowercase): {}", lower);
        
        if (lower.endsWith(".pdf")) {
            log.info("✅ Type détecté: PDF");
            return "pdf";
        } else if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".gif")) {
            log.info("✅ Type détecté: IMAGE");
            return "image";
        } else if (lower.endsWith(".doc")) {
            log.info("✅ Type détecté: DOC (ancien format)");
            return "document";
        } else if (lower.endsWith(".docx")) {
            log.info("✅ Type détecté: DOCX");
            return "document";
        }
        log.warn("⚠️ Type non reconnu pour '{}', retour: unknown", fileName);
        return "unknown";
    }
}

