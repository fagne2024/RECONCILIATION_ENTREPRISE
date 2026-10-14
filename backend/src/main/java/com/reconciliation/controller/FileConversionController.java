package com.reconciliation.controller;

import com.reconciliation.service.ExcelConversionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;

@RestController
@RequestMapping("/api/conversion")
@RequiredArgsConstructor
@Slf4j
public class FileConversionController {

    private final ExcelConversionService excelConversionService;

    @PostMapping(value = "/xls-to-xlsx", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> convertXlsToXlsx(@RequestPart("file") MultipartFile file) {
        try {
            byte[] converted = excelConversionService.convertXlsToXlsx(file);
            String outputFileName = buildOutputName(file.getOriginalFilename());
            ByteArrayResource resource = new ByteArrayResource(converted);

            return ResponseEntity.ok()
                    .contentLength(converted.length)
                    .contentType(MediaType.parseMediaType(
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + outputFileName + "\"")
                    .body(resource);
        } catch (IllegalArgumentException e) {
            log.warn("Erreur de validation lors de la conversion XLS -> XLSX: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (IOException e) {
            log.error("Erreur IO lors de la conversion XLS -> XLSX", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("message", "Erreur lors de la conversion du fichier Excel."));
        } catch (Exception e) {
            log.error("Erreur inattendue lors de la conversion XLS -> XLSX", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("message", "Erreur inattendue lors de la conversion du fichier."));
        }
    }

    private String buildOutputName(String original) {
        if (original == null || original.isBlank()) {
            return "fichier_converti.xlsx";
        }
        String baseName = original.replaceAll("\\.[^.]+$", "");
        return baseName + "_converted.xlsx";
    }
}

