package com.reconciliation.service.traitement;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.reconciliation.tenant.TenantContext;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Vérifie l'export sur plusieurs pages (plus de 5000 lignes), là où les petits lots passent.
 * Le JdbcTemplate est simulé : aucune base de données n'est nécessaire.
 */
class TraitementExportServiceTest {

    private static final int NB_LIGNES = 12_000;

    private final List<Map<String, Object>> lignes = new ArrayList<>();
    private JdbcTemplate jdbc;
    private TraitementExportService service;

    @BeforeEach
    void setUp() {
        TenantContext.set(7L);
        for (int n = 1; n <= NB_LIGNES; n++) {
            lignes.add(Map.of("numero", (long) n, "valeurs_json", "{\"A\":\"x" + n + "\",\"B\":" + n + "}"));
        }
        jdbc = new JdbcTemplate() {
            @Override
            public <T> List<T> queryForList(String sql, Class<T> elementType, Object... args) {
                // colonnes du fichier (une seule ligne de fichier) ou nombre de lignes du lot
                if (sql.contains("colonnes_json")) {
                    return List.of(elementType.cast("[\"A\",\"B\"]"));
                }
                return List.of(elementType.cast((long) NB_LIGNES));
            }

            @Override
            public List<Map<String, Object>> queryForList(String sql, Object... args) {
                // args : entreprise, lot, curseur, taille
                long curseur = ((Number) args[2]).longValue();
                int taille = ((Number) args[3]).intValue();
                List<Map<String, Object>> page = new ArrayList<>();
                for (Map<String, Object> l : lignes) {
                    if ((Long) l.get("numero") > curseur) {
                        page.add(l);
                        if (page.size() == taille) {
                            break;
                        }
                    }
                }
                return page;
            }
        };
        service = new TraitementExportService(jdbc, new ObjectMapper());
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test
    void exporteToutesLesPagesEnCsv() throws Exception {
        TraitementExportService.Plan plan = service.preparer(1L, TraitementExportService.Format.CSV);
        ByteArrayOutputStream sortie = new ByteArrayOutputStream();

        service.ecrire(plan, sortie);

        String texte = sortie.toString(StandardCharsets.UTF_8).replace("﻿", "");
        String[] lignesCsv = texte.split("\r\n");
        assertThat(lignesCsv).hasSize(NB_LIGNES + 1);
        assertThat(lignesCsv[0]).isEqualTo("A;B");
        assertThat(lignesCsv[5001]).isEqualTo("x5001;5001");
        assertThat(lignesCsv[NB_LIGNES]).isEqualTo("x" + NB_LIGNES + ";" + NB_LIGNES);
    }

    @Test
    void exporteToutesLesPagesEnXlsx() throws Exception {
        TraitementExportService.Plan plan = service.preparer(1L, TraitementExportService.Format.XLSX);
        ByteArrayOutputStream sortie = new ByteArrayOutputStream();

        service.ecrire(plan, sortie);

        try (XSSFWorkbook classeur = new XSSFWorkbook(new ByteArrayInputStream(sortie.toByteArray()))) {
            // en-tête + toutes les lignes
            assertThat(classeur.getSheetAt(0).getLastRowNum()).isEqualTo(NB_LIGNES);
            assertThat(classeur.getSheetAt(0).getRow(NB_LIGNES).getCell(0).getStringCellValue())
                    .isEqualTo("x" + NB_LIGNES);
        }
    }
}
