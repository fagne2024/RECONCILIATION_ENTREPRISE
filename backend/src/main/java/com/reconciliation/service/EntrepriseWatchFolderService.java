package com.reconciliation.service;

import com.reconciliation.entity.EntrepriseEntity;
import com.reconciliation.repository.EntrepriseRepository;
import com.reconciliation.tenant.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Gestion du dossier watch-folder propre a chaque entreprise (tenant).
 *
 * <p>Chaque entreprise dispose d'un sous-dossier dedie dans le watch-folder,
 * nomme d'apres son {@code code} (ex. {@code watch-folder/INTOUCH}). C'est ce
 * dossier qui contient les fichiers modeles (CSV / Excel) de l'entreprise : il
 * realise le cloisonnement des fichiers par entreprise.</p>
 *
 * <p>Le dossier est cree a la creation de l'entreprise (voir
 * {@link PlatformEntrepriseService}) et recree a la demande s'il est absent, ce
 * qui couvre les entreprises anterieures a cette fonctionnalite.</p>
 */
@Service
public class EntrepriseWatchFolderService {

    private static final Logger log = LoggerFactory.getLogger(EntrepriseWatchFolderService.class);

    /** Nom de dossier utilise si aucun code exploitable n'est disponible. */
    private static final String FALLBACK_FOLDER = "DEFAUT";

    /** Caracteres interdits dans un nom de dossier (tout sauf alphanumerique, . _ -). */
    private static final Pattern UNSAFE_CHARS = Pattern.compile("[^A-Za-z0-9._-]");
    private static final int MAX_FOLDER_NAME_LENGTH = 64;

    @Value("${app.watch-folder.path:../watch-folder}")
    private String watchFolderPath;

    private final EntrepriseRepository entrepriseRepository;

    public EntrepriseWatchFolderService(EntrepriseRepository entrepriseRepository) {
        this.entrepriseRepository = entrepriseRepository;
    }

    /** Racine du watch-folder (dossier parent de tous les dossiers entreprises). */
    public Path baseFolder() {
        return Paths.get(watchFolderPath).toAbsolutePath().normalize();
    }

    /**
     * Nom de dossier derive du code entreprise. Les caracteres non surs sont
     * remplaces par {@code _} ; le code etant unique en base, le dossier l'est
     * aussi.
     */
    public String folderName(String code) {
        if (code == null || code.isBlank()) {
            return FALLBACK_FOLDER;
        }
        String sanitized = UNSAFE_CHARS.matcher(code.trim()).replaceAll("_");
        if (sanitized.length() > MAX_FOLDER_NAME_LENGTH) {
            sanitized = sanitized.substring(0, MAX_FOLDER_NAME_LENGTH);
        }
        if (sanitized.isBlank() || ".".equals(sanitized) || "..".equals(sanitized)) {
            return FALLBACK_FOLDER;
        }
        return sanitized.toUpperCase(Locale.ROOT);
    }

    /** Chemin du dossier de l'entreprise identifiee par son code (sans creation). */
    public Path folderFor(String code) {
        Path base = baseFolder();
        Path folder = base.resolve(folderName(code)).normalize();
        // Defense en profondeur : le dossier doit rester sous la racine watch-folder.
        if (!folder.startsWith(base)) {
            throw new IllegalStateException("Nom de dossier entreprise invalide: " + code);
        }
        return folder;
    }

    /**
     * Garantit l'existence du dossier de l'entreprise (code) et renvoie son
     * chemin. Cree la racine watch-folder au besoin.
     */
    public Path ensureFolder(String code) {
        Path folder = folderFor(code);
        try {
            Files.createDirectories(folder);
        } catch (IOException e) {
            throw new IllegalStateException(
                "Impossible de creer le dossier entreprise: " + folder, e);
        }
        return folder;
    }

    /** Garantit l'existence du dossier de l'entreprise (id) et renvoie son chemin. */
    public Path ensureFolderForEntrepriseId(Long entrepriseId) {
        EntrepriseEntity entreprise = entrepriseRepository.findById(entrepriseId)
            .orElseThrow(() -> new IllegalStateException(
                "Entreprise introuvable (id=" + entrepriseId + ")."));
        return ensureFolder(entreprise.getCode());
    }

    /**
     * Dossier watch-folder de l'entreprise courante (contexte tenant).
     *
     * <p>Fail-closed : sans entreprise dans le contexte (ou SUPER_ADMIN), l'acces
     * est refuse plutot que de retomber sur la racine partagee.</p>
     */
    public Path currentFolder() {
        Long entrepriseId = TenantContext.get();
        if (entrepriseId == null || entrepriseId <= 0) {
            throw new IllegalStateException(
                "Aucune entreprise dans le contexte : acces au watch-folder refuse.");
        }
        return ensureFolderForEntrepriseId(entrepriseId);
    }

    /** Nom du dossier watch-folder de l'entreprise courante. */
    public String currentFolderName() {
        return currentFolder().getFileName().toString();
    }

    /**
     * Cree (proactivement) le dossier watch-folder de chaque entreprise existante
     * au demarrage. Les entreprises creees ensuite obtiennent leur dossier lors
     * de l'appel a la creation.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void ensureFoldersForExistingEntreprises() {
        List<EntrepriseEntity> entreprises;
        try {
            entreprises = entrepriseRepository.findAll();
        } catch (Exception e) {
            log.warn("Watch-folder : lecture des entreprises impossible ({}).", e.getMessage());
            return;
        }
        for (EntrepriseEntity entreprise : entreprises) {
            try {
                Path folder = ensureFolder(entreprise.getCode());
                log.info("Watch-folder entreprise '{}' pret : {}", entreprise.getCode(), folder);
            } catch (Exception e) {
                log.warn("Watch-folder : dossier non cree pour '{}' ({}) : {}",
                    entreprise.getCode(), entreprise.getId(), e.getMessage());
            }
        }
    }
}
