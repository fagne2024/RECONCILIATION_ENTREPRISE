package com.reconciliation.service;

import com.reconciliation.entity.NavigationLabelAuditEntity;
import com.reconciliation.repository.NavigationLabelAuditRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Service
public class NavigationLabelAuditService {

    @Autowired
    private NavigationLabelAuditRepository auditRepository;

    @Transactional
    public void logChange(String labelId, String labelType, String groupKey, 
                          String submenuKey, String nestedKey,
                          String oldLabel, String newLabel, 
                          String username, String actionType, String detail) {
        NavigationLabelAuditEntity audit = new NavigationLabelAuditEntity();
        audit.setLabelId(labelId);
        audit.setLabelType(labelType);
        audit.setGroupKey(groupKey);
        audit.setSubmenuKey(submenuKey);
        audit.setNestedKey(nestedKey);
        audit.setOldLabel(oldLabel);
        audit.setNewLabel(newLabel);
        audit.setUsername(username);
        audit.setActionType(actionType);
        audit.setDetail(detail);
        audit.setCreatedAt(LocalDateTime.now());
        auditRepository.save(audit);
    }

    public List<NavigationLabelAuditEntity> getHistoryForLabel(String labelId) {
        return auditRepository.findByLabelIdOrderByCreatedAtAsc(labelId);
    }

    public List<NavigationLabelAuditEntity> getHistoryForGroup(String groupKey) {
        return auditRepository.findByGroupKeyOrderByCreatedAtAsc(groupKey);
    }

    public List<NavigationLabelAuditEntity> getAllHistory() {
        return auditRepository.findAllByOrderByCreatedAtDesc();
    }

    public List<NavigationLabelAuditEntity> getHistoryByUser(String username) {
        return auditRepository.findByUsernameOrderByCreatedAtAsc(username);
    }
}