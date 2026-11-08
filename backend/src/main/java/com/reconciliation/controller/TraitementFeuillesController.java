package com.reconciliation.controller;

import com.reconciliation.service.traitement.TraitementFeuillesService;
import jakarta.servlet.http.HttpServletResponse;
import org.apache.poi.openxml4j.opc.OPCPackage;
import org.apache.poi.poifs.filesystem.POIFSFileSystem;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;

/**
 * Séparation des feuilles d'un classeur, côté serveur. Le zip est écrit directement dans la
 * réponse (synchrone, comme l'export : pas de passe asynchrone).
 *
 * <p>Le chemin {@code /api/traitement/**} est rattaché au module « Traitement ».</p>
 */
@RestController
@RequestMapping("/api/traitement/feuilles")
public class TraitementFeuillesController {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(TraitementFeuillesController.class);

    private final TraitementFeuillesService service;

    public TraitementFeuillesController(TraitementFeuillesService service) {
        this.service = service;
    }

    @PostMapping(value = "/separer", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public void separer(@RequestParam("file") MultipartFile fichier,
                        @RequestParam(value = "entete", required = false) List<String> entete,
                        @RequestParam(value = "appliquerEntete", defaultValue = "false") boolean appliquerEntete,
                        @RequestParam(value = "largeurs", required = false) List<Double> largeurs,
                        HttpServletResponse response) throws IOException {
        if (fichier.isEmpty()) {
            throw new IllegalArgumentException("Aucun fichier reçu.");
        }
        String nomOriginal = fichier.getOriginalFilename() == null ? "fichier.xlsx" : fichier.getOriginalFilename();
        String base = nomOriginal.replaceFirst("\\.[^.]+$", "");
        TraitementFeuillesService.Options options = new TraitementFeuillesService.Options(entete, appliquerEntete, largeurs);
        String minuscules = nomOriginal.toLowerCase(Locale.ROOT);

        if (minuscules.endsWith(".xlsx") || minuscules.endsWith(".xlsm")) {
            // .xlsx : lecture en flux depuis un fichier temporaire (pas de classeur complet en mémoire)
            Path temporaire = Files.createTempFile("feuilles-", ".xlsx");
            try {
                fichier.transferTo(temporaire);
                long debut = System.currentTimeMillis();
                try (OPCPackage paquet = service.ouvrirXlsx(temporaire.toFile())) {
                    int nombre = service.compterFeuillesXlsx(paquet);
                    if (nombre == 0) {
                        throw new IllegalArgumentException("Le classeur ne contient aucune feuille.");
                    }
                    entete(response, base, nombre);
                    service.ecrireXlsx(paquet, options, response.getOutputStream());
                    log.info("Séparation des feuilles : « {} » ({} o), {} feuille(s), {} ms",
                            nomOriginal, fichier.getSize(), nombre, System.currentTimeMillis() - debut);
                }
                response.flushBuffer();
            } finally {
                Files.deleteIfExists(temporaire);
            }
            return;
        }

        // .xls : format binaire, lu en flux (événementiel HSSF) après lecture du conteneur
        long debut = System.currentTimeMillis();
        try (POIFSFileSystem fs = service.ouvrirXls(fichier)) {
            int nombre = service.compterFeuillesXls(fs);
            if (nombre == 0) {
                throw new IllegalArgumentException("Le classeur ne contient aucune feuille.");
            }
            entete(response, base, nombre);
            service.ecrireXls(fs, options, response.getOutputStream());
            response.flushBuffer();
            log.info("Séparation des feuilles : « {} » ({} o), {} feuille(s), {} ms",
                    nomOriginal, fichier.getSize(), nombre, System.currentTimeMillis() - debut);
        }
    }

    private static void entete(HttpServletResponse response, String base, int nombreFeuilles) {
        response.setContentType("application/zip");
        response.setHeader(HttpHeaders.CONTENT_DISPOSITION,
                ContentDisposition.attachment().filename(base + "_feuilles_sep.zip", StandardCharsets.UTF_8)
                        .build().toString());
        response.setHeader("X-Nombre-Feuilles", String.valueOf(nombreFeuilles));
    }
}
