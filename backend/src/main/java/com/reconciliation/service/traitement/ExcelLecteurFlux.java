package com.reconciliation.service.traitement;

import org.apache.poi.openxml4j.exceptions.OpenXML4JException;
import org.apache.poi.openxml4j.opc.OPCPackage;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.util.CellReference;
import org.apache.poi.ooxml.util.SAXHelper;
import org.apache.poi.xssf.eventusermodel.XSSFReader;
import org.apache.poi.xssf.eventusermodel.XSSFSheetXMLHandler;
import org.apache.poi.xssf.model.SharedStrings;
import org.apache.poi.xssf.model.StylesTable;
import org.apache.poi.xssf.usermodel.XSSFComment;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.XMLReader;

import javax.xml.parsers.ParserConfigurationException;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.function.Consumer;

/**
 * Lecteur Excel (.xlsx) en flux, via l'API événementielle de POI : la feuille est parcourue
 * ligne par ligne sans construire le classeur en mémoire.
 *
 * <p>Seule la première feuille est lue. Les valeurs sont celles affichées dans Excel
 * (dates et nombres formatés), comme le fait le lecteur CSV sur le texte du fichier.</p>
 */
public final class ExcelLecteurFlux {

    private ExcelLecteurFlux() {
    }

    /**
     * Transmet chaque ligne de la première feuille au consommateur. Les cellules absentes
     * d'une ligne sont complétées par des chaînes vides.
     */
    public static void lire(InputStream entree, Consumer<List<String>> consommateur) throws IOException {
        OPCPackage paquet;
        try {
            paquet = OPCPackage.open(entree);
        } catch (OpenXML4JException | RuntimeException e) {
            // POI lève des exceptions non vérifiées (ex. NotOfficeXmlFileException) : on les traduit.
            throw new IOException("Fichier Excel illisible (format .xlsx attendu) : " + e.getMessage(), e);
        }
        try {
            XSSFReader lecteur = new XSSFReader(paquet);
            SharedStrings chaines = lecteur.getSharedStringsTable();
            StylesTable styles = lecteur.getStylesTable();
            Iterator<InputStream> feuilles = lecteur.getSheetsData();
            if (!feuilles.hasNext()) {
                throw new IllegalArgumentException("Le classeur Excel ne contient aucune feuille.");
            }
            try (InputStream feuille = feuilles.next()) {
                XMLReader xml = SAXHelper.newXMLReader();
                xml.setContentHandler(new XSSFSheetXMLHandler(
                        styles, null, chaines, new Collecteur(consommateur), new DataFormatter(), false));
                xml.parse(new InputSource(feuille));
            }
        } catch (OpenXML4JException | SAXException | ParserConfigurationException e) {
            throw new IOException("Fichier Excel illisible : " + e.getMessage(), e);
        } finally {
            // Lecture seule : on ferme sans sauvegarder.
            paquet.revert();
        }
    }

    /** Assemble les cellules d'une ligne, en respectant leur position (colonne A = 0). */
    private static final class Collecteur implements XSSFSheetXMLHandler.SheetContentsHandler {
        private final Consumer<List<String>> sortie;
        private List<String> ligne = new ArrayList<>();

        Collecteur(Consumer<List<String>> sortie) {
            this.sortie = sortie;
        }

        @Override
        public void startRow(int numeroLigne) {
            ligne = new ArrayList<>();
        }

        @Override
        public void endRow(int numeroLigne) {
            if (!ligne.isEmpty()) {
                sortie.accept(ligne);
            }
        }

        @Override
        public void cell(String reference, String valeurFormatee, XSSFComment commentaire) {
            String valeur = valeurFormatee == null ? "" : valeurFormatee;
            if (reference == null) {
                ligne.add(valeur);
                return;
            }
            int colonne = new CellReference(reference).getCol();
            while (ligne.size() < colonne) {
                ligne.add("");
            }
            if (ligne.size() == colonne) {
                ligne.add(valeur);
            } else {
                ligne.set(colonne, valeur);
            }
        }
    }
}
