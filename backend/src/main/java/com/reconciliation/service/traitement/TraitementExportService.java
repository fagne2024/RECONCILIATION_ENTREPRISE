package com.reconciliation.service.traitement;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.reconciliation.tenant.TenantContext;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Export serveur d'un lot : CSV (même format que l'export navigateur : séparateur {@code ;},
 * BOM UTF-8, fins de ligne CRLF) ou XLSX. L'écriture se fait en flux, page par page.
 *
 * <p>Les vérifications (lot, colonnes) sont faites par {@link #preparer} avant le début de la
 * réponse HTTP ; {@link #ecrire} n'a pas besoin du contexte entreprise (il s'exécute dans un
 * autre thread lors du streaming).</p>
 */
@Service
public class TraitementExportService {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(TraitementExportService.class);

    private static final int TAILLE_PAGE = 5000;
    /** Limite d'Excel : 1 048 576 lignes, en-tête compris. */
    private static final long MAX_LIGNES_XLSX = 1_000_000L;
    /** Lignes gardées en mémoire par SXSSF avant écriture sur disque. */
    private static final int FENETRE_XLSX = 200;

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public TraitementExportService(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    /** Format d'export disponible. */
    public enum Format {
        CSV("csv", new MediaType("text", "csv", StandardCharsets.UTF_8)),
        XLSX("xlsx", MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));

        private final String extension;
        private final MediaType type;

        Format(String extension, MediaType type) {
            this.extension = extension;
            this.type = type;
        }

        public String extension() {
            return extension;
        }

        public MediaType type() {
            return type;
        }

        public static Format depuis(String valeur) {
            String v = valeur == null ? "" : valeur.trim().toLowerCase();
            for (Format f : values()) {
                if (f.extension.equals(v)) {
                    return f;
                }
            }
            throw new IllegalArgumentException("Format d'export non pris en charge : « " + valeur
                    + " ». Formats disponibles : csv, xlsx.");
        }
    }

    /** Ce qui est vérifié avant l'écriture : entreprise, lot, colonnes et nombre de lignes. */
    public record Plan(long entrepriseId, long lotId, List<String> colonnes, long nbLignes, Format format) {
    }

    /** Vérifie que l'export est possible et renvoie le plan à exécuter. */
    public Plan preparer(long lotId, Format format) {
        long entrepriseId = entrepriseCourante();
        List<Long> nombres = jdbc.queryForList(
                "SELECT nb_lignes FROM traitement_lot WHERE entreprise_id = ? AND id = ?",
                Long.class, entrepriseId, lotId);
        if (nombres.isEmpty()) {
            throw new IllegalArgumentException("Lot de traitement introuvable : " + lotId);
        }
        long nbLignes = nombres.get(0) == null ? 0 : nombres.get(0);
        if (format == Format.XLSX && nbLignes > MAX_LIGNES_XLSX) {
            throw new IllegalArgumentException("Le lot dépasse la limite d'Excel (1 000 000 lignes) : "
                    + "exportez-le en CSV.");
        }
        List<String> colonnes = colonnesUnion(lotId, entrepriseId);
        if (colonnes.isEmpty()) {
            throw new IllegalArgumentException("Le lot ne contient aucune colonne à exporter.");
        }
        return new Plan(entrepriseId, lotId, colonnes, nbLignes, format);
    }

    /** Écrit le lot dans le flux, au format demandé. */
    public void ecrire(Plan plan, OutputStream sortie) throws IOException {
        long debut = System.currentTimeMillis();
        try {
            long lignes = plan.format() == Format.CSV ? ecrireCsv(plan, sortie) : ecrireXlsx(plan, sortie);
            log.info("Traitement serveur : lot {} exporté en {} — {} lignes, {} ms",
                    plan.lotId(), plan.format().extension(), lignes, System.currentTimeMillis() - debut);
        } catch (IOException | RuntimeException e) {
            log.error("Traitement serveur : export du lot {} interrompu", plan.lotId(), e);
            throw e;
        }
    }

    // ------------------------------------------------------------------

    private long ecrireCsv(Plan plan, OutputStream sortie) throws IOException {
        Writer w = new BufferedWriter(new OutputStreamWriter(sortie, StandardCharsets.UTF_8), 1 << 16);
        w.write('﻿');
        ecrireLigneCsv(w, plan.colonnes());
        long n = 0;
        long curseur = 0;
        while (true) {
            List<LigneBrute> page = pageApres(plan, curseur);
            if (page.isEmpty()) {
                break;
            }
            for (LigneBrute ligne : page) {
                curseur = ligne.numero();
                List<String> cellules = new ArrayList<>(plan.colonnes().size());
                for (String col : plan.colonnes()) {
                    cellules.add(texte(ligne.valeurs().get(col)));
                }
                ecrireLigneCsv(w, cellules);
                n++;
            }
            if (page.size() < TAILLE_PAGE) {
                break;
            }
        }
        w.flush();
        return n;
    }

    private long ecrireXlsx(Plan plan, OutputStream sortie) throws IOException {
        try (SXSSFWorkbook classeur = new SXSSFWorkbook(FENETRE_XLSX)) {
            Sheet feuille = classeur.createSheet("Résultat");
            Row entete = feuille.createRow(0);
            for (int i = 0; i < plan.colonnes().size(); i++) {
                entete.createCell(i).setCellValue(plan.colonnes().get(i));
            }
            int ligneCourante = 1;
            long curseur = 0;
            while (true) {
                List<LigneBrute> page = pageApres(plan, curseur);
                if (page.isEmpty()) {
                    break;
                }
                for (LigneBrute ligne : page) {
                    curseur = ligne.numero();
                    Row r = feuille.createRow(ligneCourante++);
                    for (int i = 0; i < plan.colonnes().size(); i++) {
                        Object v = ligne.valeurs().get(plan.colonnes().get(i));
                        if (v == null) {
                            continue;
                        }
                        Cell c = r.createCell(i);
                        if (v instanceof Number num && Double.isFinite(num.doubleValue())) {
                            c.setCellValue(num.doubleValue());
                        } else {
                            c.setCellValue(v.toString());
                        }
                    }
                }
                if (page.size() < TAILLE_PAGE) {
                    break;
                }
            }
            classeur.write(sortie);
            return ligneCourante - 1L;
        }
    }

    private record LigneBrute(long numero, Map<String, Object> valeurs) {
    }

    /** Page de lignes après le numéro donné, dans l'ordre de la ligne. */
    private List<LigneBrute> pageApres(Plan plan, long curseur) {
        List<Map<String, Object>> brutes = jdbc.queryForList(
                "SELECT numero, valeurs_json FROM traitement_ligne "
                        + "WHERE entreprise_id = ? AND lot_id = ? AND numero > ? ORDER BY numero LIMIT ?",
                plan.entrepriseId(), plan.lotId(), curseur, TAILLE_PAGE);
        List<LigneBrute> lignes = new ArrayList<>(brutes.size());
        for (Map<String, Object> b : brutes) {
            long numero = ((Number) b.get("numero")).longValue();
            lignes.add(new LigneBrute(numero, lireValeurs((String) b.get("valeurs_json"))));
        }
        return lignes;
    }

    private static void ecrireLigneCsv(Writer w, List<String> cellules) throws IOException {
        for (int i = 0; i < cellules.size(); i++) {
            if (i > 0) {
                w.write(';');
            }
            w.write(echappeCsv(cellules.get(i)));
        }
        w.write("\r\n");
    }

    private static String echappeCsv(String valeur) {
        if (valeur.indexOf(';') >= 0 || valeur.indexOf('"') >= 0 || valeur.indexOf('\n') >= 0 || valeur.indexOf('\r') >= 0) {
            return "\"" + valeur.replace("\"", "\"\"") + "\"";
        }
        return valeur;
    }

    /** Texte d'une cellule : les nombres entiers sont écrits sans décimale (1.0 -> 1). */
    private static String texte(Object v) {
        if (v == null) {
            return "";
        }
        if (v instanceof Double d && Double.isFinite(d) && d == Math.rint(d) && Math.abs(d) < 1e15) {
            return String.valueOf(d.longValue());
        }
        return v.toString();
    }

    /** Colonnes du lot : union des colonnes de chaque fichier, dans l'ordre de première apparition. */
    private List<String> colonnesUnion(long lotId, long entrepriseId) {
        List<String> brutes = jdbc.queryForList(
                "SELECT colonnes_json FROM traitement_fichier WHERE entreprise_id = ? AND lot_id = ? ORDER BY ordre",
                String.class, entrepriseId, lotId);
        Set<String> union = new LinkedHashSet<>();
        for (String json : brutes) {
            if (json == null) {
                continue;
            }
            try {
                union.addAll(objectMapper.readValue(json,
                        objectMapper.getTypeFactory().constructCollectionType(List.class, String.class)));
            } catch (JsonProcessingException e) {
                throw new IllegalStateException("Colonnes du lot illisibles", e);
            }
        }
        return new ArrayList<>(union);
    }

    private Map<String, Object> lireValeurs(String json) {
        try {
            return objectMapper.readValue(json,
                    objectMapper.getTypeFactory().constructMapType(LinkedHashMap.class, String.class, Object.class));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Ligne illisible", e);
        }
    }

    private static long entrepriseCourante() {
        Long id = TenantContext.get();
        if (id == null || id.equals(TenantContext.NO_TENANT)) {
            throw new SecurityException("Entreprise non identifiée pour ce traitement.");
        }
        return id;
    }
}
