package com.reconciliation.service;

import com.reconciliation.entity.GuideDocumentEntity;
import com.reconciliation.repository.GuideDocumentRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Optional;

@Slf4j
@Service
public class GuideDocumentService {

    @Autowired
    private GuideDocumentRepository guideDocumentRepository;

    public boolean documentExists(String nodeId, String optionType) {
        return guideDocumentRepository.existsByNodeIdAndOptionType(nodeId, optionType);
    }

    public Optional<GuideDocumentEntity> getDocument(String nodeId, String optionType) {
        return guideDocumentRepository.findByNodeIdAndOptionType(nodeId, optionType);
    }

    public GuideDocumentEntity saveDocument(String nodeId, String optionType, MultipartFile file, String extractedText) throws IOException {
        log.info("💾 Sauvegarde document guide - nodeId: {}, optionType: {}", nodeId, optionType);
        log.info("💾 Nom fichier: {}", file.getOriginalFilename());
        
        GuideDocumentEntity document = guideDocumentRepository.findByNodeIdAndOptionType(nodeId, optionType)
                .orElse(new GuideDocumentEntity(nodeId, optionType));

        String fileName = file.getOriginalFilename();
        String fileType = getFileType(fileName);
        
        log.info("💾 Type fichier détecté: {}", fileType);
        log.info("💾 Texte extrait reçu: {}", extractedText != null && !extractedText.isEmpty() ? extractedText.length() + " caractères" : "vide ou null");

        document.setFileName(fileName);
        document.setFileType(fileType);
        document.setFileContent(file.getBytes());
        document.setExtractedText(extractedText != null ? extractedText : "");

        GuideDocumentEntity saved = guideDocumentRepository.save(document);
        log.info("✅ Document guide sauvegardé avec ID: {}", saved.getId());
        
        return saved;
    }

    public GuideDocumentEntity updateDocument(String nodeId, String optionType, MultipartFile file, String extractedText) throws IOException {
        Optional<GuideDocumentEntity> documentOpt = guideDocumentRepository.findByNodeIdAndOptionType(nodeId, optionType);
        
        if (documentOpt.isEmpty()) {
            throw new IllegalArgumentException("Document non trouvé pour nodeId: " + nodeId + " et optionType: " + optionType);
        }

        GuideDocumentEntity document = documentOpt.orElseThrow();
        
        if (file != null && !file.isEmpty()) {
            document.setFileName(file.getOriginalFilename());
            document.setFileType(getFileType(file.getOriginalFilename()));
            document.setFileContent(file.getBytes());
        }
        
        if (extractedText != null) {
            document.setExtractedText(extractedText);
        }

        return guideDocumentRepository.save(document);
    }

    @Transactional
    public boolean deleteDocument(String nodeId, String optionType) {
        Optional<GuideDocumentEntity> documentOpt = guideDocumentRepository.findByNodeIdAndOptionType(nodeId, optionType);
        if (documentOpt.isPresent()) {
            GuideDocumentEntity document = documentOpt.get();
            Long documentId = document.getId();
            guideDocumentRepository.deleteById(documentId);
            guideDocumentRepository.flush();
            return !guideDocumentRepository.existsById(documentId);
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
