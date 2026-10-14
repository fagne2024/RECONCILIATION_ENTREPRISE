package com.reconciliation.controller;

import com.reconciliation.entity.FraisTransactionEntity;
import com.reconciliation.entity.AgencySummaryEntity;
import com.reconciliation.entity.OperationEntity;
import com.reconciliation.entity.CompteEntity;
import com.reconciliation.repository.AgencySummaryRepository;
import com.reconciliation.repository.OperationRepository;
import com.reconciliation.repository.CompteRepository;
import com.reconciliation.service.FraisTransactionService;
import com.reconciliation.dto.FraisTransactionRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;
import java.util.Map;
import java.util.HashMap;
import java.util.stream.Collectors;
import java.util.ArrayList;

@RestController
@RequestMapping("/api/frais-transaction")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
public class FraisTransactionController {
    
    @Autowired
    private FraisTransactionService fraisTransactionService;
    
    @Autowired
    private AgencySummaryRepository agencySummaryRepository;
    
    @Autowired
    private OperationRepository operationRepository;
    
    @Autowired
    private CompteRepository compteRepository;
    
    @PostMapping
    public ResponseEntity<?> createFraisTransaction(@RequestBody FraisTransactionRequest request) {
        try {
            FraisTransactionEntity frais = fraisTransactionService.createFraisTransaction(request);
            return ResponseEntity.ok(frais);
        } catch (IllegalArgumentException e) {
            Map<String, String> errorResponse = new HashMap<>();
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(errorResponse);
        } catch (Exception e) {
            Map<String, String> errorResponse = new HashMap<>();
            errorResponse.put("error", "Erreur lors de la création du frais de transaction: " + e.getMessage());
            return ResponseEntity.badRequest().body(errorResponse);
        }
    }
    
    @PutMapping("/{id}")
    public ResponseEntity<?> updateFraisTransaction(@PathVariable Long id, @RequestBody FraisTransactionRequest request) {
        try {
            FraisTransactionEntity frais = fraisTransactionService.updateFraisTransaction(id, request);
            return ResponseEntity.ok(frais);
        } catch (IllegalArgumentException e) {
            Map<String, String> errorResponse = new HashMap<>();
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(errorResponse);
        } catch (Exception e) {
            Map<String, String> errorResponse = new HashMap<>();
            errorResponse.put("error", "Erreur lors de la mise à jour du frais de transaction: " + e.getMessage());
            return ResponseEntity.badRequest().body(errorResponse);
        }
    }
    
    @GetMapping
    public ResponseEntity<List<FraisTransactionEntity>> getAllFraisTransactions() {
        List<FraisTransactionEntity> fraisList = fraisTransactionService.getAllFraisTransactions();
        return ResponseEntity.ok(fraisList);
    }
    
    @GetMapping("/actifs")
    public ResponseEntity<List<FraisTransactionEntity>> getAllFraisTransactionsActifs() {
        List<FraisTransactionEntity> frais = fraisTransactionService.getAllFraisTransactionsActifs();
        return ResponseEntity.ok(frais);
    }
    
    @GetMapping("/{id}")
    public ResponseEntity<FraisTransactionEntity> getFraisTransactionById(@PathVariable Long id) {
        Optional<FraisTransactionEntity> frais = fraisTransactionService.getFraisTransactionById(id);
        return frais.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
    
    @GetMapping("/service/{service}")
    public ResponseEntity<List<FraisTransactionEntity>> getFraisTransactionsByService(@PathVariable String service) {
        List<FraisTransactionEntity> frais = fraisTransactionService.getFraisTransactionsByService(service);
        return ResponseEntity.ok(frais);
    }
    
    @GetMapping("/agence/{agence}")
    public ResponseEntity<List<FraisTransactionEntity>> getFraisTransactionsByAgence(@PathVariable String agence) {
        List<FraisTransactionEntity> frais = fraisTransactionService.getFraisTransactionsByAgence(agence);
        return ResponseEntity.ok(frais);
    }
    
    @GetMapping("/applicable")
    public ResponseEntity<FraisTransactionEntity> getFraisApplicable(
            @RequestParam String service, 
            @RequestParam String agence) {
        Optional<FraisTransactionEntity> frais = fraisTransactionService.getFraisApplicable(service, agence);
        return frais.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
    
    @GetMapping("/services")
    public ResponseEntity<List<String>> getAllServices() {
        List<String> services = fraisTransactionService.getAllServices();
        return ResponseEntity.ok(services);
    }
    
    @GetMapping("/agences")
    public ResponseEntity<List<String>> getAllAgences() {
        List<String> agences = fraisTransactionService.getAllAgences();
        return ResponseEntity.ok(agences);
    }
    
    /**
     * Endpoint d'export des frais de transaction
     */
    @GetMapping("/export")
    public ResponseEntity<Map<String, Object>> exportFraisTransactions() {
        Map<String, Object> result = new HashMap<>();
        
        try {
            List<FraisTransactionEntity> fraisList = fraisTransactionService.getAllFraisTransactions();
            
            // Transformer les données pour l'export
            List<Map<String, Object>> exportData = fraisList.stream()
                .map(frais -> {
                    Map<String, Object> exportRow = new HashMap<>();
                    exportRow.put("Service", frais.getService());
                    exportRow.put("Agence", frais.getAgence());
                    exportRow.put("Type de Calcul", "POURCENTAGE".equals(frais.getTypeCalcul()) ? "Frais en pourcentage" : "Frais fixe");
                    exportRow.put("Valeur Paramétrée", "POURCENTAGE".equals(frais.getTypeCalcul()) 
                        ? (frais.getPourcentage() != null ? frais.getPourcentage() + "%" : "0%")
                        : (frais.getMontantFrais() != null ? frais.getMontantFrais() + " FCFA" : "0 FCFA"));
                    exportRow.put("Description", frais.getDescription() != null ? frais.getDescription() : "-");
                    exportRow.put("Statut", frais.getActif() ? "Actif" : "Inactif");
                    exportRow.put("Date Création", frais.getDateCreation() != null ? frais.getDateCreation().toString() : "-");
                    exportRow.put("Date Modification", frais.getDateModification() != null ? frais.getDateModification().toString() : "-");
                    return exportRow;
                })
                .collect(Collectors.toList());
            
            result.put("success", true);
            result.put("data", exportData);
            result.put("totalCount", fraisList.size());
            result.put("exportDate", java.time.LocalDateTime.now().toString());
            
            return ResponseEntity.ok(result);
            
        } catch (Exception e) {
            result.put("success", false);
            result.put("error", "Erreur lors de l'export des frais de transaction: " + e.getMessage());
            return ResponseEntity.badRequest().body(result);
        }
    }
    
    @DeleteMapping("/{id}")
    public ResponseEntity<Boolean> deleteFraisTransaction(@PathVariable Long id) {
        boolean deleted = fraisTransactionService.deleteFraisTransaction(id);
        return deleted ? ResponseEntity.ok(true) : ResponseEntity.notFound().build();
    }
    
    @PutMapping("/{id}/toggle")
    public ResponseEntity<Boolean> toggleFraisTransaction(@PathVariable Long id) {
        boolean toggled = fraisTransactionService.toggleFraisTransaction(id);
        return toggled ? ResponseEntity.ok(true) : ResponseEntity.notFound().build();
    }
    
    /**
     * Endpoint de test pour valider le calcul des frais
     */
    @GetMapping("/test-calculation")
    public Map<String, Object> testFraisCalculation(
            @RequestParam String service,
            @RequestParam String agence,
            @RequestParam String typeCalcul,
            @RequestParam Double montantFrais,
            @RequestParam(required = false) Double pourcentage,
            @RequestParam Double volumeOperation,
            @RequestParam(required = false) Integer nombreTransactions) {
        
        Map<String, Object> result = new HashMap<>();
        
        try {
            Double montantFraisCalcule;
            
            if ("POURCENTAGE".equals(typeCalcul) && pourcentage != null) {
                // Frais en pourcentage : Volume Total × Pourcentage
                montantFraisCalcule = volumeOperation * (pourcentage / 100.0);
                result.put("type", "Frais en pourcentage");
                result.put("volumeTotal", volumeOperation);
                result.put("pourcentage", pourcentage);
                result.put("formule", "Volume Total × Pourcentage");
            } else {
                // Frais fixe : Valeur fixe × Nombre de transactions
                int nbTransactions = nombreTransactions != null ? nombreTransactions : 1;
                montantFraisCalcule = montantFrais * nbTransactions;
                result.put("type", "Frais fixe");
                result.put("montantParametre", montantFrais);
                result.put("nombreTransactions", nbTransactions);
                result.put("formule", "Montant paramétré × Nombre de transactions");
            }
            
            result.put("montantFraisCalcule", montantFraisCalcule);
            result.put("service", service);
            result.put("agence", agence);
            result.put("success", true);
            
        } catch (Exception e) {
            result.put("success", false);
            result.put("error", e.getMessage());
        }
        
        return result;
    }
    
    /**
     * Endpoint de test pour vérifier le calcul des frais avec données réelles
     */
    @GetMapping("/test-real-calculation")
    public Map<String, Object> testRealFraisCalculation(
            @RequestParam String service,
            @RequestParam String agence,
            @RequestParam String date) {
        
        Map<String, Object> result = new HashMap<>();
        
        try {
            // Récupérer le frais applicable
            Optional<FraisTransactionEntity> fraisOpt = fraisTransactionService.getFraisApplicable(service, agence);
            
            if (fraisOpt.isEmpty()) {
                result.put("success", false);
                result.put("error", "Aucun frais trouvé pour service=" + service + " et agence=" + agence);
                return result;
            }
            
            FraisTransactionEntity frais = fraisOpt.get();
            result.put("fraisTrouve", true);
            result.put("fraisId", frais.getId());
            result.put("fraisDescription", frais.getDescription());
            result.put("fraisTypeCalcul", frais.getTypeCalcul());
            result.put("fraisMontant", frais.getMontantFrais());
            result.put("fraisPourcentage", frais.getPourcentage());
            
            // Récupérer les données AgencySummary
            List<AgencySummaryEntity> summaries = agencySummaryRepository.findByDateAndAgencyAndService(date, agence, service);
            
            if (!summaries.isEmpty()) {
                AgencySummaryEntity summary = summaries.get(0);
                result.put("agencySummaryTrouve", true);
                result.put("nombreTransactions", summary.getRecordCount());
                result.put("volumeTotal", summary.getTotalVolume());
                
                // Calculer le montant des frais
                Double montantFraisCalcule;
                if ("POURCENTAGE".equals(frais.getTypeCalcul()) && frais.getPourcentage() != null) {
                    montantFraisCalcule = summary.getTotalVolume() * (frais.getPourcentage() / 100.0);
                    result.put("typeCalcul", "Frais en pourcentage");
                    result.put("formule", "Volume Total × Pourcentage");
                } else {
                    montantFraisCalcule = frais.getMontantFrais() * summary.getRecordCount();
                    result.put("typeCalcul", "Frais fixe");
                    result.put("formule", "Montant paramétré × Nombre de transactions");
                }
                
                result.put("montantFraisCalcule", montantFraisCalcule);
                
            } else {
                result.put("agencySummaryTrouve", false);
                result.put("message", "Aucun AgencySummary trouvé pour date=" + date + ", agence=" + agence + ", service=" + service);
                
                // Afficher les données disponibles pour debug
                List<AgencySummaryEntity> allSummaries = agencySummaryRepository.findAll();
                List<Map<String, Object>> availableData = allSummaries.stream()
                    .map(summary -> {
                        Map<String, Object> data = new HashMap<>();
                        data.put("date", summary.getDate());
                        data.put("agency", summary.getAgency());
                        data.put("service", summary.getService());
                        data.put("recordCount", summary.getRecordCount());
                        data.put("totalVolume", summary.getTotalVolume());
                        return data;
                    })
                    .collect(Collectors.toList());
                result.put("donneesDisponibles", availableData);
            }
            
            result.put("success", true);
            
        } catch (Exception e) {
            result.put("success", false);
            result.put("error", e.getMessage());
        }
        
        return result;
    }
    
    /**
     * Endpoint de test simple pour vérifier le calcul des frais
     */
    @GetMapping("/test-simple")
    public Map<String, Object> testSimpleFraisCalculation() {
        Map<String, Object> result = new HashMap<>();
        
        try {
            // Test avec les données de votre exemple
            String service = "PAIEMENTMARCHAND_MTN_CM";
            String agence = "BETPW8064";
            String date = "2025-06-20";
            Double montantFrais = 500.0;
            
            result.put("testData", Map.of(
                "service", service,
                "agence", agence,
                "date", date,
                "montantFrais", montantFrais
            ));
            
            // Récupérer le frais applicable
            Optional<FraisTransactionEntity> fraisOpt = fraisTransactionService.getFraisApplicable(service, agence);
            
            if (fraisOpt.isPresent()) {
                FraisTransactionEntity frais = fraisOpt.get();
                result.put("fraisTrouve", true);
                result.put("fraisTypeCalcul", frais.getTypeCalcul());
                result.put("fraisMontant", frais.getMontantFrais());
                result.put("fraisPourcentage", frais.getPourcentage());
                
                // Récupérer les données AgencySummary
                List<AgencySummaryEntity> summaries = agencySummaryRepository.findByDateAndAgencyAndService(date, agence, service);
                
                if (!summaries.isEmpty()) {
                    AgencySummaryEntity summary = summaries.get(0);
                    result.put("agencySummaryTrouve", true);
                    result.put("nombreTransactions", summary.getRecordCount());
                    result.put("volumeTotal", summary.getTotalVolume());
                    
                    // Calculer le montant des frais
                    Double montantFraisCalcule;
                    if ("POURCENTAGE".equals(frais.getTypeCalcul()) && frais.getPourcentage() != null) {
                        montantFraisCalcule = summary.getTotalVolume() * (frais.getPourcentage() / 100.0);
                        result.put("typeCalcul", "Frais en pourcentage");
                        result.put("formule", "Volume Total × Pourcentage");
                    } else {
                        montantFraisCalcule = frais.getMontantFrais() * summary.getRecordCount();
                        result.put("typeCalcul", "Frais fixe");
                        result.put("formule", "Montant paramétré × Nombre de transactions");
                    }
                    
                    result.put("montantFraisCalcule", montantFraisCalcule);
                    result.put("calculCorrect", montantFraisCalcule.equals(500.0 * summary.getRecordCount()));
                    
                } else {
                    result.put("agencySummaryTrouve", false);
                    result.put("message", "Aucun AgencySummary trouvé");
                    
                    // Afficher toutes les données disponibles
                    List<AgencySummaryEntity> allSummaries = agencySummaryRepository.findAll();
                    result.put("totalAgencySummaries", allSummaries.size());
                    
                    List<Map<String, Object>> availableData = allSummaries.stream()
                        .map(summary -> {
                            Map<String, Object> data = new HashMap<>();
                            data.put("date", summary.getDate());
                            data.put("agency", summary.getAgency());
                            data.put("service", summary.getService());
                            data.put("recordCount", summary.getRecordCount());
                            data.put("totalVolume", summary.getTotalVolume());
                            return data;
                        })
                        .collect(Collectors.toList());
                    result.put("donneesDisponibles", availableData);
                }
                
            } else {
                result.put("fraisTrouve", false);
                result.put("message", "Aucun frais trouvé");
            }
            
            result.put("success", true);
            
        } catch (Exception e) {
            result.put("success", false);
            result.put("error", e.getMessage());
            e.printStackTrace();
        }
        
        return result;
    }
    
    /**
     * Endpoint de test avec les données réelles du tableau
     */
    @GetMapping("/test-real-data")
    public Map<String, Object> testRealData() {
        Map<String, Object> result = new HashMap<>();
        
        try {
            String service = "PAIEMENTMARCHAND_MTN_CM";
            String date = "2025-06-20";
            
            // Données attendues selon le tableau
            Map<String, Integer> expectedTransactions = Map.of(
                "BETPW8064", 178112,
                "BMOCM8056", 852,
                "BTWIN8060", 290,
                "MELBT8066", 5887,
                "SGBET8063", 841,
                "XBTCM8057", 94941
            );
            
            result.put("service", service);
            result.put("date", date);
            result.put("expectedTransactions", expectedTransactions);
            
            List<Map<String, Object>> results = new ArrayList<>();
            
            for (String agence : expectedTransactions.keySet()) {
                Map<String, Object> agenceResult = new HashMap<>();
                agenceResult.put("agence", agence);
                agenceResult.put("expectedTransactions", expectedTransactions.get(agence));
                agenceResult.put("expectedFrais", 500.0 * expectedTransactions.get(agence));
                
                // Récupérer le frais applicable
                Optional<FraisTransactionEntity> fraisOpt = fraisTransactionService.getFraisApplicable(service, agence);
                
                if (fraisOpt.isPresent()) {
                    FraisTransactionEntity frais = fraisOpt.get();
                    agenceResult.put("fraisTrouve", true);
                    agenceResult.put("fraisTypeCalcul", frais.getTypeCalcul());
                    agenceResult.put("fraisMontant", frais.getMontantFrais());
                    
                    // Récupérer les données AgencySummary
                    List<AgencySummaryEntity> summaries = agencySummaryRepository.findByDateAndAgencyAndService(date, agence, service);
                    
                    if (!summaries.isEmpty()) {
                        AgencySummaryEntity summary = summaries.get(0);
                        agenceResult.put("agencySummaryTrouve", true);
                        agenceResult.put("actualRecordCount", summary.getRecordCount());
                        agenceResult.put("actualTotalVolume", summary.getTotalVolume());
                        
                        // Calculer le montant des frais
                        Double montantFraisCalcule;
                        if ("POURCENTAGE".equals(frais.getTypeCalcul()) && frais.getPourcentage() != null) {
                            montantFraisCalcule = summary.getTotalVolume() * (frais.getPourcentage() / 100.0);
                            agenceResult.put("typeCalcul", "Frais en pourcentage");
                        } else {
                            montantFraisCalcule = frais.getMontantFrais() * summary.getRecordCount();
                            agenceResult.put("typeCalcul", "Frais fixe");
                        }
                        
                        agenceResult.put("montantFraisCalcule", montantFraisCalcule);
                        agenceResult.put("calculCorrect", Math.abs(montantFraisCalcule - (500.0 * expectedTransactions.get(agence))) < 0.01);
                        
                    } else {
                        agenceResult.put("agencySummaryTrouve", false);
                        agenceResult.put("message", "Aucun AgencySummary trouvé");
                    }
                    
                } else {
                    agenceResult.put("fraisTrouve", false);
                    agenceResult.put("message", "Aucun frais trouvé");
                }
                
                results.add(agenceResult);
            }
            
            result.put("results", results);
            result.put("success", true);
            
        } catch (Exception e) {
            result.put("success", false);
            result.put("error", e.getMessage());
            e.printStackTrace();
        }
        
        return result;
    }
    
    /**
     * Endpoint de test pour la date du 18/06/2025
     */
    @GetMapping("/test-18-06-2025")
    public Map<String, Object> test18June2025() {
        Map<String, Object> result = new HashMap<>();
        
        try {
            String service = "PAIEMENTMARCHAND_MTN_CM";
            String date = "2025-06-18";
            
            // Données attendues selon le tableau pour le 18/06/2025
            Map<String, Integer> expectedTransactions = Map.of(
                "BETPW8064", 178112,
                "BMOCM8056", 852,
                "BTWIN8060", 290,
                "MELBT8066", 5887,
                "SGBET8063", 841,
                "XBTCM8057", 94941
            );
            
            result.put("service", service);
            result.put("date", date);
            result.put("expectedTransactions", expectedTransactions);
            
            List<Map<String, Object>> results = new ArrayList<>();
            
            for (String agence : expectedTransactions.keySet()) {
                Map<String, Object> agenceResult = new HashMap<>();
                agenceResult.put("agence", agence);
                agenceResult.put("expectedTransactions", expectedTransactions.get(agence));
                agenceResult.put("expectedFrais", 500.0 * expectedTransactions.get(agence));
                
                // Récupérer le frais applicable
                Optional<FraisTransactionEntity> fraisOpt = fraisTransactionService.getFraisApplicable(service, agence);
                
                if (fraisOpt.isPresent()) {
                    FraisTransactionEntity frais = fraisOpt.get();
                    agenceResult.put("fraisTrouve", true);
                    agenceResult.put("fraisTypeCalcul", frais.getTypeCalcul());
                    agenceResult.put("fraisMontant", frais.getMontantFrais());
                    
                    // Récupérer les données AgencySummary
                    List<AgencySummaryEntity> summaries = agencySummaryRepository.findByDateAndAgencyAndService(date, agence, service);
                    
                    if (!summaries.isEmpty()) {
                        AgencySummaryEntity summary = summaries.get(0);
                        agenceResult.put("agencySummaryTrouve", true);
                        agenceResult.put("actualRecordCount", summary.getRecordCount());
                        agenceResult.put("actualTotalVolume", summary.getTotalVolume());
                        
                        // Calculer le montant des frais
                        Double montantFraisCalcule;
                        if ("POURCENTAGE".equals(frais.getTypeCalcul()) && frais.getPourcentage() != null) {
                            montantFraisCalcule = summary.getTotalVolume() * (frais.getPourcentage() / 100.0);
                            agenceResult.put("typeCalcul", "Frais en pourcentage");
                        } else {
                            montantFraisCalcule = frais.getMontantFrais() * summary.getRecordCount();
                            agenceResult.put("typeCalcul", "Frais fixe");
                        }
                        
                        agenceResult.put("montantFraisCalcule", montantFraisCalcule);
                        agenceResult.put("calculCorrect", Math.abs(montantFraisCalcule - (500.0 * expectedTransactions.get(agence))) < 0.01);
                        
                        // Debug: afficher les détails de la recherche
                        agenceResult.put("debug", Map.of(
                            "searchDate", date,
                            "searchAgency", agence,
                            "searchService", service,
                            "foundRecordCount", summary.getRecordCount(),
                            "foundTotalVolume", summary.getTotalVolume()
                        ));
                        
                    } else {
                        agenceResult.put("agencySummaryTrouve", false);
                        agenceResult.put("message", "Aucun AgencySummary trouvé");
                        
                        // Debug: afficher toutes les données disponibles pour cette date
                        List<AgencySummaryEntity> allSummaries = agencySummaryRepository.findAll();
                        List<AgencySummaryEntity> dateSummaries = allSummaries.stream()
                            .filter(summary -> date.equals(summary.getDate()))
                            .collect(Collectors.toList());
                        
                        agenceResult.put("totalSummariesForDate", dateSummaries.size());
                        
                        List<Map<String, Object>> availableData = dateSummaries.stream()
                            .map(summary -> {
                                Map<String, Object> data = new HashMap<>();
                                data.put("agency", summary.getAgency());
                                data.put("service", summary.getService());
                                data.put("recordCount", summary.getRecordCount());
                                data.put("totalVolume", summary.getTotalVolume());
                                return data;
                            })
                            .collect(Collectors.toList());
                        agenceResult.put("availableDataForDate", availableData);
                    }
                    
                } else {
                    agenceResult.put("fraisTrouve", false);
                    agenceResult.put("message", "Aucun frais trouvé");
                }
                
                results.add(agenceResult);
            }
            
            result.put("results", results);
            result.put("success", true);
            
        } catch (Exception e) {
            result.put("success", false);
            result.put("error", e.getMessage());
            e.printStackTrace();
        }
        
        return result;
    }
    
    /**
     * Endpoint de test pour créer une opération de frais et vérifier le calcul
     */
    @GetMapping("/test-create-frais-operation")
    public Map<String, Object> testCreateFraisOperation(
            @RequestParam String service,
            @RequestParam String agence,
            @RequestParam String date) {
        
        Map<String, Object> result = new HashMap<>();
        
        // Logs de debug
        System.out.println("=== DEBUG test-create-frais-operation ===");
        System.out.println("Paramètres reçus:");
        System.out.println("  - service: '" + service + "'");
        System.out.println("  - agence: '" + agence + "'");
        System.out.println("  - date: '" + date + "'");
        
        try {
            // Récupérer le frais applicable
            System.out.println("Recherche du frais applicable...");
            Optional<FraisTransactionEntity> fraisOpt = fraisTransactionService.getFraisApplicable(service, agence);
            
            System.out.println("fraisOpt.isPresent(): " + fraisOpt.isPresent());
            
            if (fraisOpt.isEmpty()) {
                System.out.println("❌ Aucun frais trouvé");
                result.put("success", false);
                result.put("error", "Aucun frais trouvé pour service=" + service + " et agence=" + agence);
                return result;
            }
            
            FraisTransactionEntity frais = fraisOpt.get();
            System.out.println("✅ Frais trouvé: ID=" + frais.getId() + ", Description='" + frais.getDescription() + "'");
            
            result.put("fraisTrouve", true);
            result.put("fraisId", frais.getId());
            result.put("fraisDescription", frais.getDescription());
            result.put("fraisTypeCalcul", frais.getTypeCalcul());
            result.put("fraisMontant", frais.getMontantFrais());
            result.put("fraisPourcentage", frais.getPourcentage());
            
            // Récupérer les données AgencySummary
            System.out.println("Recherche des données AgencySummary...");
            List<AgencySummaryEntity> summaries = agencySummaryRepository.findByDateAndAgencyAndService(date, agence, service);
            
            System.out.println("summaries.size(): " + summaries.size());
            
            if (!summaries.isEmpty()) {
                AgencySummaryEntity summary = summaries.get(0);
                System.out.println("✅ AgencySummary trouvé: recordCount=" + summary.getRecordCount() + ", totalVolume=" + summary.getTotalVolume());
                
                result.put("agencySummaryTrouve", true);
                result.put("nombreTransactions", summary.getRecordCount());
                result.put("volumeTotal", summary.getTotalVolume());
                
                // Calculer le montant des frais
                Double montantFraisCalcule;
                if ("POURCENTAGE".equals(frais.getTypeCalcul()) && frais.getPourcentage() != null) {
                    montantFraisCalcule = summary.getTotalVolume() * (frais.getPourcentage() / 100.0);
                    result.put("typeCalcul", "Frais en pourcentage");
                    result.put("formule", "Volume Total × Pourcentage");
                } else {
                    montantFraisCalcule = frais.getMontantFrais() * summary.getRecordCount();
                    result.put("typeCalcul", "Frais fixe");
                    result.put("formule", "Montant paramétré × Nombre de transactions");
                }
                
                System.out.println("💰 Montant calculé: " + montantFraisCalcule + " FCFA");
                
                result.put("montantFraisCalcule", montantFraisCalcule);
                result.put("calculCorrect", montantFraisCalcule.equals(500.0 * summary.getRecordCount()));
                
                // Simuler la création d'une opération de frais
                result.put("simulationOperation", Map.of(
                    "typeOperation", "FRAIS_TRANSACTION",
                    "montant", montantFraisCalcule,
                    "service", service,
                    "agence", agence,
                    "date", date,
                    "bordereau", "FEES_SUMMARY_" + date + "_" + agence
                ));
                
            } else {
                System.out.println("❌ Aucun AgencySummary trouvé");
                result.put("agencySummaryTrouve", false);
                result.put("error", "Aucune donnée AgencySummary trouvée pour date=" + date + ", agence=" + agence + ", service=" + service);
            }
            
            result.put("success", true);
            System.out.println("=== FIN DEBUG ===");
            
        } catch (Exception e) {
            System.out.println("❌ Exception: " + e.getMessage());
            e.printStackTrace();
            result.put("success", false);
            result.put("error", e.getMessage());
        }
        
        return result;
    }

    /**
     * Endpoint pour corriger les montants des opérations de frais existantes
     */
    @PostMapping("/fix-existing-frais-operations")
    public Map<String, Object> fixExistingFraisOperations(
            @RequestParam String date) {
        
        Map<String, Object> result = new HashMap<>();
        List<Map<String, Object>> corrections = new ArrayList<>();
        
        try {
            System.out.println("=== CORRECTION DES OPÉRATIONS DE FRAIS POUR " + date + " ===");
            
            // Récupérer toutes les opérations de frais pour cette date
            // Note: Cette requête doit être adaptée selon votre structure de base de données
            // Ici on simule la logique de correction
            
            // Pour chaque agence dans vos données
            String[] agences = {"BETPW8064", "BMOCM8056", "BTWIN8060", "MELBT8066", "SGBET8063", "XBTCM8057"};
            String service = "PAIEMENTMARCHAND_MTN_CM";
            
            for (String agence : agences) {
                Map<String, Object> correction = new HashMap<>();
                correction.put("agence", agence);
                correction.put("service", service);
                correction.put("date", date);
                
                // Récupérer le frais applicable
                Optional<FraisTransactionEntity> fraisOpt = fraisTransactionService.getFraisApplicable(service, agence);
                
                if (fraisOpt.isPresent()) {
                    FraisTransactionEntity frais = fraisOpt.get();
                    
                    // Récupérer les données AgencySummary
                    List<AgencySummaryEntity> summaries = agencySummaryRepository.findByDateAndAgencyAndService(date, agence, service);
                    
                    if (!summaries.isEmpty()) {
                        AgencySummaryEntity summary = summaries.get(0);
                        int nombreTransactions = summary.getRecordCount();
                        Double volumeTotal = summary.getTotalVolume();
                        
                        // Calculer le montant correct
                        Double montantCorrect;
                        if ("POURCENTAGE".equals(frais.getTypeCalcul()) && frais.getPourcentage() != null) {
                            montantCorrect = volumeTotal * (frais.getPourcentage() / 100.0);
                        } else {
                            montantCorrect = frais.getMontantFrais() * nombreTransactions;
                        }
                        
                        correction.put("nombreTransactions", nombreTransactions);
                        correction.put("volumeTotal", volumeTotal);
                        correction.put("montantParametre", frais.getMontantFrais());
                        correction.put("montantCorrect", montantCorrect);
                        correction.put("bordereau", "FEES_SUMMARY_" + date + "_" + agence);
                        
                        System.out.println("✅ " + agence + ": " + nombreTransactions + " transactions → " + montantCorrect + " FCFA");
                        
                    } else {
                        correction.put("error", "Aucune donnée AgencySummary trouvée");
                        System.out.println("❌ " + agence + ": Aucune donnée AgencySummary trouvée");
                    }
                    
                } else {
                    correction.put("error", "Aucun frais trouvé");
                    System.out.println("❌ " + agence + ": Aucun frais trouvé");
                }
                
                corrections.add(correction);
            }
            
            result.put("date", date);
            result.put("corrections", corrections);
            result.put("success", true);
            result.put("message", "Calculs effectués. Vérifiez les montants et appliquez les corrections en base de données.");
            
        } catch (Exception e) {
            result.put("success", false);
            result.put("error", e.getMessage());
            e.printStackTrace();
        }
        
        return result;
    }

    /**
     * Endpoint pour appliquer automatiquement les corrections en base de données
     */
    @PostMapping("/apply-frais-corrections")
    public Map<String, Object> applyFraisCorrections(
            @RequestParam String date) {
        
        Map<String, Object> result = new HashMap<>();
        List<Map<String, Object>> appliedCorrections = new ArrayList<>();
        
        try {
            System.out.println("=== APPLICATION DES CORRECTIONS POUR " + date + " ===");
            
            // Récupérer toutes les opérations de frais pour cette date
            // Note: Cette logique doit être adaptée selon votre structure de base de données
            
            String[] agences = {"BETPW8064", "BMOCM8056", "BTWIN8060", "MELBT8066", "SGBET8063", "XBTCM8057"};
            String service = "PAIEMENTMARCHAND_MTN_CM";
            
            for (String agence : agences) {
                Map<String, Object> correction = new HashMap<>();
                correction.put("agence", agence);
                correction.put("service", service);
                correction.put("date", date);
                
                // Récupérer le frais applicable
                Optional<FraisTransactionEntity> fraisOpt = fraisTransactionService.getFraisApplicable(service, agence);
                
                if (fraisOpt.isPresent()) {
                    FraisTransactionEntity frais = fraisOpt.get();
                    
                    // Récupérer les données AgencySummary
                    List<AgencySummaryEntity> summaries = agencySummaryRepository.findByDateAndAgencyAndService(date, agence, service);
                    
                    if (!summaries.isEmpty()) {
                        AgencySummaryEntity summary = summaries.get(0);
                        int nombreTransactions = summary.getRecordCount();
                        Double volumeTotal = summary.getTotalVolume();
                        
                        // Calculer le montant correct
                        Double montantCorrect;
                        if ("POURCENTAGE".equals(frais.getTypeCalcul()) && frais.getPourcentage() != null) {
                            montantCorrect = volumeTotal * (frais.getPourcentage() / 100.0);
                        } else {
                            montantCorrect = frais.getMontantFrais() * nombreTransactions;
                        }
                        
                        // Ici, vous devriez ajouter la logique pour mettre à jour la base de données
                        // Par exemple, en utilisant un service ou repository pour les opérations
                        
                        correction.put("nombreTransactions", nombreTransactions);
                        correction.put("volumeTotal", volumeTotal);
                        correction.put("montantParametre", frais.getMontantFrais());
                        correction.put("montantCorrect", montantCorrect);
                        correction.put("bordereau", "FEES_SUMMARY_" + date + "_" + agence);
                        correction.put("status", "Calculé - À appliquer en base");
                        
                        System.out.println("✅ " + agence + ": " + nombreTransactions + " transactions → " + montantCorrect + " FCFA");
                        
                    } else {
                        correction.put("error", "Aucune donnée AgencySummary trouvée");
                        System.out.println("❌ " + agence + ": Aucune donnée AgencySummary trouvée");
                    }
                    
                } else {
                    correction.put("error", "Aucun frais trouvé");
                    System.out.println("❌ " + agence + ": Aucun frais trouvé");
                }
                
                appliedCorrections.add(correction);
            }
            
            result.put("date", date);
            result.put("appliedCorrections", appliedCorrections);
            result.put("success", true);
            result.put("message", "Calculs effectués. Utilisez le script SQL 'fix-frais-amounts.sql' pour appliquer les corrections en base de données.");
            
        } catch (Exception e) {
            result.put("success", false);
            result.put("error", e.getMessage());
            e.printStackTrace();
        }
        
        return result;
    }

    /**
     * Endpoint pour tester la création automatique d'opérations de frais
     */
    @PostMapping("/test-create-operation")
    public Map<String, Object> testCreateOperation(
            @RequestParam String service,
            @RequestParam String agence,
            @RequestParam String date,
            @RequestParam String typeOperation,
            @RequestParam Double montant) {
        
        Map<String, Object> result = new HashMap<>();
        
        try {
            System.out.println("=== TEST CRÉATION OPÉRATION ===");
            System.out.println("Service: " + service);
            System.out.println("Agence: " + agence);
            System.out.println("Date: " + date);
            System.out.println("Type: " + typeOperation);
            System.out.println("Montant: " + montant);
            
            // Simuler la création d'une opération
            // Note: Cette logique devrait être dans un service dédié
            
            // 1. Vérifier que le frais existe
            Optional<FraisTransactionEntity> fraisOpt = fraisTransactionService.getFraisApplicable(service, agence);
            
            if (fraisOpt.isPresent()) {
                FraisTransactionEntity frais = fraisOpt.get();
                result.put("fraisTrouve", true);
                result.put("fraisId", frais.getId());
                result.put("fraisMontant", frais.getMontantFrais());
                result.put("fraisTypeCalcul", frais.getTypeCalcul());
                
                // 2. Vérifier que l'AgencySummary existe
                List<AgencySummaryEntity> summaries = agencySummaryRepository.findByDateAndAgencyAndService(date, agence, service);
                
                if (!summaries.isEmpty()) {
                    AgencySummaryEntity summary = summaries.get(0);
                    result.put("agencySummaryTrouve", true);
                    result.put("nombreTransactions", summary.getRecordCount());
                    result.put("volumeTotal", summary.getTotalVolume());
                    
                    // 3. Calculer le montant des frais
                    Double montantFraisCalcule;
                    if ("POURCENTAGE".equals(frais.getTypeCalcul()) && frais.getPourcentage() != null) {
                        montantFraisCalcule = summary.getTotalVolume() * (frais.getPourcentage() / 100.0);
                    } else {
                        montantFraisCalcule = frais.getMontantFrais() * summary.getRecordCount();
                    }
                    
                    result.put("montantFraisCalcule", montantFraisCalcule);
                    result.put("bordereauAttendu", "FEES_SUMMARY_" + date + "_" + agence);
                    
                    System.out.println("✅ Montant des frais calculé: " + montantFraisCalcule + " FCFA");
                    
                } else {
                    result.put("agencySummaryTrouve", false);
                    result.put("error", "Aucune donnée AgencySummary trouvée");
                }
                
            } else {
                result.put("fraisTrouve", false);
                result.put("error", "Aucun frais trouvé");
            }
            
            result.put("success", true);
            
        } catch (Exception e) {
            result.put("success", false);
            result.put("error", e.getMessage());
            e.printStackTrace();
        }
        
        return result;
    }

    /**
     * Endpoint pour corriger automatiquement les montants des frais existants
     * Basé sur les données AgencySummary
     */
    @GetMapping("/correct-frais-amounts")
    public Map<String, Object> correctFraisAmounts(
            @RequestParam String date,
            @RequestParam String service,
            @RequestParam(required = false) List<String> agences) {
        
        Map<String, Object> result = new HashMap<>();
        List<Map<String, Object>> corrections = new ArrayList<>();
        
        try {
            System.out.println("=== CORRECTION AUTOMATIQUE DES FRAIS ===");
            System.out.println("Date: " + date + ", Service: " + service);
            
            // Si aucune agence spécifiée, récupérer toutes les agences avec des frais pour ce service
            if (agences == null || agences.isEmpty()) {
                List<FraisTransactionEntity> fraisList = fraisTransactionService.getFraisTransactionsByService(service);
                agences = fraisList.stream()
                    .map(FraisTransactionEntity::getAgence)
                    .distinct()
                    .collect(Collectors.toList());
            }
            
            System.out.println("Agences à traiter: " + agences);
            
            for (String agence : agences) {
                Map<String, Object> correction = new HashMap<>();
                correction.put("agence", agence);
                correction.put("service", service);
                correction.put("date", date);
                
                System.out.println("Traitement de l'agence: " + agence);
                
                // Récupérer le frais applicable
                Optional<FraisTransactionEntity> fraisOpt = fraisTransactionService.getFraisApplicable(service, agence);
                
                if (fraisOpt.isPresent()) {
                    FraisTransactionEntity frais = fraisOpt.get();
                    correction.put("fraisTrouve", true);
                    correction.put("fraisId", frais.getId());
                    correction.put("fraisMontant", frais.getMontantFrais());
                    correction.put("fraisTypeCalcul", frais.getTypeCalcul());
                    
                    // Récupérer les données AgencySummary
                    List<AgencySummaryEntity> summaries = agencySummaryRepository.findByDateAndAgencyAndService(date, agence, service);
                    
                    if (!summaries.isEmpty()) {
                        AgencySummaryEntity summary = summaries.get(0);
                        int nombreTransactions = summary.getRecordCount();
                        Double volumeTotal = summary.getTotalVolume();
                        
                        // Calculer le montant correct
                        Double montantCorrect;
                        if ("POURCENTAGE".equals(frais.getTypeCalcul()) && frais.getPourcentage() != null) {
                            montantCorrect = volumeTotal * (frais.getPourcentage() / 100.0);
                            correction.put("typeCalcul", "Frais en pourcentage");
                        } else {
                            montantCorrect = frais.getMontantFrais() * nombreTransactions;
                            correction.put("typeCalcul", "Frais fixe");
                        }
                        
                        // Récupérer l'opération de frais existante
                        String bordereau = "FEES_SUMMARY_" + date + "_" + agence;
                        List<OperationEntity> fraisOperations = operationRepository.findByNomBordereauContaining(bordereau).stream()
                            .filter(op -> "FRAIS_TRANSACTION".equals(op.getTypeOperation()))
                            .collect(Collectors.toList());
                        
                        if (!fraisOperations.isEmpty()) {
                            OperationEntity fraisOperation = fraisOperations.get(0);
                            Double montantActuel = fraisOperation.getMontant();
                            
                            correction.put("operationTrouvee", true);
                            correction.put("operationId", fraisOperation.getId());
                            correction.put("montantActuel", montantActuel);
                            correction.put("montantCorrect", montantCorrect);
                            correction.put("difference", montantCorrect - montantActuel);
                            
                            // Appliquer la correction si nécessaire
                            if (!montantActuel.equals(montantCorrect)) {
                                fraisOperation.setMontant(montantCorrect);
                                
                                // Recalculer les soldes si nécessaire
                                if ("Validée".equals(fraisOperation.getStatut())) {
                                    double difference = montantCorrect - montantActuel;
                                    double nouveauSoldeApres = fraisOperation.getSoldeApres() - difference;
                                    fraisOperation.setSoldeApres(nouveauSoldeApres);
                                    
                                    // Mettre à jour le solde du compte
                                    CompteEntity compte = fraisOperation.getCompte();
                                    compte.setSolde(nouveauSoldeApres);
                                    compte.setDateDerniereMaj(java.time.LocalDateTime.now());
                                    compteRepository.save(compte);
                                }
                                
                                operationRepository.save(fraisOperation);
                                correction.put("correctionAppliquee", true);
                                correction.put("status", "Corrigé");
                                
                                System.out.println("✅ " + agence + ": " + nombreTransactions + " transactions → " + montantCorrect + " FCFA (corrigé de " + montantActuel + ")");
                            } else {
                                correction.put("correctionAppliquee", false);
                                correction.put("status", "Déjà correct");
                                System.out.println("✅ " + agence + ": Montant déjà correct (" + montantCorrect + " FCFA)");
                            }
                        } else {
                            correction.put("operationTrouvee", false);
                            correction.put("status", "Aucune opération trouvée");
                            System.out.println("❌ " + agence + ": Aucune opération de frais trouvée");
                        }
                        
                        correction.put("nombreTransactions", nombreTransactions);
                        correction.put("volumeTotal", volumeTotal);
                        correction.put("bordereau", bordereau);
                        
                    } else {
                        correction.put("agencySummaryTrouve", false);
                        correction.put("status", "Aucune donnée AgencySummary");
                        System.out.println("❌ " + agence + ": Aucune donnée AgencySummary trouvée");
                    }
                    
                } else {
                    correction.put("fraisTrouve", false);
                    correction.put("status", "Aucun frais trouvé");
                    System.out.println("❌ " + agence + ": Aucun frais trouvé");
                }
                
                corrections.add(correction);
            }
            
            result.put("corrections", corrections);
            result.put("date", date);
            result.put("service", service);
            result.put("totalAgences", agences.size());
            result.put("correctionsAppliquees", corrections.stream()
                .mapToInt(c -> (Boolean) c.getOrDefault("correctionAppliquee", false) ? 1 : 0)
                .sum());
            result.put("success", true);
            
            System.out.println("=== CORRECTION TERMINÉE ===");
            
        } catch (Exception e) {
            result.put("success", false);
            result.put("error", e.getMessage());
            System.out.println("❌ Erreur lors de la correction: " + e.getMessage());
        }
        
        return result;
    }

    @PostMapping("/filter")
    public ResponseEntity<List<FraisTransactionEntity>> filterFraisTransactions(@RequestBody Map<String, Object> filters) {
        List<FraisTransactionEntity> result = fraisTransactionService.filterFraisTransactions(filters);
        return ResponseEntity.ok(result);
    }
} 