package com.reconciliation.service.traitement;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.reconciliation.tenant.TenantContext;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;

/**
 * Stockage serveur des lignes d'un traitement, par lot et par fichier.
 *
 * <p>Les tables sont accédées par {@link JdbcTemplate} (insertion en lots, pas de contexte
 * Hibernate à maintenir). L'isolation entre entreprises est donc assurée ici : chaque
 * requête filtre sur {@code entreprise_id} = entreprise courante.</p>
 */
@Service
public class TraitementLotService {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(TraitementLotService.class);

    public static final String STATUT_EN_COURS = "EN_COURS";
    public static final String STATUT_PRET = "PRET";
    public static final String STATUT_ERREUR = "ERREUR";

    private static final int TAILLE_LOT_INSERTION = 1000;
    private static final int TAILLE_SUPPRESSION = 50000;
    private static final int TAILLE_PAGE_MAX = 5000;

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public TraitementLotService(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    /** Crée un lot vide pour l'entreprise courante et renvoie son identifiant. */
    public long creerLot(String utilisateur) {
        long entrepriseId = entrepriseCourante();
        KeyHolder cle = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO traitement_lot (entreprise_id, uuid, statut, nb_fichiers, nb_lignes, cree_par, created_at) "
                            + "VALUES (?, ?, ?, 0, 0, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1, entrepriseId);
            ps.setString(2, UUID.randomUUID().toString());
            ps.setString(3, STATUT_EN_COURS);
            ps.setString(4, utilisateur);
            ps.setTimestamp(5, Timestamp.valueOf(LocalDateTime.now()));
            return ps;
        }, cle);
        log.info("Traitement serveur : lot créé (entreprise={}, utilisateur={})", entrepriseId, utilisateur);
        return cle.getKey().longValue();
    }

    /**
     * Ajoute un fichier au lot : lecture en flux, insertion par blocs de
     * {@value #TAILLE_LOT_INSERTION} lignes. En cas d'échec, les lignes déjà insérées
     * pour ce fichier sont supprimées.
     */
    public Map<String, Object> ajouterFichier(long lotId, MultipartFile fichier) {
        long entrepriseId = entrepriseCourante();
        verifierLot(lotId, entrepriseId);
        String nom = fichier.getOriginalFilename() != null ? fichier.getOriginalFilename() : "fichier";

        Long ordre = jdbc.queryForObject(
                "SELECT COUNT(*) + 1 FROM traitement_fichier WHERE entreprise_id = ? AND lot_id = ?",
                Long.class, entrepriseId, lotId);
        KeyHolder cle = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO traitement_fichier (entreprise_id, lot_id, ordre, nom, nb_lignes) VALUES (?, ?, ?, ?, 0)",
                    Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1, entrepriseId);
            ps.setLong(2, lotId);
            ps.setLong(3, ordre);
            ps.setString(4, tronquer(nom, 255));
            return ps;
        }, cle);
        long fichierId = cle.getKey().longValue();

        log.info("Traitement serveur : réception du fichier « {} » ({} o) dans le lot {}", nom, fichier.getSize(), lotId);
        long debut = System.currentTimeMillis();
        try {
            Map<String, Object> resultat = lireEtInserer(lotId, fichierId, entrepriseId, fichier, nom, ordre, lecteurPour(nom));
            log.info("Traitement serveur : fichier « {} » stocké — {} lignes, {} colonnes, {} ms",
                    nom, resultat.get("nbLignes"), ((List<?>) resultat.get("colonnes")).size(), System.currentTimeMillis() - debut);
            return resultat;
        } catch (IOException io) {
            log.error("Traitement serveur : lecture impossible du fichier « {} » (lot {})", nom, lotId, io);
            nettoyerFichierEchoue(lotId, fichierId, entrepriseId);
            throw new IllegalArgumentException("Lecture impossible du fichier « " + nom + " » : " + io.getMessage(), io);
        } catch (RuntimeException e) {
            log.error("Traitement serveur : échec du fichier « {} » (lot {})", nom, lotId, e);
            nettoyerFichierEchoue(lotId, fichierId, entrepriseId);
            throw e;
        } catch (Error e) {
            // OutOfMemoryError & co : sans ce bloc, l'échec n'apparaît dans aucun log.
            log.error("Traitement serveur : erreur système sur le fichier « {} » (lot {}) après {} ms",
                    nom, lotId, System.currentTimeMillis() - debut, e);
            nettoyerFichierEchoue(lotId, fichierId, entrepriseId);
            throw e;
        }
    }

    /** Résumé du lot : statut, fichiers et colonnes. */
    public Map<String, Object> resume(long lotId) {
        long entrepriseId = entrepriseCourante();
        Map<String, Object> lot = jdbc.queryForMap(
                "SELECT id, uuid, statut, nb_fichiers, nb_lignes, created_at FROM traitement_lot WHERE entreprise_id = ? AND id = ?",
                entrepriseId, lotId);
        List<Map<String, Object>> fichiers = jdbc.queryForList(
                "SELECT id, ordre, nom, nb_lignes, colonnes_json FROM traitement_fichier "
                        + "WHERE entreprise_id = ? AND lot_id = ? ORDER BY ordre",
                entrepriseId, lotId);
        List<Map<String, Object>> sortie = new ArrayList<>();
        for (Map<String, Object> f : fichiers) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", f.get("id"));
            item.put("ordre", f.get("ordre"));
            item.put("nom", f.get("nom"));
            item.put("nbLignes", f.get("nb_lignes"));
            item.put("colonnes", lireColonnes((String) f.get("colonnes_json")));
            sortie.add(item);
        }
        Map<String, Object> reponse = new LinkedHashMap<>();
        reponse.put("lotId", lot.get("id"));
        reponse.put("uuid", lot.get("uuid"));
        reponse.put("statut", lot.get("statut"));
        reponse.put("nbFichiers", lot.get("nb_fichiers"));
        reponse.put("nbLignes", lot.get("nb_lignes"));
        reponse.put("fichiers", sortie);
        return reponse;
    }

    /**
     * Page de lignes, triée par numéro de ligne dans le lot. {@code apresNumero} est le
     * dernier numéro reçu (0 pour la première page) : pagination par curseur, sans OFFSET.
     */
    public Map<String, Object> lignes(long lotId, long apresNumero, int taille) {
        long entrepriseId = entrepriseCourante();
        verifierLot(lotId, entrepriseId);
        int limite = Math.max(1, Math.min(taille, TAILLE_PAGE_MAX));
        List<Map<String, Object>> brutes = jdbc.queryForList(
                "SELECT numero, fichier_id, valeurs_json FROM traitement_ligne "
                        + "WHERE entreprise_id = ? AND lot_id = ? AND numero > ? ORDER BY numero LIMIT ?",
                entrepriseId, lotId, apresNumero, limite);
        List<Map<String, Object>> lignes = new ArrayList<>(brutes.size());
        long dernier = apresNumero;
        for (Map<String, Object> b : brutes) {
            Map<String, Object> ligne = new LinkedHashMap<>();
            long numero = ((Number) b.get("numero")).longValue();
            ligne.put("numero", numero);
            ligne.put("fichierId", b.get("fichier_id"));
            ligne.put("valeurs", lireValeurs((String) b.get("valeurs_json")));
            lignes.add(ligne);
            dernier = numero;
        }
        Map<String, Object> page = new LinkedHashMap<>();
        page.put("lignes", lignes);
        page.put("curseurSuivant", brutes.size() < limite ? null : dernier);
        return page;
    }

    /** Supprime le lot, ses fichiers et ses lignes (par blocs, pour ne pas bloquer la table). */
    public void supprimerLot(long lotId) {
        long entrepriseId = entrepriseCourante();
        verifierLot(lotId, entrepriseId);
        int supprimees;
        do {
            supprimees = jdbc.update(
                    "DELETE FROM traitement_ligne WHERE entreprise_id = ? AND lot_id = ? LIMIT " + TAILLE_SUPPRESSION,
                    entrepriseId, lotId);
        } while (supprimees == TAILLE_SUPPRESSION);
        jdbc.update("DELETE FROM traitement_fichier WHERE entreprise_id = ? AND lot_id = ?", entrepriseId, lotId);
        jdbc.update("DELETE FROM traitement_lot WHERE entreprise_id = ? AND id = ?", entrepriseId, lotId);
        log.info("Traitement serveur : lot {} supprimé (entreprise={})", lotId, entrepriseId);
    }

    // ------------------------------------------------------------------
    // Internes
    // ------------------------------------------------------------------

    private Map<String, Object> lireEtInserer(long lotId, long fichierId, long entrepriseId,
                                              MultipartFile fichier, String nom, long ordre,
                                              FluxLecteur lecteur) throws IOException {
        long numeroDebut = nombreLignesLot(lotId, entrepriseId) + 1;
        // Compteur mutable partagé avec la callback de lecture (une variable locale ne peut pas l'être).
        long[] compteur = {0L};
        List<String>[] entete = new List[1];
        List<Object[]> lot = new ArrayList<>(TAILLE_LOT_INSERTION);

        // Lecture en flux : la callback reçoit chaque enregistrement sans accumulation.
        try (InputStream entree = fichier.getInputStream()) {
            lecteur.lire(entree, enregistrement -> {
                // Enregistrement vide : ignoré.
                if (enregistrement.stream().allMatch(c -> c == null || c.isBlank())) {
                    return;
                }
                if (entete[0] == null) {
                    entete[0] = nettoyerEntete(enregistrement);
                    return;
                }
                Map<String, Object> valeurs = new LinkedHashMap<>();
                List<String> cols = entete[0];
                for (int i = 0; i < cols.size(); i++) {
                    String v = i < enregistrement.size() ? enregistrement.get(i) : "";
                    valeurs.put(cols.get(i), v == null ? "" : v);
                }
                lot.add(new Object[]{entrepriseId, lotId, fichierId, numeroDebut + compteur[0], versJson(valeurs)});
                compteur[0]++;
                if (lot.size() >= TAILLE_LOT_INSERTION) {
                    insererBloc(lot);
                }
            });
        }
        insererBloc(lot);
        long lignesFichier = compteur[0];
        List<String> colonnes = entete[0];
        if (colonnes == null) {
            throw new IllegalArgumentException("Le fichier « " + nom + " » est vide ou ne contient pas d'en-tête.");
        }

        jdbc.update("UPDATE traitement_fichier SET nb_lignes = ?, colonnes_json = ? WHERE entreprise_id = ? AND id = ?",
                lignesFichier, versJson(colonnes), entrepriseId, fichierId);
        jdbc.update("UPDATE traitement_lot SET nb_fichiers = nb_fichiers + 1, nb_lignes = nb_lignes + ? "
                        + "WHERE entreprise_id = ? AND id = ?",
                lignesFichier, entrepriseId, lotId);

        Map<String, Object> resultat = new LinkedHashMap<>();
        resultat.put("fichierId", fichierId);
        resultat.put("ordre", ordre);
        resultat.put("nom", nom);
        resultat.put("nbLignes", lignesFichier);
        resultat.put("colonnes", colonnes);
        return resultat;
    }

    /** Lecteur de flux : transmet les enregistrements (cellules) d'un fichier. */
    @FunctionalInterface
    interface FluxLecteur {
        void lire(InputStream entree, Consumer<List<String>> consommateur) throws IOException;
    }

    /** Choisit le lecteur d'après l'extension : Excel (.xlsx/.xlsm) en flux, sinon CSV. */
    static FluxLecteur lecteurPour(String nom) {
        String minuscules = nom.toLowerCase();
        if (minuscules.endsWith(".xlsx") || minuscules.endsWith(".xlsm")) {
            return ExcelLecteurFlux::lire;
        }
        if (minuscules.endsWith(".xls")) {
            throw new IllegalArgumentException("Le format .xls (ancien Excel) n'est pas pris en charge : "
                    + "enregistrez le fichier au format .xlsx ou CSV.");
        }
        return (entree, consommateur) ->
                CsvLecteurFlux.lire(retirerBom(new InputStreamReader(entree, StandardCharsets.UTF_8)), consommateur);
    }

    private void insererBloc(List<Object[]> bloc) {
        if (bloc.isEmpty()) {
            return;
        }
        jdbc.batchUpdate(
                "INSERT INTO traitement_ligne (entreprise_id, lot_id, fichier_id, numero, valeurs_json) VALUES (?, ?, ?, ?, ?)",
                bloc);
        bloc.clear();
    }

    private void nettoyerFichierEchoue(long lotId, long fichierId, long entrepriseId) {
        try {
            jdbc.update("DELETE FROM traitement_ligne WHERE entreprise_id = ? AND fichier_id = ?", entrepriseId, fichierId);
            jdbc.update("DELETE FROM traitement_fichier WHERE entreprise_id = ? AND id = ?", entrepriseId, fichierId);
        } catch (DataAccessException ignore) {
            // Le nettoyage est best-effort : l'erreur d'origine est celle à remonter.
        }
    }

    private long nombreLignesLot(long lotId, long entrepriseId) {
        Long n = jdbc.queryForObject(
                "SELECT COALESCE(MAX(numero), 0) FROM traitement_ligne WHERE entreprise_id = ? AND lot_id = ?",
                Long.class, entrepriseId, lotId);
        return n == null ? 0 : n;
    }

    private void verifierLot(long lotId, long entrepriseId) {
        Integer existe = jdbc.queryForObject(
                "SELECT COUNT(*) FROM traitement_lot WHERE entreprise_id = ? AND id = ?",
                Integer.class, entrepriseId, lotId);
        if (existe == null || existe == 0) {
            throw new IllegalArgumentException("Lot de traitement introuvable : " + lotId);
        }
    }

    private static long entrepriseCourante() {
        Long id = TenantContext.get();
        if (id == null || id.equals(TenantContext.NO_TENANT)) {
            throw new SecurityException("Entreprise non identifiée pour ce traitement.");
        }
        return id;
    }

    private static List<String> nettoyerEntete(List<String> brut) {
        List<String> entete = new ArrayList<>(brut.size());
        for (int i = 0; i < brut.size(); i++) {
            String nom = brut.get(i) == null ? "" : brut.get(i).trim();
            if (i == 0 && nom.startsWith("﻿")) {
                nom = nom.substring(1).trim();
            }
            entete.add(nom.isEmpty() ? "Col" + (i + 1) : nom);
        }
        return entete;
    }

    private static Reader retirerBom(Reader lecteur) throws IOException {
        java.io.PushbackReader pb = new java.io.PushbackReader(lecteur, 1);
        int premier = pb.read();
        if (premier != -1 && premier != '﻿') {
            pb.unread(premier);
        }
        return pb;
    }

    private String versJson(Object valeur) {
        try {
            return objectMapper.writeValueAsString(valeur);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Sérialisation impossible", e);
        }
    }

    private List<String> lireColonnes(String json) {
        if (json == null) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, objectMapper.getTypeFactory().constructCollectionType(List.class, String.class));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Colonnes illisibles", e);
        }
    }

    private Map<String, Object> lireValeurs(String json) {
        try {
            return objectMapper.readValue(json, objectMapper.getTypeFactory().constructMapType(LinkedHashMap.class, String.class, Object.class));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Ligne illisible", e);
        }
    }

    private static String tronquer(String valeur, int max) {
        return valeur.length() <= max ? valeur : valeur.substring(0, max);
    }
}
