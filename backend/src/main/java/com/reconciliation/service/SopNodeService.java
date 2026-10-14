package com.reconciliation.service;

import com.reconciliation.entity.SopNodeEntity;
import com.reconciliation.repository.SopNodeRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class SopNodeService {

    @Autowired
    private SopNodeRepository sopNodeRepository;

    /**
     * Récupère toute la structure SOP sous forme d'arbre
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getStructure() {
        try {
            log.info("📋 Récupération de la structure SOP...");
            List<SopNodeEntity> allNodes = new ArrayList<>();
            
            try {
                // Essayer d'abord avec findAll simple
                allNodes = sopNodeRepository.findAll();
                log.info("✅ {} nœuds chargés", allNodes.size());
            } catch (Exception e) {
                log.error("❌ Erreur lors du chargement des nœuds: {}", e.getMessage(), e);
                String errorMsg = e.getMessage() != null ? e.getMessage().toLowerCase() : "";
                // Si la table n'existe pas, initialiser la structure
                if (errorMsg.contains("doesn't exist") || errorMsg.contains("table") || 
                    errorMsg.contains("unknown table") || errorMsg.contains("table 'top20.sop_node' doesn't exist")) {
                    log.info("🔧 Table sop_node n'existe pas, initialisation...");
                    try {
                        initializeDefaultStructure();
                        allNodes = sopNodeRepository.findAll();
                    } catch (Exception initEx) {
                        log.error("❌ Erreur lors de l'initialisation: {}", initEx.getMessage(), initEx);
                        // Retourner la structure par défaut en mémoire
                        return getDefaultStructure();
                    }
                } else {
                    // Pour toute autre erreur, retourner la structure par défaut
                    log.warn("⚠️ Erreur inattendue, retour de la structure par défaut");
                    return getDefaultStructure();
                }
            }
            
            if (allNodes.isEmpty()) {
                // Si la base est vide, initialiser avec la structure par défaut
                log.info("🔧 Base de données vide, initialisation de la structure par défaut...");
                try {
                    initializeDefaultStructure();
                    allNodes = sopNodeRepository.findAll();
                } catch (Exception initEx) {
                    log.error("❌ Erreur lors de l'initialisation: {}", initEx.getMessage(), initEx);
                    return getDefaultStructure();
                }
            }
            
            // Construire l'arbre - retourner directement le nœud racine
            log.info("🌳 Construction de l'arbre avec {} nœuds...", allNodes.size());
            Map<String, Object> rootNode = buildTreeStructure(allNodes);
            log.info("✅ Structure construite avec succès");
            return rootNode;
        } catch (Exception e) {
            log.error("❌ Erreur lors de la récupération de la structure: {}", e.getMessage(), e);
            e.printStackTrace();
            // En cas d'erreur, retourner la structure par défaut
            return getDefaultStructure();
        }
    }
    
    /**
     * Retourne la structure par défaut en mémoire (fallback)
     */
    public Map<String, Object> getDefaultStructure() {
        log.info("📋 Retour de la structure par défaut en mémoire");
        Map<String, Object> root = new HashMap<>();
        root.put("id", "root");
        root.put("label", "Visualisation des SOP");
        
        List<Map<String, Object>> children = new ArrayList<>();
        
        // Back office
        Map<String, Object> backOffice = new HashMap<>();
        backOffice.put("id", "back-office");
        backOffice.put("label", "Back office");
        List<Map<String, Object>> backOfficeChildren = new ArrayList<>();
        
        // Métier (GU3)
        Map<String, Object> metierGu3 = new HashMap<>();
        metierGu3.put("id", "metier-gu3");
        metierGu3.put("label", "Métier (GU3)");
        metierGu3.put("children", List.of(
            Map.of("id", "appro-client-client", "label", "Appro client par client"),
            Map.of("id", "appro-client-ops", "label", "Appro client par OPS"),
            Map.of("id", "appro-fournisseur", "label", "Appro fournisseur"),
            Map.of("id", "compense-client-client", "label", "Compense client par le client"),
            Map.of("id", "compense-client-ops", "label", "Compense client par OPS"),
            Map.of("id", "compense-fournisseur", "label", "Compense Fournisseur"),
            Map.of("id", "transfert-uv-sous-compte", "label", "Transfert d'UV sous compte vers le compte"),
            Map.of("id", "transfert-uv-compte", "label", "Transfert d'UV compte vers le sous compte")
        ));
        backOfficeChildren.add(metierGu3);
        
        // Classique
        Map<String, Object> classique = new HashMap<>();
        classique.put("id", "classique");
        classique.put("label", "Classique");
        classique.put("children", List.of(
            Map.of("id", "appro-client-classique", "label", "Appro client par le client"),
            Map.of("id", "appro-client-ops-classique", "label", "Appro client par OPS"),
            Map.of("id", "appro-fournisseur-classique", "label", "Appro fournisseur"),
            Map.of("id", "compense-client-classique", "label", "Compense client"),
            Map.of("id", "compense-fournisseur-classique", "label", "Compense Fournisseur")
        ));
        backOfficeChildren.add(classique);
        
        // GU2
        Map<String, Object> gu2 = new HashMap<>();
        gu2.put("id", "gu2");
        gu2.put("label", "GU2");
        gu2.put("children", List.of(
            Map.of("id", "appro-client-gu2", "label", "Appro client"),
            Map.of("id", "compense-client-gu2", "label", "Compense client"),
            Map.of("id", "transfert-uv-sous-compte-gu2", "label", "Transfert d'UV sous compte vers le compte"),
            Map.of("id", "transfert-uv-compte-gu2", "label", "Transfert d'UV compte vers le sous compte")
        ));
        backOfficeChildren.add(gu2);
        
        backOffice.put("children", backOfficeChildren);
        children.add(backOffice);
        
        // Autres
        Map<String, Object> autres = new HashMap<>();
        autres.put("id", "autres");
        autres.put("label", "Autres");
        List<Map<String, Object>> autresChildren = new ArrayList<>();
        
        // Annulation
        Map<String, Object> annulation = new HashMap<>();
        annulation.put("id", "annulation");
        annulation.put("label", "Annulation");
        annulation.put("children", List.of(
            Map.of("id", "annulation-operation", "label", "Annulation Opération (tous les BO)"),
            Map.of("id", "annulation-transaction-metier", "label", "Annulation transaction BO métier"),
            Map.of("id", "annulation-transaction-classique", "label", "Annulation transaction BO Classique")
        ));
        autresChildren.add(annulation);
        
        // Transfert UV inter filiale
        Map<String, Object> transfertUv = new HashMap<>();
        transfertUv.put("id", "transfert-uv-inter-filiale");
        transfertUv.put("label", "Transfert d'UV inter filiale");
        transfertUv.put("children", List.of(
            Map.of("id", "virement-bancaire", "label", "Via une virement bancaire"),
            Map.of("id", "service-touchpoint", "label", "Via le service TOUCHPOINT")
        ));
        autresChildren.add(transfertUv);
        
        // Ajustement et Memo
        Map<String, Object> ajustementMemo = new HashMap<>();
        ajustementMemo.put("id", "ajustement-memo");
        ajustementMemo.put("label", "L'usage de la fonctionnalité Ajustement et Memo");
        ajustementMemo.put("children", List.of(
            Map.of("id", "ajustement-solde", "label", "Ajustement de solde (Classique)"),
            Map.of("id", "utilisation-memo", "label", "L'utilisation d'un Memo (tous les BO)")
        ));
        autresChildren.add(ajustementMemo);
        
        // Problème technique
        Map<String, Object> problemeTech = new HashMap<>();
        problemeTech.put("id", "probleme-technique");
        problemeTech.put("label", "Problème technique et anomalie REC");
        problemeTech.put("children", List.of(
            Map.of("id", "correction-anomalie", "label", "Correction anomalie Réconciliation (tous les BO)"),
            Map.of("id", "probleme-technique-ops", "label", "Problème technique lié au traitement des OPS (tous les BO)")
        ));
        autresChildren.add(problemeTech);
        
        autres.put("children", autresChildren);
        children.add(autres);
        
        root.put("children", children);
        return root;
    }

    /**
     * Construit la structure d'arbre à partir de la liste plate de nœuds
     */
    private Map<String, Object> buildTreeStructure(List<SopNodeEntity> allNodes) {
        // Créer une map pour accès rapide par ID
        Map<Long, SopNodeEntity> nodeMap = allNodes.stream()
            .collect(Collectors.toMap(SopNodeEntity::getId, node -> node));
        
        // Trouver le nœud racine (celui avec nodeId = "root")
        SopNodeEntity rootEntity = allNodes.stream()
            .filter(node -> "root".equals(node.getNodeId()))
            .findFirst()
            .orElse(null);
        
        if (rootEntity == null) {
            log.warn("⚠️ Nœud racine non trouvé");
            return Collections.emptyMap();
        }
        
        // Construire l'arbre récursivement
        return buildNodeMap(rootEntity, allNodes);
    }

    /**
     * Construit un nœud et ses enfants récursivement
     */
    private Map<String, Object> buildNodeMap(SopNodeEntity entity, List<SopNodeEntity> allNodes) {
        Map<String, Object> nodeMap = new HashMap<>();
        nodeMap.put("id", entity.getNodeId());
        nodeMap.put("label", entity.getLabel());
        
        if (entity.getRoute() != null) {
            nodeMap.put("route", entity.getRoute());
        }
        if (entity.getDescription() != null) {
            nodeMap.put("description", entity.getDescription());
        }
        
        // Trouver les enfants - utiliser l'ID de l'entité parent pour éviter les problèmes de lazy loading
        Long entityId = entity.getId();
        List<SopNodeEntity> children = new ArrayList<>();
        
        for (SopNodeEntity node : allNodes) {
            try {
                SopNodeEntity parent = node.getParent();
                if (parent != null && parent.getId() != null && parent.getId().equals(entityId)) {
                    children.add(node);
                }
            } catch (Exception e) {
                // Ignorer les erreurs de lazy loading pour ce nœud
                log.debug("⚠️ Impossible de charger le parent pour le nœud {}: {}", node.getNodeId(), e.getMessage());
            }
        }
        
        children.sort(Comparator.comparing(SopNodeEntity::getDisplayOrder));
        
        if (!children.isEmpty()) {
            List<Map<String, Object>> childrenList = new ArrayList<>();
            for (SopNodeEntity child : children) {
                try {
                    childrenList.add(buildNodeMap(child, allNodes));
                } catch (Exception e) {
                    log.warn("⚠️ Erreur lors de la construction du nœud enfant {}: {}", child.getNodeId(), e.getMessage());
                }
            }
            nodeMap.put("children", childrenList);
        }
        
        return nodeMap;
    }

    /**
     * Crée un nouveau nœud
     */
    @Transactional
    public SopNodeEntity createNode(String nodeId, String label, String parentNodeId, Integer displayOrder) {
        log.info("📝 Création nœud - nodeId: {}, label: {}, parentNodeId: {}", nodeId, label, parentNodeId);
        
        if (sopNodeRepository.existsByNodeId(nodeId)) {
            throw new IllegalArgumentException("Un nœud avec l'ID '" + nodeId + "' existe déjà");
        }
        
        SopNodeEntity node = new SopNodeEntity();
        node.setNodeId(nodeId);
        node.setLabel(label);
        
        if (parentNodeId != null && !parentNodeId.isEmpty()) {
            SopNodeEntity parent = sopNodeRepository.findByNodeId(parentNodeId)
                .orElseThrow(() -> new IllegalArgumentException("Parent avec nodeId '" + parentNodeId + "' non trouvé"));
            node.setParent(parent);
        }
        
        if (displayOrder == null) {
            // Déterminer l'ordre d'affichage automatiquement
            List<SopNodeEntity> siblings;
            if (parentNodeId != null && !parentNodeId.isEmpty()) {
                SopNodeEntity parent = sopNodeRepository.findByNodeId(parentNodeId).orElse(null);
                siblings = parent != null ? sopNodeRepository.findByParentOrderByDisplayOrderAsc(parent) : new ArrayList<>();
            } else {
                siblings = sopNodeRepository.findByParentIsNullOrderByDisplayOrderAsc();
            }
            displayOrder = siblings.isEmpty() ? 0 : siblings.size();
        }
        node.setDisplayOrder(displayOrder);
        
        SopNodeEntity saved = sopNodeRepository.save(node);
        log.info("✅ Nœud créé avec ID: {}", saved.getId());
        return saved;
    }

    /**
     * Met à jour un nœud existant
     */
    @Transactional
    public SopNodeEntity updateNode(String nodeId, String label, String route, String description) {
        try {
            log.info("📝 Mise à jour nœud - nodeId: {}, label: {}", nodeId, label);
            
            SopNodeEntity node = sopNodeRepository.findByNodeId(nodeId)
                .orElseThrow(() -> new IllegalArgumentException("Nœud avec nodeId '" + nodeId + "' non trouvé"));
            
            if (label != null && !label.trim().isEmpty()) {
                node.setLabel(label.trim());
            }
            
            if (route != null) {
                node.setRoute(route);
            }
            
            if (description != null) {
                node.setDescription(description);
            }
            
            SopNodeEntity saved = sopNodeRepository.save(node);
            log.info("✅ Nœud mis à jour avec ID: {}", saved.getId());
            return saved;
        } catch (Exception e) {
            log.error("❌ Erreur lors de la mise à jour du nœud {}: {}", nodeId, e.getMessage(), e);
            throw e;
        }
    }

    /**
     * Supprime un nœud et tous ses enfants récursivement
     */
    @Transactional
    public boolean deleteNode(String nodeId) {
        log.info("🗑️ Suppression nœud - nodeId: {}", nodeId);
        
        SopNodeEntity node = sopNodeRepository.findByNodeId(nodeId)
            .orElseThrow(() -> new IllegalArgumentException("Nœud avec nodeId '" + nodeId + "' non trouvé"));
        
        // Supprimer récursivement tous les enfants
        deleteNodeRecursive(node);
        
        log.info("✅ Nœud supprimé: {}", nodeId);
        return true;
    }

    /**
     * Supprime un nœud et tous ses enfants récursivement
     */
    private void deleteNodeRecursive(SopNodeEntity node) {
        // Récupérer tous les enfants
        List<SopNodeEntity> children = sopNodeRepository.findByParentOrderByDisplayOrderAsc(node);
        
        // Supprimer récursivement chaque enfant
        for (SopNodeEntity child : children) {
            deleteNodeRecursive(child);
        }
        
        // Supprimer le nœud lui-même
        sopNodeRepository.delete(node);
    }

    /**
     * Initialise la structure par défaut si la base est vide
     */
    @Transactional
    public void initializeDefaultStructure() {
        log.info("🔧 Initialisation de la structure SOP par défaut");
        
        // Créer le nœud racine
        SopNodeEntity root = new SopNodeEntity();
        root.setNodeId("root");
        root.setLabel("Visualisation des SOP");
        root.setDisplayOrder(0);
        root = sopNodeRepository.save(root);
        
        // Créer les nœuds de premier niveau
        SopNodeEntity backOffice = createChildNode(root, "back-office", "Back office", 0);
        SopNodeEntity autres = createChildNode(root, "autres", "Autres", 1);
        
        // Créer les enfants de Back office
        SopNodeEntity metierGu3 = createChildNode(backOffice, "metier-gu3", "Métier (GU3)", 0);
        SopNodeEntity classique = createChildNode(backOffice, "classique", "Classique", 1);
        SopNodeEntity gu2 = createChildNode(backOffice, "gu2", "GU2", 2);
        
        // Créer les enfants de Métier (GU3)
        createChildNode(metierGu3, "appro-client-client", "Appro client par client", 0);
        createChildNode(metierGu3, "appro-client-ops", "Appro client par OPS", 1);
        createChildNode(metierGu3, "appro-fournisseur", "Appro fournisseur", 2);
        createChildNode(metierGu3, "compense-client-client", "Compense client par le client", 3);
        createChildNode(metierGu3, "compense-client-ops", "Compense client par OPS", 4);
        createChildNode(metierGu3, "compense-fournisseur", "Compense Fournisseur", 5);
        createChildNode(metierGu3, "transfert-uv-sous-compte", "Transfert d'UV sous compte vers le compte", 6);
        createChildNode(metierGu3, "transfert-uv-compte", "Transfert d'UV compte vers le sous compte", 7);
        
        // Créer les enfants de Classique
        createChildNode(classique, "appro-client-classique", "Appro client par le client", 0);
        createChildNode(classique, "appro-client-ops-classique", "Appro client par OPS", 1);
        createChildNode(classique, "appro-fournisseur-classique", "Appro fournisseur", 2);
        createChildNode(classique, "compense-client-classique", "Compense client", 3);
        createChildNode(classique, "compense-fournisseur-classique", "Compense Fournisseur", 4);
        
        // Créer les enfants de GU2
        createChildNode(gu2, "appro-client-gu2", "Appro client", 0);
        createChildNode(gu2, "compense-client-gu2", "Compense client", 1);
        createChildNode(gu2, "transfert-uv-sous-compte-gu2", "Transfert d'UV sous compte vers le compte", 2);
        createChildNode(gu2, "transfert-uv-compte-gu2", "Transfert d'UV compte vers le sous compte", 3);
        
        // Créer les enfants de Autres
        SopNodeEntity annulation = createChildNode(autres, "annulation", "Annulation", 0);
        SopNodeEntity transfertUvInterFiliale = createChildNode(autres, "transfert-uv-inter-filiale", "Transfert d'UV inter filiale", 1);
        SopNodeEntity ajustementMemo = createChildNode(autres, "ajustement-memo", "L'usage de la fonctionnalité Ajustement et Memo", 2);
        SopNodeEntity problemeTechnique = createChildNode(autres, "probleme-technique", "Problème technique et anomalie REC", 3);
        
        // Créer les enfants de Annulation
        createChildNode(annulation, "annulation-operation", "Annulation Opération (tous les BO)", 0);
        createChildNode(annulation, "annulation-transaction-metier", "Annulation transaction BO métier", 1);
        createChildNode(annulation, "annulation-transaction-classique", "Annulation transaction BO Classique", 2);
        
        // Créer les enfants de Transfert d'UV inter filiale
        createChildNode(transfertUvInterFiliale, "virement-bancaire", "Via une virement bancaire", 0);
        createChildNode(transfertUvInterFiliale, "service-touchpoint", "Via le service TOUCHPOINT", 1);
        
        // Créer les enfants de Ajustement et Memo
        createChildNode(ajustementMemo, "ajustement-solde", "Ajustement de solde (Classique)", 0);
        createChildNode(ajustementMemo, "utilisation-memo", "L'utilisation d'un Memo (tous les BO)", 1);
        
        // Créer les enfants de Problème technique
        createChildNode(problemeTechnique, "correction-anomalie", "Correction anomalie Réconciliation (tous les BO)", 0);
        createChildNode(problemeTechnique, "probleme-technique-ops", "Problème technique lié au traitement des OPS (tous les BO)", 1);
        
        log.info("✅ Structure SOP par défaut initialisée");
    }

    /**
     * Crée un nœud enfant
     */
    private SopNodeEntity createChildNode(SopNodeEntity parent, String nodeId, String label, Integer displayOrder) {
        SopNodeEntity node = new SopNodeEntity();
        node.setNodeId(nodeId);
        node.setLabel(label);
        node.setParent(parent);
        node.setDisplayOrder(displayOrder);
        return sopNodeRepository.save(node);
    }
}

