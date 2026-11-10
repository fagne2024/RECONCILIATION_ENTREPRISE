package com.reconciliation.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import lombok.extern.slf4j.Slf4j;

import com.reconciliation.service.EntrepriseWatchFolderService;
import com.reconciliation.service.CalculationRuleService;

import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import java.util.stream.Collectors;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@RestController
@RequestMapping("/api/file-watcher")
@CrossOrigin(origins = {"http://localhost:4200", "http://localhost:3000", "http://172.214.108.8:4200"}, allowCredentials = "true")
public class FileWatcherController {

    /** Extensions de fichiers modeles acceptees (CSV / Excel). */
    private static final Set<String> ALLOWED_MODEL_EXTENSIONS = Set.of(
        ".csv", ".xls", ".xlsx", ".xlsm", ".xlsb", ".xlt", ".xltx", ".xltm");

    // OPTIMISATION: cache des métadonnées de chaque fichier (colonnes, échantillon,
    // nombre de lignes) invalidé par lastModified/length. Évite de relire chaque
    // fichier (lecture CSV entière + POI) à chaque appel à /available-files.
    private static final ConcurrentHashMap<String, Map<String, Object>> FILE_METADATA_CACHE = new ConcurrentHashMap<>();

    private final EntrepriseWatchFolderService entrepriseWatchFolderService;
    private final CalculationRuleService calculationRuleService;

    public FileWatcherController(EntrepriseWatchFolderService entrepriseWatchFolderService,
                                 CalculationRuleService calculationRuleService) {
        this.entrepriseWatchFolderService = entrepriseWatchFolderService;
        this.calculationRuleService = calculationRuleService;
    }

    /**
     * Vrai si le nom du fichier correspond au type attendu.
     * Mots-clés pilotés par les règles de calcul (Configuration > Calcul),
     * repli sur la valeur codée en dur si aucune règle active n'est configurée.
     */
    private boolean fileNameMatches(String fileName, String ruleCode, List<String> fallback) {
        return calculationRuleService.matchesAny(fileName, ruleCode, fallback);
    }

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getStatus() {
        try {
            Path watchPath = entrepriseWatchFolderService.currentFolder();
            boolean isWatching = Files.exists(watchPath);
            
            int queueLength = 0;
            if (isWatching) {
                File[] files = watchPath.toFile().listFiles((dir, name) ->
                    isAllowedModelFile(name)
                );
                queueLength = files != null ? files.length : 0;
                // Nombre de fichiers trouvés
            }
            
            Map<String, Object> response = Map.of(
                "watchPath", watchPath.toString(),
                "entrepriseFolder", watchPath.getFileName().toString(),
                "isProcessing", false,
                "queueLength", queueLength
            );
            
            // Réponse status générée
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Erreur dans getStatus(): {}", e.getMessage(), e);
            return ResponseEntity.badRequest().body(Map.of(
                "error", e.getMessage()
            ));
        }
    }

    @GetMapping("/available-files")
    public ResponseEntity<List<Map<String, Object>>> getAvailableFiles() {
        try {
            List<Map<String, Object>> files = new ArrayList<>();
            Path watchPath = entrepriseWatchFolderService.currentFolder();
            
            if (Files.exists(watchPath)) {
                File[] fileList = watchPath.toFile().listFiles((dir, name) ->
                    isAllowedModelFile(name)
                );
                
                if (fileList != null) {
                    for (File file : fileList) {
                        // Métadonnées mises en cache (helper) : évite de relire le fichier
                        files.add(getCachedFileMetadata(file));
                    }
                }
            } else {
                log.warn("Le dossier watch-folder de l'entreprise n'existe pas: {}", watchPath.toAbsolutePath());
            }
            
            log.info("Nombre de fichiers retournés (dossier {}): {}",
                watchPath.getFileName(), files.size());
            return ResponseEntity.ok(files);
        } catch (Exception e) {
            log.error("Erreur dans getAvailableFiles(): {}", e.getMessage(), e);
            return ResponseEntity.ok(List.of());
        }
    }

    /**
     * Enregistre un fichier modele (CSV / Excel) dans le dossier watch-folder de
     * l'entreprise courante. Le fichier est ensuite visible via
     * {@code /available-files} et selectionnable comme fichier modele.
     */
    @PostMapping(value = "/upload", consumes = "multipart/form-data")
    public ResponseEntity<Map<String, Object>> uploadModelFile(@RequestParam("file") MultipartFile file) {
        try {
            if (file == null || file.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "error", "Aucun fichier fourni."
                ));
            }

            String safeName = sanitizeFileName(file.getOriginalFilename());
            if (safeName == null) {
                return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "error", "Nom de fichier invalide."
                ));
            }
            if (!isAllowedModelFile(safeName)) {
                return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "error", "Format non pris en charge. Formats acceptés : CSV, XLS, XLSX."
                ));
            }

            Path folder = entrepriseWatchFolderService.currentFolder();
            Path destination = folder.resolve(safeName).normalize();
            // Garde-fou anti-traversée de chemin.
            if (!destination.startsWith(folder)) {
                return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "error", "Chemin de fichier invalide."
                ));
            }

            try (InputStream in = file.getInputStream()) {
                Files.copy(in, destination, StandardCopyOption.REPLACE_EXISTING);
            }

            Map<String, Object> metadata = new java.util.HashMap<>(getCachedFileMetadata(destination.toFile()));
            metadata.put("success", true);
            metadata.put("entrepriseFolder", folder.getFileName().toString());
            metadata.put("message", "Fichier modèle enregistré dans le dossier de l'entreprise.");

            log.info("Fichier modèle '{}' enregistré dans le dossier entreprise '{}'",
                safeName, folder.getFileName());
            return ResponseEntity.ok(metadata);
        } catch (Exception e) {
            log.error("Erreur dans uploadModelFile(): {}", e.getMessage(), e);
            return ResponseEntity.badRequest().body(Map.of(
                "success", false,
                "error", e.getMessage() != null ? e.getMessage() : "Erreur lors de l'enregistrement du fichier."
            ));
        }
    }

    @PostMapping("/analyze-file")
    public ResponseEntity<Map<String, Object>> analyzeFile(@RequestBody Map<String, String> request) {
        try {
            String filePath = request.get("filePath");
            if (filePath == null || filePath.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Chemin de fichier manquant."));
            }

            // Le fichier est toujours résolu dans le dossier watch-folder de
            // l'entreprise courante : on n'accepte que le nom de fichier.
            String fileName = Paths.get(filePath.replace("\\", "/")).getFileName().toString();
            Path folder = entrepriseWatchFolderService.currentFolder();
            Path fullPath = folder.resolve(fileName).normalize();

            // Garde-fou anti-traversée de chemin.
            if (!fullPath.startsWith(folder)) {
                return ResponseEntity.badRequest().body(Map.of(
                    "error", "Chemin de fichier invalide."
                ));
            }

            File file = fullPath.toFile();
            if (!file.exists()) {
                log.warn("Fichier non trouvé: {}", fullPath.toAbsolutePath());
                return ResponseEntity.badRequest().body(Map.of(
                    "error", "Fichier non trouvé: " + fileName
                ));
            }

            // Analyser les colonnes et données d'exemple (via le cache de métadonnées)
            return ResponseEntity.ok(getCachedFileMetadata(file));
        } catch (Exception e) {
            log.error("Erreur lors de l'analyse du fichier: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().body(Map.of(
                "error", e.getMessage()
            ));
        }
    }

    @PostMapping("/start")
    public ResponseEntity<Map<String, Object>> startWatching() {
        try {
            Path watchPath = entrepriseWatchFolderService.currentFolder();
            if (!Files.exists(watchPath)) {
                Files.createDirectories(watchPath);
            }
            
            Path processedPath = watchPath.resolve("processed");
            if (!Files.exists(processedPath)) {
                Files.createDirectories(processedPath);
            }
            
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Surveillance démarrée"
            ));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of(
                "success", false,
                "error", e.getMessage()
            ));
        }
    }

    // ===== Méthodes utilitaires =====

    /** Vrai si le nom de fichier possede une extension de modele (CSV / Excel) supportee. */
    private static boolean isAllowedModelFile(String fileName) {
        if (fileName == null) {
            return false;
        }
        String lower = fileName.toLowerCase(Locale.ROOT);
        for (String extension : ALLOWED_MODEL_EXTENSIONS) {
            if (lower.endsWith(extension)) {
                return true;
            }
        }
        return false;
    }

    /** Nettoie le nom de fichier (retire les chemins) et refuse les noms vides. */
    private static String sanitizeFileName(String originalFileName) {
        if (originalFileName == null) {
            return null;
        }
        String name = Paths.get(originalFileName.replace("\\", "/")).getFileName().toString().trim();
        // Neutralise les caractères problématiques sans changer l'extension.
        name = name.replaceAll("[\\r\\n\\t\\u0000]", "_");
        if (name.isEmpty() || name.equals(".") || name.equals("..")) {
            return null;
        }
        return name;
    }

    @PostMapping("/stop")
    public ResponseEntity<Map<String, Object>> stopWatching() {
        try {
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Surveillance arrêtée"
            ));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of(
                "success", false,
                "error", e.getMessage()
            ));
        }
    }

    // Méthodes utilitaires améliorées
    /**
     * Récupère (avec cache) les métadonnées d'un fichier : colonnes, données d'exemple,
     * type et nombre d'enregistrements. Le cache est invalidé par lastModified/length.
     */
    private Map<String, Object> getCachedFileMetadata(File file) {
        String cacheKey = file.getAbsolutePath() + "|" + file.lastModified() + "|" + file.length();
        Map<String, Object> cached = FILE_METADATA_CACHE.get(cacheKey);
        if (cached != null) {
            return cached;
        }

        List<String> columns = getFileColumns(file);
        List<Map<String, Object>> sampleData = getSampleData(file);

        Map<String, Object> fileInfo = Map.of(
            "fileName", file.getName(),
            "filePath", file.getAbsolutePath(),
            "columns", columns,
            "sampleData", sampleData,
            "fileType", getFileType(file.getName()),
            "recordCount", getRecordCount(file)
        );

        // Garder la taille du cache bornée : on repart de zéro si trop d'entrées.
        if (FILE_METADATA_CACHE.size() > 400) {
            FILE_METADATA_CACHE.clear();
        }
        FILE_METADATA_CACHE.put(cacheKey, fileInfo);
        return fileInfo;
    }

    private List<String> getFileColumns(File file) {
        try {
            List<String> columns;
            if (file.getName().toLowerCase().endsWith(".csv")) {
                columns = readCsvColumns(file);
            } else {
                columns = readExcelColumns(file);
            }
            return columns;
        } catch (Exception e) {
            log.error("Erreur dans getFileColumns() pour {}: {}", file.getName(), e.getMessage(), e);
            return List.of("date", "montant", "description", "reference");
        }
    }

    private List<Map<String, Object>> getSampleData(File file) {
        try {
            if (file.getName().toLowerCase().endsWith(".csv")) {
                return readCsvSampleData(file);
            } else if (file.getName().toLowerCase().endsWith(".xls") || 
                       file.getName().toLowerCase().endsWith(".xlsx") ||
                       file.getName().toLowerCase().endsWith(".xlsm") ||
                       file.getName().toLowerCase().endsWith(".xlsb") ||
                       file.getName().toLowerCase().endsWith(".xlt") ||
                       file.getName().toLowerCase().endsWith(".xltx") ||
                       file.getName().toLowerCase().endsWith(".xltm")) {
                return readExcelSampleData(file);
            } else {
                // Pour les autres types de fichiers, retourner des données d'exemple
                return List.of(
                    Map.of("date", "2025-08-01", "montant", "1000.00", "description", "Transaction 1", "reference", "REF001"),
                    Map.of("date", "2025-08-02", "montant", "2000.00", "description", "Transaction 2", "reference", "REF002")
                );
            }
        } catch (Exception e) {
            log.error("Erreur dans getSampleData() pour {}: {}", file.getName(), e.getMessage(), e);
            return List.of(
                Map.of("date", "2025-08-01", "montant", "1000.00", "description", "Transaction 1", "reference", "REF001"),
                Map.of("date", "2025-08-02", "montant", "2000.00", "description", "Transaction 2", "reference", "REF002")
            );
        }
    }

    private List<String> readCsvColumns(File file) throws IOException {
        List<String> columns = new ArrayList<>();
        try (BufferedReader reader = openCsvReader(file)) {
            String firstLine = reader.readLine();
            if (firstLine != null && !firstLine.trim().isEmpty()) {
                String delimiter = detectCsvDelimiter(firstLine);
                for (String column : parseCsvLine(firstLine, delimiter)) {
                    String normalizedColumn = normalizeColumnName(column);
                    if (!normalizedColumn.isEmpty()) {
                        columns.add(normalizedColumn);
                    }
                }
            }
        }
        return columns;
    }

    /**
     * Encodage réel d'un fichier CSV : UTF-8 si le début du fichier est de l'UTF-8 valide,
     * sinon Windows-1252 (exports Excel français). Le décodeur UTF-8 de Java remplace les
     * octets invalides par « U+FFFD » sans erreur : sans ce contrôle strict, un fichier
     * Latin-1 donnait des colonnes « T?l?phone client ».
     */
    static Charset detectCsvCharset(File file) throws IOException {
        final int sampleSize = 64 * 1024;
        byte[] head;
        try (InputStream in = new FileInputStream(file)) {
            head = in.readNBytes(sampleSize);
        }
        int end = head.length;
        if (end == sampleSize) {
            // Ne pas couper un caractère multi-octets en fin d'échantillon.
            int i = end - 1;
            while (i > 0 && head[i] != '\n') {
                i--;
            }
            if (i > 0) {
                end = i;
            }
        }
        try {
            StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(head, 0, end));
            return StandardCharsets.UTF_8;
        } catch (CharacterCodingException e) {
            return Charset.forName("windows-1252");
        }
    }

    /** Lecteur CSV dans l'encodage détecté, BOM UTF-8 retiré. */
    private static BufferedReader openCsvReader(File file) throws IOException {
        Charset charset = detectCsvCharset(file);
        BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(file), charset));
        if (StandardCharsets.UTF_8.equals(charset)) {
            reader.mark(1);
            if (reader.read() != 0xFEFF) {
                reader.reset();
            }
        }
        return reader;
    }
    
    /**
     * Détecte le délimiteur CSV de manière robuste
     */
    private String detectCsvDelimiter(String line) {
        if (line == null || line.trim().isEmpty()) {
            return ";"; // Délimiteur par défaut
        }
        
        // Délimiteurs possibles
        String[] delimiters = {";", ",", "\t", "|"};
        int[] scores = new int[delimiters.length];
        
        // Analyser la ligne pour chaque délimiteur
        for (int i = 0; i < delimiters.length; i++) {
            String delimiter = delimiters[i];
            // Compter les occurrences
            int count = line.length() - line.replace(delimiter, "").length();
            scores[i] = count;
            
            // Bonus si le délimiteur est dans des champs entre guillemets (CSV bien formaté)
            String quotedPattern = "\"[^\"]*\"\\" + delimiter;
            int quotedMatches = line.split(quotedPattern).length - 1;
            scores[i] += quotedMatches * 2;
        }
        
        // Trouver le délimiteur avec le meilleur score
        int bestIndex = 0;
        int bestScore = scores[0];
        for (int i = 1; i < scores.length; i++) {
            if (scores[i] > bestScore) {
                bestScore = scores[i];
                bestIndex = i;
            }
        }
        
        return delimiters[bestIndex];
    }
    
    /**
     * Parse une ligne CSV en gérant les guillemets
     */
    private String[] parseCsvLine(String line, String delimiter) {
        if (line == null || line.trim().isEmpty()) {
            return new String[0];
        }
        
        List<String> fields = new ArrayList<>();
        boolean inQuotes = false;
        StringBuilder currentField = new StringBuilder();
        
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            
            if (c == '"') {
                if (inQuotes && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    // Guillemet échappé
                    currentField.append('"');
                    i++; // Passer le guillemet suivant
                } else {
                    // Toggle du mode guillemets
                    inQuotes = !inQuotes;
                }
            } else if (c == delimiter.charAt(0) && !inQuotes) {
                // Fin du champ
                fields.add(currentField.toString());
                currentField = new StringBuilder();
            } else {
                currentField.append(c);
            }
        }
        
        // Ajouter le dernier champ
        fields.add(currentField.toString());
        
        return fields.toArray(new String[0]);
    }
    
    /**
     * Normalise un nom de colonne
     */
    private String normalizeColumnName(String column) {
        if (column == null) {
            return "";
        }
        
        // Nettoyer les espaces
        String normalized = column.trim();
        
        // Supprimer les guillemets
        if ((normalized.startsWith("\"") && normalized.endsWith("\"")) ||
            (normalized.startsWith("'") && normalized.endsWith("'"))) {
            normalized = normalized.substring(1, normalized.length() - 1);
        }
        
        // Nettoyer les caractères invisibles (BOM, etc.)
        normalized = normalized.replace("\uFEFF", "").replace("\u200B", "").replace("\u200C", "").replace("\u200D", "");
        
        // Remplacer les espaces multiples par un seul
        normalized = normalized.replaceAll("\\s+", " ");
        
        return normalized.trim();
    }

    /**
     * Méthode pour corriger les caractères spéciaux corrompus
     * 
     * Cette méthode gère :
     * - ENCODAGE : Correction des caractères mal encodés dans les en-têtes
     * - NORMALISATION : Mapping vers des caractères corrects
     * - TYPAGE : Standardisation du format des caractères
     * 
     * @param text Le texte à corriger
     * @return Le texte corrigé et normalisé
     */


    private List<Map<String, Object>> readCsvSampleData(File file) throws IOException {
        List<Map<String, Object>> sampleData = new ArrayList<>();
        List<String> columns = readCsvColumns(file);
        if (columns.isEmpty()) {
            return sampleData;
        }
        try (BufferedReader reader = openCsvReader(file)) {
            String headerLine = reader.readLine();
            if (headerLine == null) {
                return sampleData;
            }
            String delimiter = headerLine.contains(";") ? ";" : ",";
            // Premières lignes (max 5) pour les données d'exemple
            int lineCount = 0;
            String line;
            while ((line = reader.readLine()) != null && lineCount < 5) {
                if (!line.trim().isEmpty()) {
                    String[] values = line.split(delimiter);
                    Map<String, Object> row = new java.util.HashMap<>();
                    for (int i = 0; i < columns.size() && i < values.length; i++) {
                        row.put(columns.get(i), values[i].trim());
                    }
                    sampleData.add(row);
                    lineCount++;
                }
            }
        }
        return sampleData;
    }

    private String getFileType(String fileName) {
        String lowerName = fileName.toLowerCase();
        if (lowerName.endsWith(".csv")) return "csv";
        if (lowerName.endsWith(".xlsx") || 
            lowerName.endsWith(".xls") ||
            lowerName.endsWith(".xlsm") ||
            lowerName.endsWith(".xlsb") ||
            lowerName.endsWith(".xlt") ||
            lowerName.endsWith(".xltx") ||
            lowerName.endsWith(".xltm")) return "excel";
        return "unknown";
    }

    /**
     * Crée un Workbook Apache POI en détectant automatiquement le format du fichier Excel.
     * Cette méthode gère les cas où des fichiers .xls sont en fait au format .xlsx.
     */
    private Workbook createWorkbook(File file) throws IOException {
        try (FileInputStream fis = new FileInputStream(file)) {
            // D'abord, essayer de détecter le format réel du fichier
            try {
                // Essayer d'abord le format XLSX (Office 2007+)
                return new XSSFWorkbook(fis);
            } catch (Exception e) {
                // Si ça échoue, essayer le format HSSF (ancien format Excel)
                try (FileInputStream fis2 = new FileInputStream(file)) {
                    return new HSSFWorkbook(fis2);
                } catch (Exception e2) {
                    // Si les deux échouent, relancer l'exception originale
                    throw new IOException("Impossible de lire le fichier Excel: " + file.getName() + 
                        ". Format non supporté ou fichier corrompu.", e);
                }
            }
        }
    }

    private int getRecordCount(File file) {
        try {
            if (file.getName().toLowerCase().endsWith(".csv")) {
                return countCsvLines(file);
            } else {
                return 100; // Valeur par défaut pour les autres types
            }
        } catch (Exception e) {
            log.warn("Erreur lors du comptage des lignes: {}", e.getMessage());
            return 100;
        }
    }

    private int countCsvLines(File file) throws IOException {
        int lineCount = 0;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(file), "UTF-8"))) {
            while (reader.readLine() != null) {
                lineCount++;
            }
        }
        // Soustraire 1 pour l'en-tête
        return Math.max(0, lineCount - 1);
    }

    // Méthode pour lire les colonnes Excel avec détection intelligente des en-têtes et types
    private List<String> readExcelColumns(File file) throws IOException {
        // Lecture des colonnes Excel
        
        try {
            // Utiliser Apache POI pour lire les fichiers Excel avec détection automatique du format
            Workbook workbook = createWorkbook(file);
            
            Sheet sheet = workbook.getSheetAt(0);
            // Feuille Excel analysée
            
            // Analyser les premières lignes pour voir la structure
            // Analyse de la structure du fichier
            
            List<String> headers = new ArrayList<>();
            
            // Analyser les premières 200 lignes pour trouver les en-têtes avec détection avancée
            int maxRowsToCheck = Math.min(200, sheet.getLastRowNum());
            // Analyse avancée des lignes
            
            int bestHeaderRowIndex = 0;
            int bestScore = 0;
            List<String> bestHeaders = new ArrayList<>();
            
            for (int i = 0; i <= maxRowsToCheck; i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;
                
                List<String> rowData = readAllColumnsFromRow(row, sheet);
                
                // Analyser la qualité de cette ligne comme en-tête
                int score = analyzeHeaderRowQuality(rowData, i);
                // Analyse de la ligne
                
                if (score > bestScore) {
                    bestScore = score;
                    bestHeaderRowIndex = i;
                    bestHeaders = new ArrayList<>(rowData);
                    // Nouveau meilleur en-tête trouvé
                }
                
                // Vérifier si cette ligne contient les en-têtes Orange Money
                if (isOrangeMoneyHeaderRow(rowData)) {
                    headers = rowData;
                    // En-têtes Orange Money détectés
                    break;
                }
                
                // Vérifier si cette ligne contient les en-têtes OPPART
                if (isOPPARTHeaderRow(rowData)) {
                    headers = rowData;
                    // En-têtes OPPART détectés
                    break;
                }
            }
            
            // Si aucun en-tête Orange Money n'est trouvé, utiliser le meilleur en-tête détecté
            if (headers.isEmpty() && bestScore > 0) {
                headers = bestHeaders;
                // Meilleur en-tête détecté
            }
            
            // Détection spécifique pour les fichiers OPPART
            if (headers.isEmpty() && fileNameMatches(file.getName(), "MODELES.TOKENS_OPPART",
                    CalculationRuleService.DEFAULT_TOKENS_OPPART)) {
                // Détection spécifique OPPART
                headers = getOPPARTDefaultHeaders();
            }
            
            workbook.close();
            
            if (headers.isEmpty()) {
                log.warn("Fallback sur colonnes par défaut pour {}", file.getName());
                // Fallback : utiliser la première ligne non vide
                for (int i = 0; i <= sheet.getLastRowNum(); i++) {
                    Row row = sheet.getRow(i);
                    if (row != null) {
                        List<String> rowData = readAllColumnsFromRow(row, sheet);
                        
                        if (rowData.stream().anyMatch(s -> !s.isEmpty())) {
                            headers = rowData;
                            // En-têtes de fallback trouvés
                            break;
                        }
                    }
                }
            }
            
            // Nettoyer et corriger les en-têtes
            
            
            // Colonnes finales nettoyées
            return headers;
        } catch (Exception e) {
            log.error("Erreur lors de la lecture Excel pour {}: {}", file.getName(), e.getMessage(), e);
            log.warn("Fallback sur colonnes par défaut pour {}", file.getName());
            return List.of("date", "montant", "description", "reference");
        }
    }

    // Méthode utilitaire pour lire toutes les colonnes d'une ligne Excel
    private List<String> readAllColumnsFromRow(Row row, Sheet sheet) {
        List<String> rowData = new ArrayList<>();
        if (row == null) return rowData;
        
        // Début de lecture de la ligne
        
        // Déterminer le nombre maximum de colonnes à lire
        int maxColumns = 0;
        
        // Vérifier la première ligne pour avoir une référence
        Row firstRow = sheet.getRow(0);
        if (firstRow != null) {
            int firstRowColumns = firstRow.getLastCellNum();
            maxColumns = Math.max(maxColumns, firstRowColumns);
            // Première ligne analysée
        }
        
        // Vérifier la ligne actuelle
        int currentRowColumns = row.getLastCellNum();
        maxColumns = Math.max(maxColumns, currentRowColumns);
        // Ligne actuelle analysée
        
        // Vérifier quelques autres lignes pour s'assurer de ne rien manquer
        for (int i = 1; i < Math.min(10, sheet.getLastRowNum()); i++) {
            Row checkRow = sheet.getRow(i);
            if (checkRow != null) {
                int checkRowColumns = checkRow.getLastCellNum();
                maxColumns = Math.max(maxColumns, checkRowColumns);
                // Ligne analysée
            }
        }
        
        // Minimum 20 colonnes pour s'assurer de ne rien manquer
        maxColumns = Math.max(maxColumns, 20);
        // Nombre final de colonnes déterminé
        
        // Lire toutes les colonnes
        for (int j = 0; j < maxColumns; j++) {
            Cell cell = row.getCell(j);
            String cellValue = (cell != null) ? cell.toString().trim() : "";
            rowData.add(cellValue);
        }
        
        // Ligne lue avec succès
        return rowData;
    }

    // Méthode pour analyser la qualité d'une ligne comme en-tête
    private int analyzeHeaderRowQuality(List<String> rowData, int rowIndex) {
        if (rowData.isEmpty()) return 0;
        
        int score = 0;
        int nonEmptyColumns = 0;
        boolean hasNumberColumn = false;
        boolean hasDateColumn = false;
        boolean hasAmountColumn = false;
        int keywordMatches = 0;
        
        // Mots-clés pour identifier les en-têtes
        List<String> headerKeywords = List.of(
            "N°", "Date", "Heure", "Référence", "Service", "Paiement", 
            "Statut", "Mode", "Compte", "Wallet", "Pseudo", "Débit", 
            "Crédit", "Montant", "Commissions", "Opération", "Agent", 
            "Correspondant", "Sous-réseau", "Transaction", "Description",
            "Prix", "Coût", "Tarif", "Somme", "Total", "Reste", "Balance",
            "Solde", "Commission", "Frais", "Code", "ID", "Numéro"
        );
        
        for (String cell : rowData) {
            if (cell.isEmpty()) continue;
            
            nonEmptyColumns++;
            
            // Vérifier si c'est une colonne "N°"
            if (cell.startsWith("N°") || cell.equals("N") || cell.contains("N°")) {
                hasNumberColumn = true;
                score += 25;
            }
            
            // Vérifier les mots-clés d'en-tête
            for (String keyword : headerKeywords) {
                if (cell.toLowerCase().contains(keyword.toLowerCase())) {
                    score += 8;
                    keywordMatches++;
                    
                    // Bonus pour les types spécifiques
                    if (keyword.equals("Date") || keyword.equals("Heure")) {
                        hasDateColumn = true;
                    }
                    if (keyword.equals("Montant") || keyword.equals("Prix") || keyword.equals("Coût")) {
                        hasAmountColumn = true;
                    }
                }
            }
            
            // Bonus pour les colonnes qui ressemblent à des en-têtes
            if (cell.length() > 0 && cell.length() < 50 && 
                (cell.contains(" ") || cell.contains("(") || cell.contains(")") || 
                 cell.contains(":") || cell.contains("-") || cell.contains("_"))) {
                score += 3;
            }
            
            // Bonus pour les colonnes avec des caractères spéciaux (typiques des en-têtes)
            if (cell.contains("é") || cell.contains("è") || cell.contains("à") || 
                cell.contains("ç") || cell.contains("ù") || cell.contains("ô")) {
                score += 4;
            }
        }
        
        // Bonus pour avoir une colonne "N°" et plusieurs colonnes non vides
        if (hasNumberColumn && nonEmptyColumns >= 3) {
            score += 30;
        }
        
        // Bonus pour avoir des mots-clés d'en-tête
        if (keywordMatches >= 3) {
            score += 20;
        }
        
        // Bonus pour avoir des types de colonnes spécifiques
        if (hasDateColumn) score += 10;
        if (hasAmountColumn) score += 10;
        
        // Score de base pour les lignes avec plusieurs colonnes non vides
        if (nonEmptyColumns >= 3) {
            score += 8;
        }
        
        // Pénalité pour les lignes avec peu de colonnes non vides
        if (nonEmptyColumns < 2) {
            score -= 5;
        }
        
        return score;
    }

    /**
     * Méthode pour nettoyer et corriger les en-têtes
     * 
     * Cette méthode gère :
     * - ENCODAGE : Nettoyage des caractères spéciaux dans les en-têtes
     * - NORMALISATION : Corrections spécifiques pour les fichiers Excel
     * - TYPAGE : Standardisation du format des en-têtes
     * 
     * @param headers La liste des en-têtes à nettoyer et corriger
     * @return La liste des en-têtes nettoyés et corrigés
     */

    
    // Méthode pour détecter si une ligne contient les en-têtes Orange Money
    private boolean isOrangeMoneyHeaderRow(List<String> rowData) {
        List<String> orangeMoneyHeaders = List.of(
            "N°", "Date", "Heure", "Référence", "Service", "Paiement", 
            "Statut", "Mode", "N° de Compte", "Wallet", "N° Pseudo", 
            "Débit", "Crédit", "Compte:", "Sous-réseau"
        );
        
        int matchingHeaders = 0;
        for (String header : orangeMoneyHeaders) {
            if (rowData.stream().anyMatch(cell -> cell.contains(header))) {
                matchingHeaders++;
            }
        }
        
        // Retourner true si au moins 8 en-têtes Orange Money sont trouvés
        return matchingHeaders >= 8;
    }

    // Méthode pour détecter si une ligne contient les en-têtes OPPART
    private boolean isOPPARTHeaderRow(List<String> rowData) {
        List<String> oppartHeaders = List.of(
            "ID Opération", "Type Opération", "Montant", "Solde avant", "Solde aprés",
            "Code propriétaire", "Téléphone", "Statut", "ID Transaction", "Num bordereau",
            "Date opération", "Date de versement", "Banque appro", "Login demandeur Appro",
            "Login valideur Appro", "Motif rejet", "Frais connexion", "Numéro Trans GU",
            "Agent", "Motif régularisation", "groupe de réseau"
        );
        
        int matchingHeaders = 0;
        for (String header : oppartHeaders) {
            if (rowData.stream().anyMatch(cell -> cell.contains(header))) {
                matchingHeaders++;
            }
        }
        
        // Retourner true si au moins 5 en-têtes OPPART sont trouvés
        return matchingHeaders >= 5;
    }

    // Méthode pour obtenir les en-têtes OPPART par défaut
    private List<String> getOPPARTDefaultHeaders() {
        return List.of(
            "ID Opération", "Type Opération", "Montant", "Solde avant", "Solde aprés",
            "Code propriétaire", "Téléphone", "Statut", "ID Transaction", "Num bordereau",
            "Date opération", "Date de versement", "Banque appro", "Login demandeur Appro",
            "Login valideur Appro", "Motif rejet", "Frais connexion", "Numéro Trans GU",
            "Agent", "Motif régularisation", "groupe de réseau"
        );
    }

    // Méthode pour lire les données d'exemple des fichiers Excel
    private List<Map<String, Object>> readExcelSampleData(File file) throws IOException {
        try {
            // Utiliser Apache POI pour lire les fichiers Excel avec détection automatique du format
            Workbook workbook = createWorkbook(file);
            
            Sheet sheet = workbook.getSheetAt(0);
            List<Map<String, Object>> sampleData = new ArrayList<>();
            List<String> headers = new ArrayList<>();
            int headerRowIndex = -1;
            
            // Analyser les premières 200 lignes pour trouver les en-têtes
            int maxRowsToCheck = Math.min(200, sheet.getLastRowNum());
            // Recherche des en-têtes
            
            // Détection spécifique pour les fichiers OPPART
            if (fileNameMatches(file.getName(), "MODELES.TOKENS_OPPART",
                    CalculationRuleService.DEFAULT_TOKENS_OPPART)) {
                // Détection spécifique OPPART
                headers = getOPPARTDefaultHeaders();
                headerRowIndex = 0; // Supposer que les en-têtes sont à la première ligne
            } else {
                // Trouver la ligne d'en-têtes pour les autres fichiers
            for (int i = 0; i <= maxRowsToCheck; i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;
                
                List<String> rowData = readAllColumnsFromRow(row, sheet);
                
                // Vérifier si cette ligne contient les en-têtes Orange Money
                if (isOrangeMoneyHeaderRow(rowData)) {
                    headers = rowData;
                    headerRowIndex = i;
                    // En-têtes Orange Money détectés
                    // En-têtes détectés
                    break;
                    }
                }
            }
            
                            // Si aucun en-tête Orange Money n'est trouvé, utiliser la première ligne non vide
                if (headers.isEmpty()) {
                    for (int i = 0; i <= sheet.getLastRowNum(); i++) {
                        Row row = sheet.getRow(i);
                        if (row != null) {
                            List<String> rowData = readAllColumnsFromRow(row, sheet);
                            
                            if (rowData.stream().anyMatch(s -> !s.isEmpty())) {
                                headers = rowData;
                                headerRowIndex = i;
                                break;
                            }
                        }
                    }
                }
            
                         // Lire les données d'exemple (recherche agressive dans tout le fichier)
             if (!headers.isEmpty() && headerRowIndex >= 0) {
                 // Recherche de données valides
                 
                 // Parcourir tout le fichier pour trouver des données valides
                 for (int i = headerRowIndex + 1; i <= sheet.getLastRowNum(); i++) {
                     Row row = sheet.getRow(i);
                     if (row == null) continue;
                     
                     Map<String, Object> rowData = new java.util.HashMap<>();
                     boolean hasData = false;
                     boolean hasNonEmptyValues = false;
                     boolean hasStatutValue = false;
                     
                     // Lire toutes les colonnes de la ligne
                     List<String> rowValues = readAllColumnsFromRow(row, sheet);
                     
                     for (int j = 0; j < headers.size() && j < rowValues.size(); j++) {
                         String cellValue = rowValues.get(j);
                         
                         if (!cellValue.isEmpty()) {
                             hasData = true;
                             
                             // Vérifier spécifiquement si la colonne Statut a une valeur
                             if (j < headers.size() && headers.get(j).equals("Statut") && !cellValue.isEmpty()) {
                                 hasStatutValue = true;
                                 // Valeur Statut trouvée
                             }
                         }
                         
                         rowData.put(headers.get(j), cellValue);
                     }
                     
                     // Vérifier si cette ligne n'est pas la ligne d'en-têtes elle-même
                     boolean isHeaderRow = false;
                     for (Object value : rowData.values()) {
                         if (value != null && headers.contains(value.toString())) {
                             isHeaderRow = true;
                             break;
                         }
                     }
                     
                     // Ajouter les lignes qui contiennent des données significatives
                     if (hasData && !isHeaderRow) { // Suppression de la vérification hasNonEmptyValues
                         sampleData.add(rowData);
                         // Ligne ajoutée avec des données valides
                         
                         // Si on a trouvé une ligne avec une valeur Statut, c'est encore mieux
                         if (hasStatutValue) {
                             // Ligne contient une valeur Statut
                         }
                         
                         // Arrêter après avoir trouvé 10 lignes valides (augmenté)
                         if (sampleData.size() >= 10) break;
                     } else if (isHeaderRow) {
                         // Ligne d'en-têtes ignorée
                     } else {
                         // Ligne ignorée car pas de données valides
                     }
                 }
                 
                 // Si toujours aucune ligne valide, essayer une approche plus permissive
                 if (sampleData.isEmpty()) {
                     // Aucune ligne valide trouvée, essai avec critères plus permissifs
                     for (int i = headerRowIndex + 1; i <= Math.min(headerRowIndex + 1000, sheet.getLastRowNum()); i++) {
                         Row row = sheet.getRow(i);
                         if (row == null) continue;
                         
                         Map<String, Object> rowData = new java.util.HashMap<>();
                         boolean hasAnyData = false;
                         
                         // Lire toutes les colonnes de la ligne
                         List<String> rowValues = readAllColumnsFromRow(row, sheet);
                         
                         for (int j = 0; j < headers.size() && j < rowValues.size(); j++) {
                             String cellValue = rowValues.get(j);
                             
                             if (!cellValue.isEmpty()) {
                                 hasAnyData = true;
                             }
                             
                             rowData.put(headers.get(j), cellValue);
                         }
                         
                         // Ajouter toute ligne qui a au moins une donnée
                         if (hasAnyData) {
                             sampleData.add(rowData);
                             // Ligne ajoutée (critères permissifs)
                             if (sampleData.size() >= 10) break; // Augmenté à 10
                         }
                     }
                 }
             }
            
            workbook.close();
            // Données d'exemple Excel lues
            return sampleData;
            
        } catch (Exception e) {
            log.error("Erreur lors de la lecture des données Excel: {}", e.getMessage(), e);
            return List.of(
                Map.of("date", "2025-08-01", "montant", "1000.00", "description", "Transaction 1", "reference", "REF001"),
                Map.of("date", "2025-08-02", "montant", "2000.00", "description", "Transaction 2", "reference", "REF002")
            );
        }
    }
} 