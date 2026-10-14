package com.reconciliation.controller;

import com.reconciliation.entity.PlatformAuditLogEntity;
import com.reconciliation.service.PlatformAuditService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Consultation du journal des actions de la plateforme - reservee au
 * SUPER_ADMIN.
 */
@RestController
@RequestMapping("/api/platform/audit-logs")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class PlatformAuditController {

    private final PlatformAuditService platformAuditService;

    public PlatformAuditController(PlatformAuditService platformAuditService) {
        this.platformAuditService = platformAuditService;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> list(
            @RequestParam(name = "limit", defaultValue = "20") int limit,
            @RequestParam(name = "offset", defaultValue = "0") int offset,
            @RequestParam(name = "search", required = false) String search,
            @RequestParam(name = "action", required = false) String action) {

        int page = 0;
        if (limit <= 0) {
            limit = 20;
        }
        if (offset > 0) {
            page = offset / limit;
        }

        String q = (search == null || search.isBlank()) ? null : search.trim();
        String act = (action == null || action.isBlank()) ? null : action.trim();

        org.springframework.data.domain.Page<PlatformAuditLogEntity> p = platformAuditService.search(act, q,
                org.springframework.data.domain.PageRequest.of(page, limit));
        List<Map<String, Object>> content = p.getContent().stream()
                .map(PlatformAuditController::toView)
                .collect(Collectors.toList());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("content", content);
        body.put("totalElements", p.getTotalElements());
        body.put("totalPages", p.getTotalPages());
        body.put("size", p.getSize());
        body.put("number", p.getNumber());
        return ResponseEntity.ok(body);
    }

    private static Map<String, Object> toView(PlatformAuditLogEntity entry) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("id", entry.getId());
        view.put("actorUsername", entry.getActorUsername());
        view.put("action", entry.getAction());
        view.put("targetType", entry.getTargetType());
        view.put("targetId", entry.getTargetId());
        view.put("details", entry.getDetails());
        view.put("createdAt", entry.getCreatedAt());
        return view;
    }
}
