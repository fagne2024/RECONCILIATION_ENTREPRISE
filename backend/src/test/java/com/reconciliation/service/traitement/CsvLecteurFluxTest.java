package com.reconciliation.service.traitement;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CsvLecteurFluxTest {

    private static List<List<String>> lire(String contenu) throws IOException {
        List<List<String>> out = new ArrayList<>();
        CsvLecteurFlux.lire(new StringReader(contenu), out::add);
        return out;
    }

    @Test
    void detecteLeSeparateurPointVirgule() {
        assertThat(CsvLecteurFlux.detecterSeparateur("ref;montant;statut")).isEqualTo(';');
    }

    @Test
    void detecteLeSeparateurVirguleEtTabulation() {
        assertThat(CsvLecteurFlux.detecterSeparateur("ref,montant,statut")).isEqualTo(',');
        assertThat(CsvLecteurFlux.detecterSeparateur("ref\tmontant\tstatut")).isEqualTo('\t');
    }

    @Test
    void ignoreLesSeparateursEntreGuillemetsPourLaDetection() {
        // Le séparateur réel est ';' ; les virgules sont dans un champ entre guillemets.
        assertThat(CsvLecteurFlux.detecterSeparateur("\"a,b,c,d,e\";x;y")).isEqualTo(';');
    }

    @Test
    void separateurParDefautSiAucunSeparateur() {
        assertThat(CsvLecteurFlux.detecterSeparateur("ligne sans separateur")).isEqualTo(';');
        assertThat(CsvLecteurFlux.detecterSeparateur(null)).isEqualTo(';');
    }

    @Test
    void lisLesLignesLF() throws IOException {
        List<List<String>> r = lire("a;b\n1;2\n3;4\n");
        assertThat(r).containsExactly(List.of("a", "b"), List.of("1", "2"), List.of("3", "4"));
    }

    @Test
    void lisLesLignesCRLF() throws IOException {
        List<List<String>> r = lire("a;b\r\n1;2\r\n");
        assertThat(r).containsExactly(List.of("a", "b"), List.of("1", "2"));
    }

    @Test
    void gereLesGuillemetsEtLeSeparateurInterne() throws IOException {
        List<List<String>> r = lire("\"ref;x\";\"montant\"\n\"1\";\"2\"\n");
        assertThat(r).containsExactly(List.of("ref;x", "montant"), List.of("1", "2"));
    }

    @Test
    void gereLesGuillemetsDoubles() throws IOException {
        List<List<String>> r = lire("a;b\n\"il a dit \"\"oui\"\"\";2\n");
        assertThat(r.get(1)).containsExactly("il a dit \"oui\"", "2");
    }

    @Test
    void gereLesRetourLigneDansUnChamp() throws IOException {
        List<List<String>> r = lire("a;b\n\"ligne1\nligne2\";2\n");
        assertThat(r).containsExactly(List.of("a", "b"), List.of("ligne1\nligne2", "2"));
    }

    @Test
    void conserveLesChampsVidesEtLesLignesVides() throws IOException {
        List<List<String>> r = lire("a;b;c\n1;;3\n\n;;\n");
        assertThat(r.get(1)).containsExactly("1", "", "3");
        assertThat(r.get(2)).containsExactly("");
        assertThat(r.get(3)).containsExactly("", "", "");
    }

    @Test
    void traiteLaDerniereLigneSansFinDeLigne() throws IOException {
        List<List<String>> r = lire("a;b\n1;2");
        assertThat(r).containsExactly(List.of("a", "b"), List.of("1", "2"));
    }

    @Test
    void preserveLesCaracteresUnicode() throws IOException {
        List<List<String>> r = lire("libellé;montant\nRéférence ✓ €;12\n");
        assertThat(r.get(0)).containsExactly("libellé", "montant");
        assertThat(r.get(1)).containsExactly("Référence ✓ €", "12");
    }

    @Test
    void lectureEnFluxSurUnGrandVolume() throws IOException {
        StringBuilder sb = new StringBuilder("ref;montant\n");
        for (int i = 0; i < 200_000; i++) {
            sb.append("R").append(i).append(';').append(i).append('\n');
        }
        int[] compte = {0};
        CsvLecteurFlux.lire(new StringReader(sb.toString()), enregistrement -> compte[0]++);
        assertThat(compte[0]).isEqualTo(200_001);
    }
}
