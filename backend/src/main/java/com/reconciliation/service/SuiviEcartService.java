package com.reconciliation.service;

import com.reconciliation.entity.SuiviEcartEntity;
import com.reconciliation.model.SuiviEcart;
import com.reconciliation.repository.SuiviEcartRepository;
import com.reconciliation.util.RequestContextUtil;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
public class SuiviEcartService {
    
    @Autowired
    private SuiviEcartRepository suiviEcartRepository;
    
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    
    // Classe pour stocker les résultats de l'upload
    public static class UploadResult {
        private final List<SuiviEcart> savedItems;
        private final int duplicatesCount;
        private final int totalCount;
        private final int savedCount;
        
        public UploadResult(List<SuiviEcart> savedItems, int duplicatesCount, int totalCount) {
            this.savedItems = savedItems;
            this.duplicatesCount = duplicatesCount;
            this.totalCount = totalCount;
            this.savedCount = savedItems.size();
        }
        
        public List<SuiviEcart> getSavedItems() {
            return savedItems;
        }
        
        public int getDuplicatesCount() {
            return duplicatesCount;
        }
        
        public int getTotalCount() {
            return totalCount;
        }
        
        public int getSavedCount() {
            return savedCount;
        }
    }
    
    public List<SuiviEcart> getAll() {
        return suiviEcartRepository.findAllOrderByDateDesc().stream()
                .map(this::convertToModel)
                .toList();
    }
    
    public Optional<SuiviEcart> getById(Long id) {
        if (id == null) {
            return Optional.empty();
        }
        return suiviEcartRepository.findById(id)
                .map(this::convertToModel);
    }
    
    @Transactional
    public SuiviEcart create(SuiviEcart suiviEcart) {
        if (suiviEcart == null) {
            throw new IllegalArgumentException("SuiviEcart ne peut pas être null");
        }
        SuiviEcartEntity entity = convertToEntity(suiviEcart);
        
        // Définir le username depuis le contexte de la requête
        String username = RequestContextUtil.getUsernameFromRequest();
        if (username != null && !username.isEmpty()) {
            entity.setUsername(username);
        }
        
        SuiviEcartEntity savedEntity = suiviEcartRepository.save(entity);
        return convertToModel(savedEntity);
    }
    
    @Transactional
    public SuiviEcart update(Long id, SuiviEcart suiviEcart) {
        if (id == null) {
            throw new RuntimeException("ID ne peut pas être null");
        }
        SuiviEcartEntity entity = suiviEcartRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("SuiviEcart non trouvé avec l'id: " + id));
        
        entity.setDate(parseDate(suiviEcart.getDate()));
        entity.setAgence(suiviEcart.getAgence());
        entity.setService(suiviEcart.getService());
        entity.setPays(suiviEcart.getPays());
        entity.setMontant(suiviEcart.getMontant());
        entity.setToken(suiviEcart.getToken());
        entity.setIdPartenaire(suiviEcart.getIdPartenaire());
        entity.setStatut(suiviEcart.getStatut());
        entity.setTraitement(suiviEcart.getTraitement());
        entity.setGlpiId(suiviEcart.getGlpiId());
        entity.setTelephone(suiviEcart.getTelephone());
        entity.setCommentaire(suiviEcart.getCommentaire());
        
        // Mettre à jour le username depuis le contexte de la requête
        String username = RequestContextUtil.getUsernameFromRequest();
        if (username != null && !username.isEmpty()) {
            entity.setUsername(username);
        }
        
        entity = suiviEcartRepository.save(entity);
        return convertToModel(entity);
    }
    
    @Transactional
    public void delete(Long id) {
        if (id != null) {
            suiviEcartRepository.deleteById(id);
        }
    }
    
    @Transactional
    public UploadResult uploadFile(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Le fichier ne peut pas être vide");
        }
        
        List<SuiviEcart> suiviEcarts = new ArrayList<>();
        String fileName = file.getOriginalFilename() != null ? file.getOriginalFilename().toLowerCase() : "";
        
        if (fileName.endsWith(".csv")) {
            suiviEcarts = parseCSVFile(file);
        } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
            suiviEcarts = parseExcelFile(file);
        } else {
            throw new IllegalArgumentException("Format de fichier non supporté. Formats acceptés: CSV, XLS, XLSX");
        }
        
        // Récupérer le username depuis le contexte de la requête
        String username = RequestContextUtil.getUsernameFromRequest();
        
        // Filtrer les doublons avant de sauvegarder
        List<SuiviEcartEntity> entitiesToSave = new ArrayList<>();
        int duplicatesCount = 0;
        int newRecordsCount = 0;
        
        for (SuiviEcart suiviEcart : suiviEcarts) {
            LocalDate date = parseDate(suiviEcart.getDate());
            String agence = suiviEcart.getAgence();
            String service = suiviEcart.getService();
            String pays = suiviEcart.getPays();
            String token = suiviEcart.getToken();
            String idPartenaire = suiviEcart.getIdPartenaire();
            
            // Vérifier si tous les champs requis sont présents
            if (date != null && agence != null && !agence.trim().isEmpty() &&
                service != null && !service.trim().isEmpty() && pays != null && !pays.trim().isEmpty() &&
                token != null && !token.trim().isEmpty() && idPartenaire != null && !idPartenaire.trim().isEmpty()) {
                
                // Vérifier si c'est un doublon
                if (suiviEcartRepository.existsByDateAndAgenceAndServiceAndPaysAndTokenAndIdPartenaire(
                        date, agence, service, pays, token, idPartenaire)) {
                    System.out.println("DEBUG: Doublon détecté - Date: " + date + ", Agence: " + agence + 
                                     ", Service: " + service + ", Pays: " + pays + ", Token: " + token + 
                                     ", IDPartenaire: " + idPartenaire);
                    duplicatesCount++;
                    continue; // Ignorer ce doublon
                }
            }
            
            // Convertir en entité et ajouter à la liste à sauvegarder
            SuiviEcartEntity entity = convertToEntity(suiviEcart);
            if (username != null && !username.isEmpty()) {
                entity.setUsername(username);
            }
            entitiesToSave.add(entity);
            newRecordsCount++;
        }
        
        System.out.println("DEBUG: Résultats de la vérification des doublons:");
        System.out.println("  - Total de lignes parsées: " + suiviEcarts.size());
        System.out.println("  - Doublons ignorés: " + duplicatesCount);
        System.out.println("  - Nouveaux enregistrements à sauvegarder: " + newRecordsCount);
        
        // Sauvegarder seulement les nouveaux enregistrements
        List<SuiviEcart> savedItems = new ArrayList<>();
        if (!entitiesToSave.isEmpty()) {
            List<SuiviEcartEntity> savedEntities = suiviEcartRepository.saveAll(entitiesToSave);
            System.out.println("DEBUG: Enregistrements sauvegardés avec succès: " + savedEntities.size());
            savedItems = savedEntities.stream()
                    .map(this::convertToModel)
                    .toList();
        }
        
        return new UploadResult(savedItems, duplicatesCount, suiviEcarts.size());
    }
    
    private List<SuiviEcart> parseCSVFile(MultipartFile file) throws IOException {
        List<SuiviEcart> suiviEcarts = new ArrayList<>();
        
        try (BufferedReader br = new BufferedReader(new InputStreamReader(file.getInputStream()))) {
            String line;
            boolean isFirstLine = true;
            
            while ((line = br.readLine()) != null) {
                if (isFirstLine) {
                    isFirstLine = false;
                    continue; // Ignorer l'en-tête
                }
                
                String[] values = line.split(";");
                if (values.length < 9) {
                    // Essayer avec la virgule comme séparateur
                    values = line.split(",");
                }
                
                if (values.length >= 9) {
                    try {
                        SuiviEcart suiviEcart = parseFromValues(values);
                        suiviEcarts.add(suiviEcart);
                    } catch (Exception e) {
                        System.err.println("Erreur lors du parsing de la ligne CSV: " + e.getMessage());
                    }
                } else {
                    System.err.println("Ligne CSV incomplète: " + line + " (attendu au moins 9 colonnes, trouvé " + values.length + ")");
                }
            }
        }
        
        return suiviEcarts;
    }
    
    private List<SuiviEcart> parseExcelFile(MultipartFile file) throws IOException {
        List<SuiviEcart> suiviEcarts = new ArrayList<>();
        
        try (Workbook workbook = createWorkbook(file)) {
            Sheet sheet = workbook.getSheetAt(0);
            
            for (int i = 1; i <= sheet.getLastRowNum(); i++) { // Commencer à 1 pour ignorer l'en-tête
                Row row = sheet.getRow(i);
                if (row != null) {
                    try {
                        SuiviEcart suiviEcart = parseFromExcelRow(row);
                        suiviEcarts.add(suiviEcart);
                    } catch (Exception e) {
                        System.err.println("Erreur lors du parsing de la ligne Excel " + (i + 1) + ": " + e.getMessage());
                    }
                }
            }
        }
        
        return suiviEcarts;
    }
    
    private Workbook createWorkbook(MultipartFile file) throws IOException {
        if (file == null) {
            throw new IllegalArgumentException("Le fichier ne peut pas être null");
        }
        String fileName = file.getOriginalFilename() != null ? file.getOriginalFilename().toLowerCase() : "";
        if (fileName.endsWith(".xlsx")) {
            return new XSSFWorkbook(file.getInputStream());
        } else if (fileName.endsWith(".xls")) {
            return new HSSFWorkbook(file.getInputStream());
        } else {
            throw new IllegalArgumentException("Format Excel non supporté: " + fileName);
        }
    }
    
    private SuiviEcart parseFromValues(String[] values) {
        SuiviEcart suiviEcart = new SuiviEcart();
        suiviEcart.setDate(cleanValue(values[0]));
        suiviEcart.setAgence(cleanValue(values[1]));
        suiviEcart.setService(cleanValue(values[2]));
        suiviEcart.setPays(cleanValue(values[3]));
        suiviEcart.setMontant(parseDouble(cleanValue(values[4])));
        suiviEcart.setToken(cleanValue(values[5]));
        suiviEcart.setIdPartenaire(cleanValue(values[6]));
        suiviEcart.setStatut(cleanValue(values[7]));
        suiviEcart.setTraitement(values.length > 8 ? cleanValue(values[8]) : "");
        suiviEcart.setTelephone(values.length > 9 ? cleanValue(values[9]) : "");
        suiviEcart.setCommentaire(values.length > 10 ? cleanValue(values[10]) : "");
        return suiviEcart;
    }
    
    private SuiviEcart parseFromExcelRow(Row row) {
        SuiviEcart suiviEcart = new SuiviEcart();
        
        suiviEcart.setDate(getCellValueAsString(row.getCell(0)));
        suiviEcart.setAgence(getCellValueAsString(row.getCell(1)));
        suiviEcart.setService(getCellValueAsString(row.getCell(2)));
        suiviEcart.setPays(getCellValueAsString(row.getCell(3)));
        suiviEcart.setMontant(getCellValueAsDouble(row.getCell(4)));
        suiviEcart.setToken(getCellValueAsString(row.getCell(5)));
        suiviEcart.setIdPartenaire(getCellValueAsString(row.getCell(6)));
        suiviEcart.setStatut(getCellValueAsString(row.getCell(7)));
        suiviEcart.setTraitement(row.getCell(8) != null ? getCellValueAsString(row.getCell(8)) : "");
        suiviEcart.setTelephone(row.getCell(9) != null ? getCellValueAsString(row.getCell(9)) : "");
        suiviEcart.setCommentaire(row.getCell(10) != null ? getCellValueAsString(row.getCell(10)) : "");
        
        return suiviEcart;
    }
    
    private String getCellValueAsString(Cell cell) {
        if (cell == null) return "";
        
        switch (cell.getCellType()) {
            case STRING:
                return cell.getStringCellValue().trim();
            case NUMERIC:
                if (DateUtil.isCellDateFormatted(cell)) {
                    return cell.getDateCellValue().toInstant()
                            .atZone(java.time.ZoneId.systemDefault())
                            .toLocalDate()
                            .format(DATE_FORMATTER);
                } else {
                    return String.valueOf((long) cell.getNumericCellValue());
                }
            case BOOLEAN:
                return String.valueOf(cell.getBooleanCellValue());
            case FORMULA:
                return cell.getCellFormula();
            default:
                return "";
        }
    }
    
    private Double getCellValueAsDouble(Cell cell) {
        if (cell == null) return 0.0;
        
        switch (cell.getCellType()) {
            case NUMERIC:
                return cell.getNumericCellValue();
            case STRING:
                String value = cell.getStringCellValue().trim().replace(",", ".");
                try {
                    return Double.parseDouble(value);
                } catch (NumberFormatException e) {
                    return 0.0;
                }
            default:
                return 0.0;
        }
    }
    
    private String cleanValue(String value) {
        return value != null ? value.trim() : "";
    }
    
    private Double parseDouble(String value) {
        try {
            return Double.parseDouble(value.replace(",", "."));
        } catch (NumberFormatException e) {
            return 0.0;
        }
    }
    
    private LocalDate parseDate(String dateStr) {
        if (dateStr == null || dateStr.trim().isEmpty()) {
            return LocalDate.now();
        }
        
        try {
            // Essayer différents formats
            if (dateStr.contains("-")) {
                return LocalDate.parse(dateStr.trim(), DATE_FORMATTER);
            } else if (dateStr.contains("/")) {
                DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy");
                return LocalDate.parse(dateStr.trim(), formatter);
            } else {
                return LocalDate.parse(dateStr.trim(), DATE_FORMATTER);
            }
        } catch (Exception e) {
            System.err.println("Erreur de parsing de date: " + dateStr + " - " + e.getMessage());
            return LocalDate.now();
        }
    }
    
    private SuiviEcartEntity convertToEntity(SuiviEcart model) {
        SuiviEcartEntity entity = new SuiviEcartEntity();
        if (model.getId() != null) {
            entity.setId(model.getId());
        }
        entity.setDate(parseDate(model.getDate()));
        entity.setAgence(model.getAgence());
        entity.setService(model.getService());
        entity.setPays(model.getPays());
        entity.setMontant(model.getMontant());
        entity.setToken(model.getToken());
        entity.setIdPartenaire(model.getIdPartenaire());
        entity.setStatut(model.getStatut());
        entity.setTraitement(model.getTraitement());
        entity.setUsername(model.getUsername());
        entity.setGlpiId(model.getGlpiId());
        entity.setTelephone(model.getTelephone());
        entity.setCommentaire(model.getCommentaire());
        return entity;
    }
    
    private SuiviEcart convertToModel(SuiviEcartEntity entity) {
        SuiviEcart model = new SuiviEcart();
        model.setId(entity.getId());
        model.setDate(entity.getDate() != null ? entity.getDate().format(DATE_FORMATTER) : "");
        model.setAgence(entity.getAgence());
        model.setService(entity.getService());
        model.setPays(entity.getPays());
        model.setMontant(entity.getMontant());
        model.setToken(entity.getToken());
        model.setIdPartenaire(entity.getIdPartenaire());
        model.setStatut(entity.getStatut());
        model.setTraitement(entity.getTraitement());
        model.setUsername(entity.getUsername());
        model.setGlpiId(entity.getGlpiId());
        model.setTelephone(entity.getTelephone());
        model.setCommentaire(entity.getCommentaire());
        return model;
    }
}

