package com.reconciliation.service;

import lombok.extern.slf4j.Slf4j;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.util.IOUtils;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

@Service
@Slf4j
public class ExcelConversionService {

    static {
        IOUtils.setByteArrayMaxOverride(512 * 1024 * 1024);
    }

    public byte[] convertXlsToXlsx(MultipartFile file) throws IOException {
        validateFile(file);
        long startTime = System.currentTimeMillis();
        log.info("Début conversion XLS -> XLSX: {} ({} MB)", 
                file.getOriginalFilename(), 
                file.getSize() / (1024 * 1024));

        try (InputStream inputStream = file.getInputStream();
             HSSFWorkbook sourceWorkbook = new HSSFWorkbook(inputStream);
             SXSSFWorkbook targetWorkbook = new SXSSFWorkbook(1000)) { // Streaming avec 1000 lignes en mémoire

            int totalSheets = sourceWorkbook.getNumberOfSheets();
            log.info("Nombre de feuilles à convertir: {}", totalSheets);

            for (int i = 0; i < totalSheets; i++) {
                Sheet sourceSheet = sourceWorkbook.getSheetAt(i);
                String sheetName = sourceSheet.getSheetName();
                log.info("Conversion feuille {}/{}: {}", i + 1, totalSheets, sheetName);
                
                Sheet targetSheet = targetWorkbook.createSheet(sheetName);
                copySheetOptimized(sourceSheet, targetSheet, targetWorkbook);
            }

            try (ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {
                targetWorkbook.write(outputStream);
                long duration = System.currentTimeMillis() - startTime;
                log.info("Conversion terminée en {} ms ({} s)", duration, duration / 1000);
                return outputStream.toByteArray();
            }
        }
    }

    private void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Le fichier fourni est vide.");
        }

        String fileName = file.getOriginalFilename();
        if (fileName == null || fileName.isBlank()) {
            throw new IllegalArgumentException("Nom de fichier invalide.");
        }

        if (!fileName.toLowerCase().endsWith(".xls")) {
            throw new IllegalArgumentException("Seuls les fichiers .xls (Excel 97-2003) sont acceptés pour la conversion.");
        }
    }

    private void copySheetOptimized(Sheet sourceSheet, Sheet targetSheet, Workbook targetWorkbook) {
        // Cache de styles optimisé - réutilise les styles au lieu de les cloner
        Map<Integer, CellStyle> styleCache = new HashMap<>();
        CellStyle defaultStyle = null;

        // Copie optimisée des lignes - itération directe sans vérifications inutiles
        int firstRowNum = sourceSheet.getFirstRowNum();
        int lastRowNum = sourceSheet.getLastRowNum();
        
        // Traitement par batch pour réduire les allocations
        for (int rowIndex = firstRowNum; rowIndex <= lastRowNum; rowIndex++) {
            Row sourceRow = sourceSheet.getRow(rowIndex);
            if (sourceRow == null) {
                continue;
            }

            Row targetRow = targetSheet.createRow(rowIndex);
            
            // Copier la hauteur seulement si différente de la valeur par défaut
            short height = sourceRow.getHeight();
            if (height != sourceSheet.getDefaultRowHeight()) {
                targetRow.setHeight(height);
            }

            int firstCellNum = sourceRow.getFirstCellNum();
            int lastCellNum = sourceRow.getLastCellNum();
            
            // Copie optimisée des cellules
            for (int colIndex = firstCellNum; colIndex < lastCellNum; colIndex++) {
                Cell sourceCell = sourceRow.getCell(colIndex);
                if (sourceCell == null) {
                    continue;
                }

                Cell targetCell = targetRow.createCell(colIndex);
                
                // Copie rapide de la valeur
                copyCellValueFast(sourceCell, targetCell);

                // Style simplifié - seulement si nécessaire
                CellStyle sourceStyle = sourceCell.getCellStyle();
                if (sourceStyle != null) {
                    int styleIndex = sourceStyle.getIndex();
                    CellStyle cachedStyle = styleCache.get(styleIndex);
                    if (cachedStyle == null) {
                        cachedStyle = cloneCellStyleFast(sourceStyle, targetWorkbook);
                        styleCache.put(styleIndex, cachedStyle);
                    }
                    targetCell.setCellStyle(cachedStyle);
                } else if (defaultStyle == null) {
                    defaultStyle = targetWorkbook.createCellStyle();
                    targetCell.setCellStyle(defaultStyle);
                }
            }
        }

        // Copie des largeurs de colonnes (optimisée)
        copyColumnWidthsFast(sourceSheet, targetSheet);
        
        // Copie des régions fusionnées (seulement si nécessaire)
        if (sourceSheet.getNumMergedRegions() > 0 && sourceSheet.getNumMergedRegions() < 1000) {
            copyMergedRegions(sourceSheet, targetSheet);
        }
    }

    // Ancienne méthode conservée pour compatibilité
    private void copySheet(Sheet sourceSheet, XSSFSheet targetSheet, XSSFWorkbook targetWorkbook) {
        copySheetOptimized(sourceSheet, targetSheet, targetWorkbook);
    }

    // Version optimisée - évite les conversions inutiles
    private void copyCellValueFast(Cell sourceCell, Cell targetCell) {
        CellType cellType = sourceCell.getCellType();
        switch (cellType) {
            case STRING -> {
                RichTextString richString = sourceCell.getRichStringCellValue();
                if (richString != null) {
                    targetCell.setCellValue(richString.getString());
                }
            }
            case NUMERIC -> {
                double numericValue = sourceCell.getNumericCellValue();
                // Vérification date simplifiée - seulement si nécessaire
                if (DateUtil.isCellDateFormatted(sourceCell)) {
                    targetCell.setCellValue(sourceCell.getDateCellValue());
                } else {
                    targetCell.setCellValue(numericValue);
                }
            }
            case BOOLEAN -> targetCell.setCellValue(sourceCell.getBooleanCellValue());
            case FORMULA -> {
                // Pour les formules, on copie la valeur calculée plutôt que la formule
                // Cela évite les recalculs coûteux
                try {
                    double numericValue = sourceCell.getNumericCellValue();
                    targetCell.setCellValue(numericValue);
                } catch (Exception e) {
                    // Si erreur, copier comme string
                    targetCell.setCellValue(sourceCell.toString());
                }
            }
            case ERROR -> targetCell.setCellErrorValue(sourceCell.getErrorCellValue());
            case BLANK -> {
                // Ne rien faire pour les cellules vides - plus rapide
            }
            default -> targetCell.setCellValue(sourceCell.toString());
        }
    }

    // Version originale conservée
    private void copyCellValue(Cell sourceCell, Cell targetCell) {
        copyCellValueFast(sourceCell, targetCell);
    }

    // Version optimisée - clone simplifié
    private CellStyle cloneCellStyleFast(CellStyle sourceStyle, Workbook targetWorkbook) {
        CellStyle targetStyle = targetWorkbook.createCellStyle();
        targetStyle.cloneStyleFrom(sourceStyle);
        return targetStyle;
    }

    // Version originale conservée
    private CellStyle cloneCellStyle(CellStyle sourceStyle, XSSFWorkbook targetWorkbook, Map<CellStyle, CellStyle> styleCache) {
        if (styleCache.containsKey(sourceStyle)) {
            return styleCache.get(sourceStyle);
        }

        XSSFCellStyle targetStyle = targetWorkbook.createCellStyle();
        targetStyle.cloneStyleFrom(sourceStyle);
        styleCache.put(sourceStyle, targetStyle);
        return targetStyle;
    }

    // Version optimisée - évite l'itération sur toutes les lignes
    private void copyColumnWidthsFast(Sheet sourceSheet, Sheet targetSheet) {
        // Utiliser getLastRowNum pour estimer le nombre max de colonnes
        int estimatedMaxColumn = 0;
        int firstRow = sourceSheet.getFirstRowNum();
        int lastRow = sourceSheet.getLastRowNum();
        
        // Échantillonner quelques lignes pour trouver le max (plus rapide)
        int sampleSize = Math.min(100, lastRow - firstRow + 1);
        int step = Math.max(1, (lastRow - firstRow) / sampleSize);
        
        for (int i = firstRow; i <= lastRow; i += step) {
            Row row = sourceSheet.getRow(i);
            if (row != null && row.getLastCellNum() > estimatedMaxColumn) {
                estimatedMaxColumn = row.getLastCellNum();
            }
        }
        
        // Copier les largeurs jusqu'au max trouvé
        for (int i = 0; i <= estimatedMaxColumn && i < 256; i++) { // Limite à 256 colonnes
            int width = sourceSheet.getColumnWidth(i);
            if (width != sourceSheet.getDefaultColumnWidth()) {
                targetSheet.setColumnWidth(i, width);
            }
            if (sourceSheet.isColumnHidden(i)) {
                targetSheet.setColumnHidden(i, true);
            }
        }
    }

    // Version originale conservée
    private void copyColumnWidths(Sheet sourceSheet, XSSFSheet targetSheet) {
        copyColumnWidthsFast(sourceSheet, targetSheet);
    }

    private void copyMergedRegions(Sheet sourceSheet, Sheet targetSheet) {
        int numMerged = sourceSheet.getNumMergedRegions();
        for (int i = 0; i < numMerged; i++) {
            CellRangeAddress mergedRegion = sourceSheet.getMergedRegion(i);
            targetSheet.addMergedRegion(mergedRegion);
        }
    }
}

