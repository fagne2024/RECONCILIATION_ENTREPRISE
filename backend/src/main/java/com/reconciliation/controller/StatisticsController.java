package com.reconciliation.controller;

import com.reconciliation.model.Statistics;
import com.reconciliation.service.StatisticsService;
import com.reconciliation.util.RequestContextUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/statistics")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"}, allowCredentials = "true")
public class StatisticsController {
    private static final Logger logger = LoggerFactory.getLogger(StatisticsController.class);
    
    private final StatisticsService statisticsService;

    @Autowired
    public StatisticsController(StatisticsService statisticsService) {
        this.statisticsService = statisticsService;
    }

    @PostMapping("/save")
    public ResponseEntity<?> saveStatistics(@RequestBody List<Statistics> statistics, HttpServletRequest request) {
        try {
            if (statistics == null || statistics.isEmpty()) {
                return ResponseEntity.badRequest().body("La liste des statistiques ne peut pas être vide");
            }

            List<Statistics> savedStats = statisticsService.saveStatistics(statistics);
            return ResponseEntity.ok(savedStats);
        } catch (Exception e) {
            logger.error("Error saving statistics: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError()
                .body("Échec de l'enregistrement des statistiques : " + e.getMessage());
        }
    }

    @GetMapping("/by-date")
    public ResponseEntity<?> getStatisticsByDate(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            HttpServletRequest request) {
        try {
            String username = RequestContextUtil.getUsernameFromRequest();
            List<Statistics> stats = statisticsService.getStatisticsByDate(date, username);
            return ResponseEntity.ok(stats);
        } catch (Exception e) {
            logger.error("Error fetching statistics by date {}: {}", date, e.getMessage(), e);
            return ResponseEntity.internalServerError()
                .body("Échec de la récupération des statistiques : " + e.getMessage());
        }
    }

    @GetMapping("/by-filters")
    public ResponseEntity<?> getStatisticsByFilters(
            @RequestParam(required = false) String agency,
            @RequestParam(required = false) String service,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            HttpServletRequest request) {
        try {
            String username = RequestContextUtil.getUsernameFromRequest();
            List<Statistics> stats = statisticsService.getStatisticsByFilters(agency, service, startDate, endDate, username);
            return ResponseEntity.ok(stats);
        } catch (Exception e) {
            logger.error("Error fetching statistics with filters: {}", e.getMessage(), e);
            e.printStackTrace();
            return ResponseEntity.internalServerError()
                .body("Échec de la récupération des statistiques : " + e.getMessage());
        }
    }

    @GetMapping("/dashboard-metrics")
    public ResponseEntity<?> getDashboardMetrics(
            @RequestParam(required = false, defaultValue = "semaine") String period,
            HttpServletRequest request) {
        logger.info("=== DASHBOARD METRICS REQUEST RECEIVED ===");
        logger.info("Method: {}", request.getMethod());
        logger.info("Origin: {}", request.getHeader("Origin"));
        
        try {
            String username = RequestContextUtil.getUsernameFromRequest();
            Map<String, Object> metrics = statisticsService.getDashboardMetrics(username, period);
            logger.info("Dashboard metrics calculated successfully");
            return ResponseEntity.ok(metrics);
        } catch (Exception e) {
            logger.error("Error fetching dashboard metrics: {}", e.getMessage(), e);
            e.printStackTrace();
            return ResponseEntity.internalServerError()
                .body("Échec de la récupération des métriques du tableau de bord : " + e.getMessage());
        }
    }

    @GetMapping("/filter-options")
    public ResponseEntity<?> getFilterOptions(HttpServletRequest request) {
        try {
            String username = RequestContextUtil.getUsernameFromRequest();
            Map<String, Object> filterOptions = statisticsService.getFilterOptions(username);
            return ResponseEntity.ok(filterOptions);
        } catch (Exception e) {
            logger.error("Error fetching filter options: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError()
                .body("Échec de la récupération des options de filtre : " + e.getMessage());
        }
    }

    @GetMapping("/detailed-metrics")
    public ResponseEntity<?> getDetailedMetrics(
            @RequestParam(required = false) List<String> agency,
            @RequestParam(required = false) List<String> service,
            @RequestParam(required = false) List<String> country,
            @RequestParam(required = false) String timeFilter,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            HttpServletRequest request) {
        try {
            String username = RequestContextUtil.getUsernameFromRequest();
            Map<String, Object> metrics = statisticsService.getDetailedMetrics(agency, service, country, timeFilter, startDate, endDate, username);
            return ResponseEntity.ok(metrics);
        } catch (Exception e) {
            logger.error("Error fetching detailed metrics: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError()
                .body("Échec de la récupération des métriques détaillées : " + e.getMessage());
        }
    }

    @GetMapping("/transaction-created-stats")
    public ResponseEntity<?> getTransactionCreatedStatsByService(
            @RequestParam(required = false) List<String> agency,
            @RequestParam(required = false) List<String> service,
            @RequestParam(required = false) List<String> country,
            @RequestParam(required = false) String timeFilter,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            HttpServletRequest request) {
        try {
            String username = RequestContextUtil.getUsernameFromRequest();
            Map<String, Object> stats = statisticsService.getTransactionCreatedStatsByService(agency, service, country, timeFilter, startDate, endDate, username);
            return ResponseEntity.ok(stats);
        } catch (Exception e) {
            logger.error("Error fetching transaction created stats: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError()
                .body("Échec de la récupération des statistiques de transactions créées : " + e.getMessage());
        }
    }
} 