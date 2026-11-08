package com.reconciliation.service.traitement;

import org.apache.poi.hssf.eventusermodel.FormatTrackingHSSFListener;
import org.apache.poi.hssf.eventusermodel.HSSFEventFactory;
import org.apache.poi.hssf.eventusermodel.HSSFListener;
import org.apache.poi.hssf.eventusermodel.HSSFRequest;
import org.apache.poi.hssf.record.BOFRecord;
import org.apache.poi.hssf.record.BoolErrRecord;
import org.apache.poi.hssf.record.BoundSheetRecord;
import org.apache.poi.hssf.record.CellValueRecordInterface;
import org.apache.poi.hssf.record.EOFRecord;
import org.apache.poi.hssf.record.FormulaRecord;
import org.apache.poi.hssf.record.LabelRecord;
import org.apache.poi.hssf.record.LabelSSTRecord;
import org.apache.poi.hssf.record.NumberRecord;
import org.apache.poi.hssf.record.RKRecord;
import org.apache.poi.hssf.record.Record;
import org.apache.poi.hssf.record.SSTRecord;
import org.apache.poi.hssf.record.StringRecord;
import org.apache.poi.poifs.filesystem.POIFSFileSystem;
import org.apache.poi.ooxml.util.SAXHelper;
import org.apache.poi.openxml4j.exceptions.InvalidFormatException;
import org.apache.poi.openxml4j.exceptions.OpenXML4JException;
import org.apache.poi.openxml4j.opc.OPCPackage;
import org.apache.poi.openxml4j.opc.PackageAccess;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.FormulaError;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Row.MissingCellPolicy;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.VerticalAlignment;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.ss.util.CellReference;
import org.apache.poi.xssf.model.SharedStrings;
import org.apache.poi.xssf.model.StylesTable;
import org.apache.poi.xssf.eventusermodel.XSSFReader;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.xml.sax.Attributes;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.XMLReader;
import org.xml.sax.helpers.DefaultHandler;

import javax.xml.parsers.ParserConfigurationException;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.Deflater;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Séparation des feuilles d'un classeur : une feuille = un fichier .xlsx, regroupés dans un zip.
 * Remplace le traitement fait dans le navigateur.
 *
 * <p>Deux chemins :</p>
 * <ul>
 *   <li><b>.xlsx en flux</b> ({@link #ouvrirXlsx}, {@link #ecrireXlsx}) : le XML de chaque feuille
 *   est lu ligne à ligne et écrit aussitôt, sans charger le classeur en mémoire. Les types sont
 *   conservés (nombres, dates grâce au format de cellule, booléens, erreurs).</li>
 *   <li><b>.xls</b> ({@link #charger}, {@link #ecrire}) : chargement complet (format binaire, plus
 *   compact que le .xlsx).</li>
 * </ul>
 *
 * <p>Comportement repris de l'écran : en-tête personnalisé inséré en première ligne des feuilles
 * suivant la première (gras, centré, fond gris) ; largeurs de colonnes appliquées.</p>
 */
@Service
public class TraitementFeuillesService {

    private static final int FENETRE = 200;
    private static final int LONGUEUR_MAX_NOM_FEUILLE = 31;
    private static final String FORMAT_DATE = "yyyy-mm-dd hh:mm:ss";

    /** Options de séparation, telles que saisies à l'écran. */
    public record Options(List<String> entete, boolean appliquerEntete, List<Double> largeurs) {
        public Options {
            entete = entete == null ? List.of() : new ArrayList<>(entete);
            largeurs = largeurs == null ? List.of() : new ArrayList<>(largeurs);
        }
    }

    // ------------------------------------------------------------------
    // .xlsx en flux
    // ------------------------------------------------------------------

    /** Ouvre un .xlsx en lecture seule (le fichier doit rester présent pendant toute la lecture). */
    public OPCPackage ouvrirXlsx(File fichier) throws IOException {
        try {
            return OPCPackage.open(fichier, PackageAccess.READ);
        } catch (InvalidFormatException | RuntimeException e) {
            throw new IOException("Fichier Excel illisible (.xlsx attendu) : " + e.getMessage(), e);
        }
    }

    /** Nombre de feuilles du classeur (sans lire leur contenu). */
    public int compterFeuillesXlsx(OPCPackage paquet) throws IOException {
        try {
            XSSFReader.SheetIterator feuilles = (XSSFReader.SheetIterator) new XSSFReader(paquet).getSheetsData();
            int n = 0;
            while (feuilles.hasNext()) {
                try (InputStream ignore = feuilles.next()) {
                    n++;
                }
            }
            return n;
        } catch (OpenXML4JException | RuntimeException e) {
            throw new IOException("Fichier Excel illisible : " + e.getMessage(), e);
        }
    }

    /** Écrit le zip en lisant chaque feuille en flux. Renvoie le nombre de feuilles. */
    public int ecrireXlsx(OPCPackage paquet, Options options, OutputStream sortie) throws IOException {
        try {
            XSSFReader lecteur = new XSSFReader(paquet);
            SharedStrings chaines = lecteur.getSharedStringsTable();
            StylesTable styles = lecteur.getStylesTable();
            XSSFReader.SheetIterator feuilles = (XSSFReader.SheetIterator) lecteur.getSheetsData();
            ZipOutputStream zip = nouveauZip(sortie);
            Set<String> nomsUtilises = new HashSet<>();
            int index = 0;
            while (feuilles.hasNext()) {
                try (InputStream xml = feuilles.next()) {
                    String nom = nettoyerNom(feuilles.getSheetName(), index);
                    zip.putNextEntry(new ZipEntry(nomUnique(nom, nomsUtilises) + ".xlsx"));
                    ecrireFeuilleXlsx(xml, styles, chaines, options, index, nom, zip);
                    zip.closeEntry();
                }
                index++;
            }
            zip.finish();
            return index;
        } catch (OpenXML4JException | SAXException | ParserConfigurationException | RuntimeException e) {
            throw new IOException("Fichier Excel illisible : " + e.getMessage(), e);
        }
    }

    private void ecrireFeuilleXlsx(InputStream xml, StylesTable styles, SharedStrings chaines, Options options,
                                   int index, String nom, OutputStream sortie)
            throws IOException, SAXException, ParserConfigurationException {
        try (SXSSFWorkbook classeur = new SXSSFWorkbook(FENETRE)) {
            Sheet cible = classeur.createSheet(tronquer(nom));
            CellStyle styleEntete = styleEntete(classeur);
            CellStyle styleDate = styleDate(classeur);
            int decalage = ecrireEntete(cible, options, index, styleEntete);
            appliquerLargeurs(cible, options);

            XMLReader lecteur = SAXHelper.newXMLReader();
            lecteur.setContentHandler(new FeuilleXlsxHandler(cible, styles, chaines, decalage, styleDate));
            lecteur.parse(new InputSource(xml));

            classeur.write(sortie);
            classeur.dispose();
        }
    }

    // ------------------------------------------------------------------
    // .xls (classeur chargé en mémoire)
    // ------------------------------------------------------------------

    // ------------------------------------------------------------------
    // .xls en flux (API événementielle HSSF)
    // ------------------------------------------------------------------

    /**
     * Ouvre un .xls : le fichier est lu en mémoire (format binaire), mais les feuilles sont
     * ensuite parcourues en flux, sans construire le classeur (évite le chargement HSSF complet,
     * très lent sur les gros classeurs).
     */
    public POIFSFileSystem ouvrirXls(MultipartFile fichier) throws IOException {
        try (InputStream entree = fichier.getInputStream()) {
            return new POIFSFileSystem(entree);
        } catch (IOException | RuntimeException e) {
            throw new IOException("Fichier Excel illisible (.xls attendu) : " + e.getMessage(), e);
        }
    }

    /** Nombre de feuilles du classeur .xls (compte les déclarations de feuilles, sans lire les données). */
    public int compterFeuillesXls(POIFSFileSystem fs) throws IOException {
        CompteurFeuilles compteur = new CompteurFeuilles();
        HSSFRequest requete = new HSSFRequest();
        requete.addListenerForAllRecords(compteur);
        try {
            new HSSFEventFactory().processWorkbookEvents(requete, fs);
        } catch (RuntimeException e) {
            throw new IOException("Fichier Excel illisible (.xls) : " + e.getMessage(), e);
        }
        return compteur.nombre;
    }

    /** Écrit le zip en lisant le .xls en flux. Renvoie le nombre de feuilles écrites. */
    public int ecrireXls(POIFSFileSystem fs, Options options, OutputStream sortie) throws IOException {
        ZipOutputStream zip = nouveauZip(sortie);
        LecteurXls lecteur = new LecteurXls(options, zip);
        HSSFRequest requete = new HSSFRequest();
        requete.addListenerForAllRecords(lecteur.formats);
        try {
            new HSSFEventFactory().processWorkbookEvents(requete, fs);
        } catch (RuntimeException e) {
            throw new IOException("Fichier Excel illisible (.xls) : " + e.getMessage(), e);
        }
        zip.finish();
        return lecteur.feuillesEcrites;
    }

    /** Compte les déclarations de feuilles (enregistrements BoundSheet). */
    private static final class CompteurFeuilles implements HSSFListener {
        private int nombre;

        @Override
        public void processRecord(Record record) {
            if (record instanceof BoundSheetRecord) {
                nombre++;
            }
        }
    }

    /**
     * Lecteur événementiel d'un .xls : chaque cellule est écrite dès qu'elle est lue. Une feuille
     * est écrite dans son propre fichier .xlsx à la fin de sa sous-section (enregistrement EOF).
     */
    private static final class LecteurXls implements HSSFListener {
        private final Options options;
        private final ZipOutputStream zip;
        private final FormatTrackingHSSFListener formats = new FormatTrackingHSSFListener(this);
        private final List<String> nomsFeuilles = new ArrayList<>();
        private final Set<String> nomsUtilises = new HashSet<>();

        private SSTRecord chaines;
        private boolean dansFeuille;
        private int feuillesEcrites;
        private String nomCourant;
        private SXSSFWorkbook classeur;
        private Sheet cible;
        private CellStyle styleEntete;
        private CellStyle styleDate;
        private int decalage;
        private Row ligne;
        private int ligneCourante = -1;
        private FormulaRecord formulePendante;

        LecteurXls(Options options, ZipOutputStream zip) {
            this.options = options;
            this.zip = zip;
        }

        @Override
        public void processRecord(Record record) {
            try {
                traiter(record);
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }

        private void traiter(Record record) throws IOException {
            if (record instanceof BoundSheetRecord feuille) {
                nomsFeuilles.add(feuille.getSheetname());
            } else if (record instanceof SSTRecord sst) {
                chaines = sst;
            } else if (record instanceof BOFRecord bof && bof.getType() == BOFRecord.TYPE_WORKSHEET) {
                debutFeuille();
            } else if (record instanceof EOFRecord && dansFeuille) {
                finFeuille();
            } else if (!dansFeuille) {
                // hors feuille (globaux, graphiques) : rien à écrire
            } else if (record instanceof NumberRecord n) {
                ecrireNombre(n.getRow(), n.getColumn(), n.getValue(), dateFormatee(n));
            } else if (record instanceof RKRecord rk) {
                ecrireNombre(rk.getRow(), rk.getColumn(), rk.getRKNumber(), dateFormatee(rk));
            } else if (record instanceof LabelSSTRecord l) {
                ecrireTexte(l.getRow(), l.getColumn(), chaines.getString(l.getSSTIndex()).getString());
            } else if (record instanceof LabelRecord l) {
                ecrireTexte(l.getRow(), l.getColumn(), l.getValue());
            } else if (record instanceof BoolErrRecord be) {
                ecrireBoolErr(be);
            } else if (record instanceof FormulaRecord f) {
                if (f.hasCachedResultString()) {
                    formulePendante = f;
                } else {
                    ecrireNombre(f.getRow(), f.getColumn(), f.getValue(), dateFormatee(f));
                }
            } else if (record instanceof StringRecord s && formulePendante != null) {
                ecrireTexte(formulePendante.getRow(), formulePendante.getColumn(), s.getString());
                formulePendante = null;
            }
        }

        private void debutFeuille() {
            int index = feuillesEcrites;
            nomCourant = nettoyerNom(index < nomsFeuilles.size() ? nomsFeuilles.get(index) : null, index);
            classeur = new SXSSFWorkbook(FENETRE);
            cible = classeur.createSheet(tronquer(nomCourant));
            styleEntete = styleEntete(classeur);
            styleDate = styleDate(classeur);
            decalage = ecrireEntete(cible, options, index, styleEntete);
            appliquerLargeurs(cible, options);
            ligne = null;
            ligneCourante = -1;
            dansFeuille = true;
        }

        private void finFeuille() throws IOException {
            zip.putNextEntry(new ZipEntry(nomUnique(nomCourant, nomsUtilises) + ".xlsx"));
            classeur.write(zip);
            zip.closeEntry();
            classeur.close();
            classeur = null;
            dansFeuille = false;
            feuillesEcrites++;
        }

        private Row ligne(int rangee) {
            if (ligne == null || rangee != ligneCourante) {
                ligne = cible.createRow(rangee + decalage);
                ligneCourante = rangee;
            }
            return ligne;
        }

        private boolean dateFormatee(CellValueRecordInterface cellule) {
            return DateUtil.isADateFormat(formats.getFormatIndex(cellule), formats.getFormatString(cellule));
        }

        private void ecrireNombre(int rangee, int colonne, double valeur, boolean date) {
            Cell cellule = ligne(rangee).createCell(colonne);
            if (date) {
                cellule.setCellValue(DateUtil.getJavaDate(valeur));
                cellule.setCellStyle(styleDate);
            } else {
                cellule.setCellValue(valeur);
            }
        }

        private void ecrireTexte(int rangee, int colonne, String valeur) {
            if (valeur != null && !valeur.isEmpty()) {
                ligne(rangee).createCell(colonne).setCellValue(valeur);
            }
        }

        private void ecrireBoolErr(BoolErrRecord be) {
            Cell cellule = ligne(be.getRow()).createCell(be.getColumn());
            if (be.isBoolean()) {
                cellule.setCellValue(be.getBooleanValue());
            } else {
                cellule.setCellValue(FormulaError.forInt(be.getErrorValue()).getString());
            }
        }
    }

    /** Charge un classeur .xls ou .xlsx complet. */
    public Workbook charger(MultipartFile fichier) throws IOException {
        try (InputStream entree = fichier.getInputStream()) {
            return WorkbookFactory.create(entree);
        } catch (Exception e) {
            throw new IOException("Fichier Excel illisible (.xls ou .xlsx attendu) : " + e.getMessage(), e);
        }
    }

    /** Écrit le zip à partir d'un classeur chargé. Renvoie le nombre de feuilles. */
    public int ecrire(Workbook source, Options options, OutputStream sortie) throws IOException {
        int nombre = source.getNumberOfSheets();
        ZipOutputStream zip = nouveauZip(sortie);
        Set<String> nomsUtilises = new HashSet<>();
        for (int i = 0; i < nombre; i++) {
            Sheet feuille = source.getSheetAt(i);
            String nom = nettoyerNom(feuille.getSheetName(), i);
            zip.putNextEntry(new ZipEntry(nomUnique(nom, nomsUtilises) + ".xlsx"));
            ecrireFeuille(feuille, i, options, nom, zip);
            zip.closeEntry();
        }
        zip.finish();
        return nombre;
    }

    private void ecrireFeuille(Sheet source, int index, Options options, String nom, OutputStream sortie)
            throws IOException {
        try (SXSSFWorkbook classeur = new SXSSFWorkbook(FENETRE)) {
            Sheet cible = classeur.createSheet(tronquer(nom));
            CellStyle styleEntete = styleEntete(classeur);
            CellStyle styleDate = styleDate(classeur);
            int decalage = ecrireEntete(cible, options, index, styleEntete);
            appliquerLargeurs(cible, options);

            for (int r = 0; r <= source.getLastRowNum(); r++) {
                Row ligneSource = source.getRow(r);
                if (ligneSource == null) {
                    continue;
                }
                Row ligneCible = cible.createRow(r + decalage);
                for (int c = Math.max(0, ligneSource.getFirstCellNum()); c < ligneSource.getLastCellNum(); c++) {
                    Cell cellule = ligneSource.getCell(c, MissingCellPolicy.RETURN_NULL_AND_BLANK);
                    if (cellule != null) {
                        copier(cellule, ligneCible.createCell(c), styleDate);
                    }
                }
            }
            classeur.write(sortie);
            classeur.dispose();
        }
    }

    // ------------------------------------------------------------------
    // Communs
    // ------------------------------------------------------------------

    /** Insère l'en-tête personnalisé (feuilles suivant la première). Renvoie le décalage des lignes. */
    private static int ecrireEntete(Sheet cible, Options options, int index, CellStyle styleEntete) {
        if (!options.appliquerEntete() || index == 0 || options.entete().isEmpty()) {
            return 0;
        }
        Row entete = cible.createRow(0);
        for (int c = 0; c < options.entete().size(); c++) {
            Cell cellule = entete.createCell(c);
            cellule.setCellValue(options.entete().get(c));
            cellule.setCellStyle(styleEntete);
        }
        return 1;
    }

    private static void appliquerLargeurs(Sheet cible, Options options) {
        for (int c = 0; c < options.largeurs().size(); c++) {
            Double largeur = options.largeurs().get(c);
            if (largeur != null && largeur > 0) {
                // Excel : largeur en 1/256 de caractère, plafonnée à 255 caractères.
                cible.setColumnWidth(c, (int) Math.min(Math.round(largeur * 256), 255 * 256));
            }
        }
    }

    private static ZipOutputStream nouveauZip(OutputStream sortie) {
        ZipOutputStream zip = new ZipOutputStream(sortie, StandardCharsets.UTF_8);
        // Les feuilles sont déjà des .xlsx compressés : inutile de les recompresser dans le zip.
        zip.setLevel(Deflater.NO_COMPRESSION);
        return zip;
    }

    /** Copie la valeur (et non la mise en forme), en gardant les nombres, dates, booléens et erreurs. */
    private static void copier(Cell source, Cell cible, CellStyle styleDate) {
        CellType type = source.getCellType();
        if (type == CellType.FORMULA) {
            type = source.getCachedFormulaResultType();
        }
        switch (type) {
            case NUMERIC -> {
                if (DateUtil.isCellDateFormatted(source)) {
                    cible.setCellValue(source.getDateCellValue());
                    cible.setCellStyle(styleDate);
                } else {
                    cible.setCellValue(source.getNumericCellValue());
                }
            }
            case STRING -> cible.setCellValue(source.getRichStringCellValue().getString());
            case BOOLEAN -> cible.setCellValue(source.getBooleanCellValue());
            case ERROR -> cible.setCellValue(FormulaError.forInt(source.getErrorCellValue()).getString());
            default -> {
                // cellule vide : rien à copier
            }
        }
    }

    private static CellStyle styleEntete(Workbook classeur) {
        Font police = classeur.createFont();
        police.setBold(true);
        police.setColor(IndexedColors.BLACK.getIndex());
        CellStyle style = classeur.createCellStyle();
        style.setFont(police);
        style.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setAlignment(HorizontalAlignment.CENTER);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        return style;
    }

    private static CellStyle styleDate(Workbook classeur) {
        CellStyle style = classeur.createCellStyle();
        style.setDataFormat(classeur.createDataFormat().getFormat(FORMAT_DATE));
        return style;
    }

    /** Nom de feuille ou de fichier : caractères interdits remplacés, nom vide remplacé par « Feuille_n ». */
    static String nettoyerNom(String nom, int index) {
        String propre = nom == null ? "" : nom.replaceAll("[\\\\/:*?\"<>|\\[\\]]", "_").trim();
        return propre.isEmpty() ? "Feuille_" + (index + 1) : propre;
    }

    private static String tronquer(String nom) {
        return nom.length() > LONGUEUR_MAX_NOM_FEUILLE ? nom.substring(0, LONGUEUR_MAX_NOM_FEUILLE) : nom;
    }

    /** Évite d'écraser un fichier déjà écrit dans le zip : « nom (2) », « nom (3) »… */
    private static String nomUnique(String base, Set<String> utilises) {
        String candidat = base;
        int k = 2;
        while (!utilises.add(candidat.toLowerCase())) {
            candidat = base + " (" + k++ + ")";
        }
        return candidat;
    }

    /**
     * Lecteur SAX d'une feuille .xlsx : chaque cellule est écrite dès qu'elle est lue. Les valeurs
     * brutes sont gardées (pas le texte affiché) ; une cellule numérique est une date si son format
     * l'indique.
     */
    private static final class FeuilleXlsxHandler extends DefaultHandler {
        private final Sheet cible;
        private final StylesTable styles;
        private final SharedStrings chaines;
        private final int decalage;
        private final CellStyle styleDate;
        private final Map<Integer, Boolean> cacheDate = new HashMap<>();

        private Row ligne;
        private int compteurLigne;
        private String ref;
        private String type;
        private int style;
        private final StringBuilder texte = new StringBuilder();
        private boolean dansValeur;
        private boolean dansInline;
        private boolean dansTexteInline;

        FeuilleXlsxHandler(Sheet cible, StylesTable styles, SharedStrings chaines, int decalage, CellStyle styleDate) {
            this.cible = cible;
            this.styles = styles;
            this.chaines = chaines;
            this.decalage = decalage;
            this.styleDate = styleDate;
        }

        @Override
        public void startElement(String uri, String localName, String qName, Attributes attrs) {
            switch (qName) {
                case "row" -> {
                    String r = attrs.getValue("r");
                    int index = r != null ? Integer.parseInt(r) - 1 : compteurLigne;
                    compteurLigne = index + 1;
                    ligne = cible.createRow(index + decalage);
                }
                case "c" -> {
                    ref = attrs.getValue("r");
                    type = attrs.getValue("t");
                    String s = attrs.getValue("s");
                    style = s == null ? 0 : Integer.parseInt(s);
                    texte.setLength(0);
                }
                case "v" -> dansValeur = true;
                case "is" -> dansInline = true;
                case "t" -> dansTexteInline = dansInline;
                default -> {
                    // autres éléments (formules, mise en forme) : ignorés
                }
            }
        }

        @Override
        public void characters(char[] ch, int start, int length) {
            if (dansValeur || dansTexteInline) {
                texte.append(ch, start, length);
            }
        }

        @Override
        public void endElement(String uri, String localName, String qName) {
            switch (qName) {
                case "v" -> dansValeur = false;
                case "t" -> dansTexteInline = false;
                case "is" -> dansInline = false;
                case "c" -> ecrireCellule();
                case "row" -> ligne = null;
                default -> {
                    // rien à faire
                }
            }
        }

        private void ecrireCellule() {
            if (ligne == null || ref == null) {
                return;
            }
            int colonne = new CellReference(ref).getCol();
            String valeur = texte.toString();
            if (type == null || "n".equals(type)) {
                if (valeur.isEmpty()) {
                    return;
                }
                double d = Double.parseDouble(valeur);
                Cell cellule = ligne.createCell(colonne);
                if (estDate(style)) {
                    cellule.setCellValue(DateUtil.getJavaDate(d));
                    cellule.setCellStyle(styleDate);
                } else {
                    cellule.setCellValue(d);
                }
                return;
            }
            switch (type) {
                case "s" -> {
                    String texteCellule = chaines.getItemAt(Integer.parseInt(valeur)).getString();
                    ligne.createCell(colonne).setCellValue(texteCellule);
                }
                case "str", "inlineStr" -> {
                    if (!valeur.isEmpty()) {
                        ligne.createCell(colonne).setCellValue(valeur);
                    }
                }
                case "b" -> ligne.createCell(colonne).setCellValue("1".equals(valeur));
                case "e" -> ligne.createCell(colonne).setCellValue(valeur);
                default -> {
                    if (!valeur.isEmpty()) {
                        ligne.createCell(colonne).setCellValue(valeur);
                    }
                }
            }
        }

        private boolean estDate(int indexStyle) {
            return cacheDate.computeIfAbsent(indexStyle, i -> {
                XSSFCellStyle st = styles.getStyleAt(i);
                return st != null && DateUtil.isADateFormat(st.getDataFormat(), st.getDataFormatString());
            });
        }
    }
}
