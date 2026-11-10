package com.reconciliation.controller;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Fichiers modèles CSV du dossier surveillé : l'encodage doit être détecté, sinon un export
 * Latin-1 (ex. TRXBOTest.csv) donne des colonnes « T\uFFFDl\uFFFDphone client » qui ne
 * correspondent plus aux fichiers chargés (normalisation modèle, colonnes du modèle).
 */
class FileWatcherCsvCharsetTest {

    @TempDir
    Path dir;

    private File write(String name, String content, Charset charset) throws Exception {
        Path file = dir.resolve(name);
        Files.write(file, content.getBytes(charset));
        return file.toFile();
    }

    @Test
    void fichierLatin1DetecteEnWindows1252() throws Exception {
        File file = write("latin1.csv", "ID Partenaire;Téléphone client;Montant\nA;1;2\n", StandardCharsets.ISO_8859_1);
        assertEquals(Charset.forName("windows-1252"), FileWatcherController.detectCsvCharset(file));
    }

    @Test
    void fichierUtf8DetecteEnUtf8() throws Exception {
        File file = write("utf8.csv", "ID Partenaire;Téléphone client;Montant\nA;1;2\n", StandardCharsets.UTF_8);
        assertEquals(StandardCharsets.UTF_8, FileWatcherController.detectCsvCharset(file));
    }

    @Test
    void fichierAsciiDetecteEnUtf8() throws Exception {
        File file = write("ascii.csv", "ID;amount\n1;2\n", StandardCharsets.US_ASCII);
        assertEquals(StandardCharsets.UTF_8, FileWatcherController.detectCsvCharset(file));
    }
}
