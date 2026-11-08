package com.reconciliation.service.traitement;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.PushbackReader;
import java.io.Reader;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * Lecteur CSV en flux : une seule passe sur le flux, sans charger le fichier en mémoire.
 *
 * <p>Gère les champs entre guillemets (séparateur et retours ligne autorisés à l'intérieur),
 * les guillemets doublés ({@code ""}) et les fins de ligne CRLF, LF ou CR. Le séparateur
 * est détecté sur la première ligne parmi {@code ; , TAB |}.</p>
 */
public final class CsvLecteurFlux {

    private static final char[] SEPARATEURS = {';', ',', '\t', '|'};
    private static final int MARQUE_LECTURE = 1 << 20;

    private CsvLecteurFlux() {
    }

    /**
     * Détecte le séparateur sur la première ligne (hors guillemets). Par défaut : {@code ;}.
     */
    public static char detecterSeparateur(String premiereLigne) {
        if (premiereLigne == null || premiereLigne.isEmpty()) {
            return ';';
        }
        char meilleur = ';';
        int meilleurNombre = -1;
        for (char sep : SEPARATEURS) {
            int nombre = comptePourHorsGuillemets(premiereLigne, sep);
            if (nombre > meilleurNombre) {
                meilleurNombre = nombre;
                meilleur = sep;
            }
        }
        return meilleurNombre > 0 ? meilleur : ';';
    }

    /**
     * Lit le flux et transmet chaque enregistrement (liste de cellules) au consommateur.
     * Les enregistrements sont transmis tels quels, y compris les lignes vides : c'est à
     * l'appelant de les ignorer.
     */
    public static void lire(Reader source, Consumer<List<String>> consommateur) throws IOException {
        BufferedReader entree = source instanceof BufferedReader br ? br : new BufferedReader(source);
        entree.mark(MARQUE_LECTURE);
        String premiere = entree.readLine();
        entree.reset();
        char separateur = detecterSeparateur(premiere);

        PushbackReader lecteur = new PushbackReader(entree, 2);
        List<String> enregistrement = new ArrayList<>();
        StringBuilder cellule = new StringBuilder();
        boolean dansGuillemets = false;
        int c;
        while ((c = lecteur.read()) != -1) {
            char ch = (char) c;
            if (dansGuillemets) {
                if (ch == '"') {
                    int suivant = lecteur.read();
                    if (suivant == '"') {
                        cellule.append('"');
                    } else {
                        dansGuillemets = false;
                        if (suivant != -1) {
                            lecteur.unread(suivant);
                        }
                    }
                } else {
                    cellule.append(ch);
                }
            } else if (ch == '"' && cellule.length() == 0) {
                dansGuillemets = true;
            } else if (ch == separateur) {
                enregistrement.add(cellule.toString());
                cellule.setLength(0);
            } else if (ch == '\n' || ch == '\r') {
                if (ch == '\r') {
                    int suivant = lecteur.read();
                    if (suivant != '\n' && suivant != -1) {
                        lecteur.unread(suivant);
                    }
                }
                enregistrement.add(cellule.toString());
                cellule.setLength(0);
                consommateur.accept(enregistrement);
                enregistrement = new ArrayList<>();
            } else {
                cellule.append(ch);
            }
        }
        if (cellule.length() > 0 || !enregistrement.isEmpty()) {
            enregistrement.add(cellule.toString());
            consommateur.accept(enregistrement);
        }
    }

    private static int comptePourHorsGuillemets(String ligne, char sep) {
        int nombre = 0;
        boolean dansGuillemets = false;
        for (int i = 0; i < ligne.length(); i++) {
            char ch = ligne.charAt(i);
            if (ch == '"') {
                dansGuillemets = !dansGuillemets;
            } else if (!dansGuillemets && ch == sep) {
                nombre++;
            }
        }
        return nombre;
    }
}
