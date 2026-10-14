package com.reconciliation.controller;

import com.reconciliation.service.RankingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/rankings")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
public class RankingController {
    
    private static final Logger logger = LoggerFactory.getLogger(RankingController.class);
    
    @Autowired
    private RankingService rankingService;
    
    /**
     * Récupérer tous les classements
     */
    @GetMapping
    public ResponseEntity<Map<String, Object>> getAllRankings(@RequestParam(required = false, defaultValue = "month") String period) {
        try {
            Map<String, Object> rankings = rankingService.getAllRankings(period);
            return ResponseEntity.ok(rankings);
        } catch (Exception e) {
            logger.error("Error getting all rankings: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().build();
        }
    }
    
    /**
     * Récupérer la liste des pays distincts normalisés
     */
    @GetMapping("/countries")
    public ResponseEntity<List<String>> getDistinctCountries() {
        try {
            List<String> countries = rankingService.getNormalizedDistinctCountries();
            return ResponseEntity.ok(countries);
        } catch (Exception e) {
            logger.error("Error getting countries: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * Classements agences + services en une seule requête (chargement initial optimisé)
     */
    @GetMapping("/bundle")
    public ResponseEntity<Map<String, Object>> getRankingsBundle(
            @RequestParam(required = false) List<String> country,
            @RequestParam(required = false, defaultValue = "month") String period,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        try {
            Map<String, Object> bundle = rankingService.getRankingsBundle(country, period, startDate, endDate);
            return ResponseEntity.ok(bundle);
        } catch (Exception e) {
            logger.error("Error getting rankings bundle: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().build();
        }
    }
    
    /**
     * Classement des agences par nombre de transactions
     */
    @GetMapping("/agencies/transactions")
    public ResponseEntity<List<Map<String, Object>>> getAgencyRankingByTransactions(
            @RequestParam(required = false) List<String> country,
            @RequestParam(required = false, defaultValue = "month") String period,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        try {
            List<Map<String, Object>> ranking = rankingService.getAgencyRankingByTransactions(country, period, startDate, endDate);
            return ResponseEntity.ok(ranking);
        } catch (Exception e) {
            logger.error("Error getting agency ranking by transactions: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().build();
        }
    }
    
    /**
     * Classement des agences par volume
     */
    @GetMapping("/agencies/volume")
    public ResponseEntity<List<Map<String, Object>>> getAgencyRankingByVolume(
            @RequestParam(required = false) List<String> country,
            @RequestParam(required = false, defaultValue = "month") String period,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        try {
            List<Map<String, Object>> ranking = rankingService.getAgencyRankingByVolume(country, period, startDate, endDate);
            return ResponseEntity.ok(ranking);
        } catch (Exception e) {
            logger.error("Error getting agency ranking by volume: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().build();
        }
    }
    
    /**
     * Classement des agences par frais
     */
    @GetMapping("/agencies/fees")
    public ResponseEntity<List<Map<String, Object>>> getAgencyRankingByFees(
            @RequestParam(required = false) List<String> country,
            @RequestParam(required = false, defaultValue = "month") String period,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        try {
            List<Map<String, Object>> ranking = rankingService.getAgencyRankingByFees(country, period, startDate, endDate);
            return ResponseEntity.ok(ranking);
        } catch (Exception e) {
            logger.error("Error getting agency ranking by fees: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().build();
        }
    }
    
    /**
     * Classement des services par nombre de transactions
     */
    @GetMapping("/services/transactions")
    public ResponseEntity<List<Map<String, Object>>> getServiceRankingByTransactions(
            @RequestParam(required = false) List<String> country,
            @RequestParam(required = false, defaultValue = "month") String period,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        try {
            List<Map<String, Object>> ranking = rankingService.getServiceRankingByTransactions(country, period, startDate, endDate);
            return ResponseEntity.ok(ranking);
        } catch (Exception e) {
            logger.error("Error getting service ranking by transactions: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().build();
        }
    }
    
    /**
     * Classement des services par volume
     */
    @GetMapping("/services/volume")
    public ResponseEntity<List<Map<String, Object>>> getServiceRankingByVolume(
            @RequestParam(required = false) List<String> country,
            @RequestParam(required = false, defaultValue = "month") String period,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        try {
            List<Map<String, Object>> ranking = rankingService.getServiceRankingByVolume(country, period, startDate, endDate);
            return ResponseEntity.ok(ranking);
        } catch (Exception e) {
            logger.error("Error getting service ranking by volume: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().build();
        }
    }
    
    /**
     * Classement des services par frais
     */
    @GetMapping("/services/fees")
    public ResponseEntity<List<Map<String, Object>>> getServiceRankingByFees(
            @RequestParam(required = false) List<String> country,
            @RequestParam(required = false, defaultValue = "month") String period,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        try {
            List<Map<String, Object>> ranking = rankingService.getServiceRankingByFees(country, period, startDate, endDate);
            return ResponseEntity.ok(ranking);
        } catch (Exception e) {
            logger.error("Error getting service ranking by fees: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().build();
        }
    }
} 