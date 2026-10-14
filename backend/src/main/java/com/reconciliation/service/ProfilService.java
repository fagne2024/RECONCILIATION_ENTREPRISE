package com.reconciliation.service;

import com.reconciliation.entity.*;
import com.reconciliation.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import jakarta.persistence.EntityManager;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Optional;
import java.util.Map;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.Set;

@Service
public class ProfilService {
    @Autowired
    private ProfilRepository profilRepository;
    @Autowired
    private ModuleRepository moduleRepository;
    @Autowired
    private PermissionRepository permissionRepository;
    @Autowired
    private ProfilPermissionRepository profilPermissionRepository;
    @Autowired
    private ModulePermissionRepository modulePermissionRepository;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private ProfilPaysRepository profilPaysRepository;
    @Autowired
    private EntityManager entityManager;

    // CRUD Profil
    public List<ProfilEntity> getAllProfils() { return profilRepository.findAll(); }
    public Optional<ProfilEntity> getProfil(Long id) { return profilRepository.findById(id); }
    public ProfilEntity createProfil(ProfilEntity profil) { 
        return profilRepository.save(profil);
    }
    public ProfilEntity updateProfil(ProfilEntity profil) { 
        return profilRepository.save(profil);
    }
    @Transactional
    public void deleteProfil(Long id) {
        System.out.println("💾 Tentative de suppression du profil ID: " + id);

        if (!profilRepository.existsById(id)) {
            System.out.println("❌ Profil non trouvé avec l'ID: " + id);
            throw new RuntimeException("Profil non trouvé avec l'ID: " + id);
        }

        List<UserEntity> usersWithProfil = userRepository.findByProfilId(id);
        if (!usersWithProfil.isEmpty()) {
            System.out.println("❌ Impossible de supprimer le profil: " + usersWithProfil.size() + " utilisateur(s) l'utilisent");
            String usernames = usersWithProfil.stream()
                .map(UserEntity::getUsername)
                .limit(5)
                .reduce((a, b) -> a + ", " + b)
                .orElse("");
            String message = "Impossible de supprimer ce profil car il est utilisé par " + usersWithProfil.size() + " utilisateur(s)";
            if (usersWithProfil.size() <= 5) {
                message += " : " + usernames;
            } else {
                message += " (incluant : " + usernames + ", ...)";
            }
            message += ". Veuillez d'abord réassigner ces utilisateurs à un autre profil.";
            throw new RuntimeException(message);
        }

        System.out.println("✅ Profil trouvé, suppression des dépendances associées...");

        profilPermissionRepository.deleteByProfilId(id);
        System.out.println("🗑️ Permissions du profil supprimées");

        profilPaysRepository.deleteByProfilId(id);
        System.out.println("🗑️ Associations pays du profil supprimées");

        deleteProfilActionsIfTableExists(id);

        profilRepository.deleteById(id);
        System.out.println("✅ Profil supprimé avec succès: ID " + id);
    }

    private void deleteProfilActionsIfTableExists(Long profilId) {
        if (!databaseTableExists("profil_action")) {
            System.out.println("ℹ️ Table profil_action absente, aucune action à supprimer");
            return;
        }

        int deletedActions = entityManager.createNativeQuery("DELETE FROM profil_action WHERE profil_id = :profilId")
            .setParameter("profilId", profilId)
            .executeUpdate();
        System.out.println("🗑️ Suppression de " + deletedActions + " actions associées");
    }

    private boolean databaseTableExists(String tableName) {
        Number count = (Number) entityManager.createNativeQuery(
                "SELECT COUNT(*) FROM information_schema.tables " +
                "WHERE table_schema = DATABASE() AND table_name = :tableName")
            .setParameter("tableName", tableName)
            .getSingleResult();
        return count.longValue() > 0;
    }

    // Modules
    public List<ModuleEntity> getAllModules() { return moduleRepository.findAll(); }
    public ModuleEntity createModule(ModuleEntity module) { return moduleRepository.save(module); }
    public ModuleEntity updateModule(ModuleEntity module) { return moduleRepository.save(module); }
    @Transactional
    public void deleteModule(Long id) { 
        System.out.println("💾 Tentative de suppression du module ID: " + id);
        
        // Vérifier si le module existe
        if (!moduleRepository.existsById(id)) {
            System.out.println("❌ Module non trouvé avec l'ID: " + id);
            throw new RuntimeException("Module non trouvé avec l'ID: " + id);
        }
        
        System.out.println("✅ Module trouvé, suppression des permissions associées...");
        
        // Supprimer d'abord les permissions associées au module
        List<ProfilPermissionEntity> permissions = profilPermissionRepository.findByModuleId(id);
        
        System.out.println("🗑️ Suppression de " + permissions.size() + " permissions associées");
        profilPermissionRepository.deleteAll(permissions);
        
        // Supprimer les associations module-permission
        List<ModulePermissionEntity> modulePermissions = modulePermissionRepository.findByModuleId(id);
        System.out.println("🗑️ Suppression de " + modulePermissions.size() + " associations module-permission");
        modulePermissionRepository.deleteAll(modulePermissions);
        
        System.out.println("✅ Permissions supprimées, suppression du module...");
        
        moduleRepository.deleteById(id);
        System.out.println("✅ Module supprimé avec succès: ID " + id);
    }

    // Permissions
    public List<PermissionEntity> getAllPermissions() { return permissionRepository.findAll(); }
    public PermissionEntity createPermission(PermissionEntity permission) { return permissionRepository.save(permission); }
    
    @Transactional
    public void deletePermission(Long id) {
        // Vérifier si la permission existe
        PermissionEntity permission = permissionRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("Permission non trouvée avec l'ID: " + id));
        
        // Vérifier si la permission est utilisée dans des associations profil-permission-module
        // Charger toutes les associations et filtrer celles qui utilisent cette permission
        List<ProfilPermissionEntity> associations = profilPermissionRepository.findByPermissionId(id).stream()
            .filter(pp -> pp.getPermission() != null && pp.getPermission().getId() != null)
            .toList();
        
        if (!associations.isEmpty()) {
            throw new RuntimeException("Impossible de supprimer la permission '" + permission.getNom() + 
                "' car elle est utilisée dans " + associations.size() + " association(s) profil-module. " +
                "Veuillez d'abord supprimer ces associations.");
        }
        
        // Supprimer la permission
        permissionRepository.deleteById(id);
        System.out.println("✅ Permission '" + permission.getNom() + "' (ID: " + id + ") supprimée avec succès");
    }

    // Attribution de permissions à un profil
    @Transactional
    public ProfilPermissionEntity addPermissionToProfil(Long profilId, Long moduleId, Long permissionId) {
        ProfilPermissionEntity existing = profilPermissionRepository
            .findByProfilIdAndModuleIdAndPermissionId(profilId, moduleId, permissionId)
            .orElse(null);
        
        if (existing != null) {
            // Retourner l'existant avec ses relations chargées
            return existing;
        }
        
        ProfilEntity profil = profilRepository.findById(profilId).orElseThrow();
        ModuleEntity module = moduleRepository.findById(moduleId).orElseThrow();
        PermissionEntity permission = permissionRepository.findById(permissionId).orElseThrow();
        ProfilPermissionEntity pp = new ProfilPermissionEntity();
        pp.setProfil(profil);
        pp.setModule(module);
        pp.setPermission(permission);
        ProfilPermissionEntity saved = profilPermissionRepository.saveAndFlush(pp);
        
        // Recharger avec les relations pour s'assurer qu'elles sont disponibles
        return profilPermissionRepository.findById(saved.getId()).orElse(saved);
    }

    /**
     * Ajoute plusieurs permissions à un profil en une seule transaction
     * @param profilId L'ID du profil
     * @param moduleId L'ID du module
     * @param permissionIds Liste des IDs des permissions à ajouter
     * @return Liste des ProfilPermissionEntity créées ou existantes
     */
    @Transactional
    public List<ProfilPermissionEntity> addMultiplePermissionsToProfil(Long profilId, Long moduleId, List<Long> permissionIds) {
        ProfilEntity profil = profilRepository.findById(profilId).orElseThrow(() -> new RuntimeException("Profil non trouvé avec l'ID: " + profilId));
        ModuleEntity module = moduleRepository.findById(moduleId).orElseThrow(() -> new RuntimeException("Module non trouvé avec l'ID: " + moduleId));
        
        List<ProfilPermissionEntity> result = new ArrayList<>();
        
        // Charger toutes les associations existantes pour ce profil et ce module
        List<ProfilPermissionEntity> existingPermissions = profilPermissionRepository.findByProfilIdAndModuleId(profilId, moduleId);
        
        for (Long permissionId : permissionIds) {
            // Vérifier si l'association existe déjà
            ProfilPermissionEntity existing = existingPermissions.stream()
                .filter(pp -> pp.getPermission() != null && pp.getPermission().getId().equals(permissionId))
                .findFirst()
                .orElse(null);
            
            if (existing != null) {
                result.add(existing);
            } else {
                PermissionEntity permission = permissionRepository.findById(permissionId)
                    .orElseThrow(() -> new RuntimeException("Permission non trouvée avec l'ID: " + permissionId));
                
                ProfilPermissionEntity pp = new ProfilPermissionEntity();
                pp.setProfil(profil);
                pp.setModule(module);
                pp.setPermission(permission);
                ProfilPermissionEntity saved = profilPermissionRepository.saveAndFlush(pp);
                result.add(saved);
            }
        }
        
        return result;
    }

    public void removePermissionFromProfil(Long profilPermissionId) {
        profilPermissionRepository.deleteById(profilPermissionId);
    }

    public List<ProfilPermissionEntity> getPermissionsForProfil(Long profilId) {
        return profilPermissionRepository.findByProfilId(profilId).stream()
            .filter(pp -> pp.getProfil() != null && pp.getProfil().getId() != null
                         && pp.getProfil().getId().equals(profilId))
            .filter(pp -> pp.getModule() != null && pp.getPermission() != null)
            .toList();
    }

    /**
     * Retourne les permissions disponibles pour un module.
     * Une permission n'est renvoyée que si elle est réellement associée au module
     * dans la table de cloisonnement module_permission.
     */
    public List<PermissionEntity> getPermissionsForModule(Long moduleId) {
        if (moduleId == null || !moduleRepository.existsById(moduleId)) {
            return List.of();
        }
        moduleRepository.findById(moduleId).ifPresent(this::ensureRequiredModulePermissions);
        List<PermissionEntity> modulePermissions = modulePermissionRepository.findByModuleId(moduleId).stream()
            .map(ModulePermissionEntity::getPermission)
            .filter(permission -> permission != null)
            .toList();
        return sortAndDeduplicatePermissions(modulePermissions);
    }

    /**
     * Retourne toutes les permissions groupées par module.
     * Une permission est affichée sous un module si et seulement si elle est
     * réellement associée à ce module dans la table module_permission.
     * @return Map où la clé est le nom du module et la valeur est la liste des permissions
     */
    public Map<String, List<PermissionEntity>> getPermissionsGroupedByModule() {
        Map<String, List<PermissionEntity>> permissionsByModule = new LinkedHashMap<>();
        List<PermissionEntity> allPermissions = permissionRepository.findAll();
        Set<Long> assignedPermissionIds = new HashSet<>();

        List<ModuleEntity> modules = moduleRepository.findAll().stream()
            .filter(module -> module.getId() != null && module.getNom() != null && !module.getNom().isBlank())
            .sorted(Comparator.comparing(ModuleEntity::getNom, String.CASE_INSENSITIVE_ORDER))
            .toList();

        for (ModuleEntity module : modules) {
            List<PermissionEntity> modulePermissions = getPermissionsForModule(module.getId());
            if (!modulePermissions.isEmpty()) {
                permissionsByModule.put(module.getNom(), modulePermissions);
                modulePermissions.stream()
                    .map(PermissionEntity::getId)
                    .filter(permissionId -> permissionId != null)
                    .forEach(assignedPermissionIds::add);
            }
        }

        List<PermissionEntity> permissionsWithoutModule = sortAndDeduplicatePermissions(
            allPermissions.stream()
                .filter(permission -> permission.getId() != null && !assignedPermissionIds.contains(permission.getId()))
                .toList()
        );

        if (!permissionsWithoutModule.isEmpty()) {
            permissionsByModule.put("Sans module", permissionsWithoutModule);
        }

        return permissionsByModule;
    }

    private List<PermissionEntity> sortAndDeduplicatePermissions(List<PermissionEntity> permissions) {
        Map<Long, PermissionEntity> uniquePermissions = new LinkedHashMap<>();

        for (PermissionEntity permission : permissions) {
            if (permission == null || permission.getId() == null) {
                continue;
            }
            uniquePermissions.putIfAbsent(permission.getId(), permission);
        }

        return uniquePermissions.values().stream()
            .sorted(Comparator.comparing(
                permission -> permission.getNom() == null ? "" : permission.getNom(),
                String.CASE_INSENSITIVE_ORDER
            ))
            .toList();
    }

    private void ensureRequiredModulePermissions(ModuleEntity module) {
        if (module == null || module.getId() == null || module.getNom() == null) {
            return;
        }

        if ("Résultats".equalsIgnoreCase(module.getNom().trim())) {
            ensureModulePermissionAssociation(module, "modifier");
            ensureModulePermissionAssociation(module, "bulk");
        }
    }

    private void ensureModulePermissionAssociation(ModuleEntity module, String permissionName) {
        if (module == null || module.getId() == null || permissionName == null || permissionName.isBlank()) {
            return;
        }

        PermissionEntity permission = permissionRepository.findByNom(permissionName);
        if (permission == null) {
            PermissionEntity newPermission = new PermissionEntity();
            newPermission.setNom(permissionName);
            permission = permissionRepository.save(newPermission);
        }

        Long permissionId = permission.getId();
        boolean associationExists = modulePermissionRepository.findByModuleId(module.getId()).stream()
            .anyMatch(mp -> mp.getPermission() != null && mp.getPermission().getId() != null
                && mp.getPermission().getId().equals(permissionId));

        if (!associationExists) {
            ModulePermissionEntity modulePermission = new ModulePermissionEntity();
            modulePermission.setModule(module);
            modulePermission.setPermission(permission);
            modulePermissionRepository.save(modulePermission);
        }
    }
}