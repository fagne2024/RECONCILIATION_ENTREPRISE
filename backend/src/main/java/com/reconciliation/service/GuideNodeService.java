package com.reconciliation.service;

import com.reconciliation.entity.GuideNodeEntity;
import com.reconciliation.repository.GuideNodeRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.annotation.PostConstruct;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class GuideNodeService {

    @Autowired
    private GuideNodeRepository guideNodeRepository;

    /**
     * Initialise automatiquement le nœud racine au démarrage si nécessaire
     */
    @PostConstruct
    public void init() {
        // Initialisation technique : rattachee a l'entreprise historique.
        com.reconciliation.tenant.TenantContext.runAs(
            com.reconciliation.tenant.TenantContext.HISTORIQUE_ENTREPRISE_ID, () -> {
                try {
                    boolean rootExists = guideNodeRepository.existsByNodeId("root");
                    if (!rootExists) {
                        initializeDefaultStructure();
                    }
                } catch (Exception e) {
                    log.error("❌ Erreur lors de l'initialisation au démarrage: {}", e.getMessage(), e);
                }
            });
    }

    /**
     * Récupère toute la structure des guides sous forme d'arbre
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getStructure() {
        try {
            log.info("🔍 Récupération de la structure des guides...");
            
            boolean rootExists = guideNodeRepository.existsByNodeId("root");
            log.info("📌 Nœud racine existe: {}", rootExists);
            
            if (!rootExists) {
                log.warn("⚠️ Nœud racine non trouvé, utilisation de la structure par défaut");
                return getDefaultStructure();
            }
            
            List<GuideNodeEntity> allNodes = guideNodeRepository.findAll();
            log.info("📊 Nombre total de nœuds trouvés: {}", allNodes.size());
            
            if (allNodes.isEmpty()) {
                log.warn("⚠️ Aucun nœud trouvé, utilisation de la structure par défaut");
                return getDefaultStructure();
            }
            
            // Afficher tous les nœuds pour debug
            for (GuideNodeEntity node : allNodes) {
                Long parentId = (node.getParent() != null) ? node.getParent().getId() : null;
                String parentNodeId = (node.getParent() != null) ? node.getParent().getNodeId() : "NULL";
                log.info("📄 Nœud: id={}, nodeId={}, label={}, parentId={}, parentNodeId={}", 
                    node.getId(), node.getNodeId(), node.getLabel(), parentId, parentNodeId);
            }
            
            Map<String, Object> structure = buildTreeStructure(allNodes);
            log.info("✅ Structure construite avec succès");
            
            return structure;
        } catch (Exception e) {
            log.error("❌ Erreur lors de la récupération de la structure: {}", e.getMessage(), e);
            return getDefaultStructure();
        }
    }
    
    /**
     * Retourne la structure par défaut en mémoire (fallback)
     */
    public Map<String, Object> getDefaultStructure() {
        Map<String, Object> root = new HashMap<>();
        root.put("id", "root");
        root.put("label", "Visualisation des Guides");
        root.put("children", new ArrayList<>());
        return root;
    }

    /**
     * Construit la structure d'arbre à partir de la liste plate de nœuds
     */
    private Map<String, Object> buildTreeStructure(List<GuideNodeEntity> allNodes) {
        GuideNodeEntity rootEntity = allNodes.stream()
            .filter(node -> "root".equals(node.getNodeId()))
            .findFirst()
            .orElse(null);
        
        if (rootEntity == null) {
            log.warn("⚠️ Nœud racine non trouvé");
            return Collections.emptyMap();
        }
        
        return buildNodeMap(rootEntity, allNodes);
    }

    /**
     * Construit un nœud et ses enfants récursivement
     */
    private Map<String, Object> buildNodeMap(GuideNodeEntity entity, List<GuideNodeEntity> allNodes) {
        Map<String, Object> nodeMap = new HashMap<>();
        nodeMap.put("id", entity.getNodeId());
        nodeMap.put("label", entity.getLabel());
        
        if (entity.getRoute() != null) {
            nodeMap.put("route", entity.getRoute());
        }
        if (entity.getDescription() != null) {
            nodeMap.put("description", entity.getDescription());
        }
        
        Long entityId = entity.getId();
        List<GuideNodeEntity> children = new ArrayList<>();
        
        // Trouver les enfants de ce nœud en comparant les parent_id
        for (GuideNodeEntity node : allNodes) {
            try {
                // Ignorer le nœud lui-même
                if (node.getId().equals(entityId)) {
                    continue;
                }
                
                // Vérifier si ce nœud est un enfant
                GuideNodeEntity parent = node.getParent();
                Long nodeParentId = (parent != null) ? parent.getId() : null;
                
                if (nodeParentId != null && nodeParentId.equals(entityId)) {
                    children.add(node);
                    log.debug("📎 Nœud enfant trouvé: {} (parent: {})", node.getNodeId(), entity.getNodeId());
                }
            } catch (Exception e) {
                log.warn("⚠️ Erreur lors de la vérification du parent pour le nœud {}: {}", node.getNodeId(), e.getMessage());
            }
        }
        
        children.sort(Comparator.comparing(GuideNodeEntity::getDisplayOrder));
        
        log.debug("👶 Nœud '{}' a {} enfant(s)", entity.getNodeId(), children.size());
        
        if (!children.isEmpty()) {
            List<Map<String, Object>> childrenList = new ArrayList<>();
            for (GuideNodeEntity child : children) {
                try {
                    childrenList.add(buildNodeMap(child, allNodes));
                } catch (Exception e) {
                    log.warn("⚠️ Erreur lors de la construction du nœud enfant {}: {}", child.getNodeId(), e.getMessage());
                }
            }
            nodeMap.put("children", childrenList);
        } else {
            // Toujours inclure un tableau children vide
            nodeMap.put("children", new ArrayList<>());
        }
        
        return nodeMap;
    }

    /**
     * Crée un nouveau nœud de guide
     */
    @Transactional
    public GuideNodeEntity createNode(String nodeId, String label, String parentNodeId, Integer displayOrder) {
        log.info("📝 Création d'un nouveau guide: nodeId={}, label={}, parentNodeId={}", nodeId, label, parentNodeId);
        
        if (guideNodeRepository.existsByNodeId(nodeId)) {
            throw new IllegalArgumentException("Un guide avec l'ID '" + nodeId + "' existe déjà");
        }
        
        GuideNodeEntity node = new GuideNodeEntity();
        node.setNodeId(nodeId);
        node.setLabel(label);
        
        // CORRECTION: Si parentNodeId est null ou vide, utiliser 'root' par défaut
        final String effectiveParentNodeId;
        if (parentNodeId == null || parentNodeId.trim().isEmpty()) {
            log.info("⚠️ Aucun parent spécifié, utilisation du nœud racine par défaut");
            effectiveParentNodeId = "root";
        } else {
            effectiveParentNodeId = parentNodeId;
        }
        
        GuideNodeEntity parent = guideNodeRepository.findByNodeId(effectiveParentNodeId)
            .orElseThrow(() -> new IllegalArgumentException("Parent avec nodeId '" + effectiveParentNodeId + "' non trouvé"));
        node.setParent(parent);
        log.info("✅ Parent défini: {} (id={})", parent.getNodeId(), parent.getId());
        
        if (displayOrder == null) {
            List<GuideNodeEntity> siblings = guideNodeRepository.findByParentOrderByDisplayOrderAsc(parent);
            displayOrder = siblings.isEmpty() ? 0 : siblings.size();
            log.info("📊 Display order calculé: {}", displayOrder);
        }
        node.setDisplayOrder(displayOrder);
        
        GuideNodeEntity savedNode = guideNodeRepository.save(node);
        log.info("✅ Guide créé avec succès: id={}, nodeId={}", savedNode.getId(), savedNode.getNodeId());
        
        return savedNode;
    }

    /**
     * Met à jour un nœud existant
     */
    @Transactional
    public GuideNodeEntity updateNode(String nodeId, String label, String route, String description) {
        try {
            log.info("📝 Mise à jour nœud guide - nodeId: {}, label: {}", nodeId, label);
            
            GuideNodeEntity node = guideNodeRepository.findByNodeId(nodeId)
                .orElseThrow(() -> new IllegalArgumentException("Guide avec nodeId '" + nodeId + "' non trouvé"));
            
            if (label != null && !label.trim().isEmpty()) {
                node.setLabel(label.trim());
            }
            
            if (route != null) {
                node.setRoute(route);
            }
            
            if (description != null) {
                node.setDescription(description);
            }
            
            GuideNodeEntity saved = guideNodeRepository.save(node);
            log.info("✅ Nœud guide mis à jour avec ID: {}", saved.getId());
            return saved;
        } catch (Exception e) {
            log.error("❌ Erreur lors de la mise à jour du guide {}: {}", nodeId, e.getMessage(), e);
            throw e;
        }
    }

    /**
     * Supprime un nœud et tous ses enfants récursivement
     */
    @Transactional
    public boolean deleteNode(String nodeId) {
        GuideNodeEntity node = guideNodeRepository.findByNodeId(nodeId)
            .orElseThrow(() -> new IllegalArgumentException("Guide avec nodeId '" + nodeId + "' non trouvé"));
        
        deleteNodeRecursive(node);
        return true;
    }

    /**
     * Supprime un nœud et tous ses enfants récursivement
     */
    private void deleteNodeRecursive(GuideNodeEntity node) {
        List<GuideNodeEntity> children = guideNodeRepository.findByParentOrderByDisplayOrderAsc(node);
        
        for (GuideNodeEntity child : children) {
            deleteNodeRecursive(child);
        }
        
        guideNodeRepository.delete(node);
    }

    /**
     * Initialise la structure par défaut si la base est vide
     */
    @Transactional
    public void initializeDefaultStructure() {
        GuideNodeEntity root = guideNodeRepository.findByNodeId("root").orElse(null);
        
        if (root == null) {
            root = new GuideNodeEntity();
            root.setNodeId("root");
            root.setLabel("Visualisation des Guides");
            root.setDisplayOrder(0);
            root = guideNodeRepository.save(root);
        }
        
        // Attacher tous les nœuds orphelins au nœud racine
        List<GuideNodeEntity> orphans = guideNodeRepository.findByParentIsNullOrderByDisplayOrderAsc();
        for (GuideNodeEntity orphan : orphans) {
            if (!"root".equals(orphan.getNodeId())) {
                orphan.setParent(root);
                guideNodeRepository.save(orphan);
            }
        }
    }

    /**
     * Crée un nœud enfant
     */
    private GuideNodeEntity createChildNode(GuideNodeEntity parent, String nodeId, String label, Integer displayOrder) {
        GuideNodeEntity node = new GuideNodeEntity();
        node.setNodeId(nodeId);
        node.setLabel(label);
        node.setParent(parent);
        node.setDisplayOrder(displayOrder);
        return guideNodeRepository.save(node);
    }

    /**
     * Corrige les nœuds orphelins en les attachant au nœud racine
     */
    @Transactional
    public int fixOrphanNodes() {
        try {
            log.info("🔍 Recherche des nœuds orphelins...");
            
            // Récupérer le nœud racine
            GuideNodeEntity root = guideNodeRepository.findByNodeId("root")
                .orElseThrow(() -> new IllegalStateException("Nœud racine non trouvé"));
            
            log.info("✅ Nœud racine trouvé: id={}", root.getId());
            
            // Trouver tous les nœuds orphelins (sauf root)
            List<GuideNodeEntity> orphans = guideNodeRepository.findByParentIsNullOrderByDisplayOrderAsc();
            
            int fixedCount = 0;
            for (GuideNodeEntity orphan : orphans) {
                if (!"root".equals(orphan.getNodeId())) {
                    log.info("🔧 Correction du nœud orphelin: {} (id={})", orphan.getLabel(), orphan.getId());
                    orphan.setParent(root);
                    guideNodeRepository.save(orphan);
                    fixedCount++;
                }
            }
            
            log.info("✅ {} nœud(s) orphelin(s) corrigé(s)", fixedCount);
            return fixedCount;
            
        } catch (Exception e) {
            log.error("❌ Erreur lors de la correction des orphelins: {}", e.getMessage(), e);
            throw e;
        }
    }

    /**
     * Obtient des informations de diagnostic sur la structure des guides
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getDiagnostic() {
        Map<String, Object> diagnostic = new HashMap<>();
        
        try {
            // Vérifier si le nœud racine existe
            boolean rootExists = guideNodeRepository.existsByNodeId("root");
            diagnostic.put("rootExists", rootExists);
            
            // Compter le nombre total de nœuds
            long totalNodes = guideNodeRepository.count();
            diagnostic.put("totalNodes", totalNodes);
            
            // Récupérer tous les nœuds
            List<GuideNodeEntity> allNodes = guideNodeRepository.findAll();
            diagnostic.put("allNodesCount", allNodes.size());
            
            // Lister tous les nœuds avec leurs détails
            List<Map<String, Object>> nodesList = new ArrayList<>();
            for (GuideNodeEntity node : allNodes) {
                Map<String, Object> nodeInfo = new HashMap<>();
                nodeInfo.put("id", node.getId());
                nodeInfo.put("nodeId", node.getNodeId());
                nodeInfo.put("label", node.getLabel());
                nodeInfo.put("parentId", node.getParent() != null ? node.getParent().getId() : null);
                nodeInfo.put("parentNodeId", node.getParent() != null ? node.getParent().getNodeId() : null);
                nodeInfo.put("displayOrder", node.getDisplayOrder());
                nodesList.add(nodeInfo);
            }
            diagnostic.put("nodes", nodesList);
            
            // Compter les nœuds orphelins
            List<GuideNodeEntity> orphans = guideNodeRepository.findByParentIsNullOrderByDisplayOrderAsc();
            diagnostic.put("orphansCount", orphans.size());
            
            List<String> orphanNodeIds = orphans.stream()
                .map(GuideNodeEntity::getNodeId)
                .collect(Collectors.toList());
            diagnostic.put("orphanNodeIds", orphanNodeIds);
            
            diagnostic.put("status", "success");
            diagnostic.put("message", "Diagnostic complété avec succès");
            
        } catch (Exception e) {
            log.error("❌ Erreur lors du diagnostic: {}", e.getMessage(), e);
            diagnostic.put("status", "error");
            diagnostic.put("message", "Erreur lors du diagnostic: " + e.getMessage());
            diagnostic.put("error", e.getMessage());
        }
        
        return diagnostic;
    }
}
