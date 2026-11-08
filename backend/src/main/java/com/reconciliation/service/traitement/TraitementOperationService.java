package com.reconciliation.service.traitement;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.reconciliation.tenant.TenantContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Traitement serveur d'un lot : filtres, dédoublonnage et conversions de colonnes.
 *
 * <p>Le résultat est écrit dans un <b>nouveau lot</b> : le lot source reste intact. Les
 * lignes sont lues par pages (curseur sur le numéro de ligne) et écrites par blocs, donc
 * la mémoire reste bornée, sauf l'ensemble des clés de dédoublonnage.</p>
 *
 * <p>Ordre d'application, pour chaque ligne : filtres de valeurs, puis dédoublonnage (sur
 * les valeurs d'origine), puis conversions de nombres et de dates.</p>
 */
@Service
public class TraitementOperationService {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(TraitementOperationService.class);

    private static final int TAILLE_PAGE = 5000;
    private static final int TAILLE_LOT_INSERTION = 1000;

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public TraitementOperationService(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    /** Filtre : on garde les lignes dont la colonne vaut une des valeurs listées. */
    public record FiltreValeurs(String colonne, List<String> valeurs) {
    }

    /** Opération demandée sur un lot. Toutes les listes peuvent être nulles ou vides. */
    public record Operation(List<FiltreValeurs> filtres,
                            List<String> dedoublonnerSur,
                            List<String> colonnesNombre,
                            List<String> colonnesDate,
                            String formatDate) {
    }

    /** Résultat : identifiant du nouveau lot et compteurs. */
    public record ResultatOperation(long nouveauLotId, long lignesEntree, long lignesSorties,
                                    long lignesFiltrees, long doublonsSupprimes) {
    }

    /**
     * Exécute l'opération sur le lot source et renvoie le nouveau lot.
     */
    public ResultatOperation executer(long lotSourceId, Operation operation, String utilisateur) {
        long entrepriseId = entrepriseCourante();
        verifierLot(lotSourceId, entrepriseId);
        List<String> colonnes = colonnesUnion(lotSourceId, entrepriseId);
        if (colonnes.isEmpty()) {
            throw new IllegalArgumentException("Le lot ne contient aucune colonne à traiter.");
        }
        verifierColonnes(colonnes, operation);

        long nouveauLotId = creerLotResultat(entrepriseId, utilisateur, lotSourceId);
        Set<String> clesVues = new HashSet<>();
        long entree = 0;
        long filtrees = 0;
        long doublons = 0;
        long sorties = 0;
        long curseur = 0;
        List<Object[]> bloc = new ArrayList<>(TAILLE_LOT_INSERTION);
        long fichierId = creerFichierResultat(entrepriseId, nouveauLotId, colonnes);
        try {
            while (true) {
                List<Map<String, Object>> page = jdbc.queryForList(
                        "SELECT numero, valeurs_json FROM traitement_ligne "
                                + "WHERE entreprise_id = ? AND lot_id = ? AND numero > ? ORDER BY numero LIMIT ?",
                        entrepriseId, lotSourceId, curseur, TAILLE_PAGE);
                if (page.isEmpty()) {
                    break;
                }
                for (Map<String, Object> brute : page) {
                    entree++;
                    curseur = ((Number) brute.get("numero")).longValue();
                    Map<String, Object> ligne = lireLigne((String) brute.get("valeurs_json"));
                    if (!passeFiltres(ligne, operation.filtres())) {
                        filtrees++;
                        continue;
                    }
                    if (operation.dedoublonnerSur() != null && !operation.dedoublonnerSur().isEmpty()) {
                        if (!clesVues.add(TraitementTransformations.cleDedoublonnage(operation.dedoublonnerSur(), ligne))) {
                            doublons++;
                            continue;
                        }
                    }
                    appliquerConversions(ligne, operation);
                    Map<String, Object> sortie = new LinkedHashMap<>();
                    for (String col : colonnes) {
                        sortie.put(col, ligne.containsKey(col) ? ligne.get(col) : "");
                    }
                    sorties++;
                    bloc.add(new Object[]{entrepriseId, nouveauLotId, fichierId, sorties, versJson(sortie)});
                    if (bloc.size() >= TAILLE_LOT_INSERTION) {
                        insererBloc(bloc);
                    }
                }
                if (page.size() < TAILLE_PAGE) {
                    break;
                }
            }
            insererBloc(bloc);
            jdbc.update("UPDATE traitement_fichier SET nb_lignes = ? WHERE entreprise_id = ? AND id = ?",
                    sorties, entrepriseId, fichierId);
            jdbc.update("UPDATE traitement_lot SET statut = ?, nb_fichiers = 1, nb_lignes = ? WHERE entreprise_id = ? AND id = ?",
                    TraitementLotService.STATUT_PRET, sorties, entrepriseId, nouveauLotId);
        } catch (RuntimeException e) {
            log.error("Traitement serveur : opération échouée sur le lot {}", lotSourceId, e);
            jdbc.update("UPDATE traitement_lot SET statut = ? WHERE entreprise_id = ? AND id = ?",
                    TraitementLotService.STATUT_ERREUR, entrepriseId, nouveauLotId);
            throw e;
        }
        log.info("Traitement serveur : opération sur le lot {} -> lot {} : {} lignes lues, {} conservées, {} filtrées, {} doublons",
                lotSourceId, nouveauLotId, entree, sorties, filtrees, doublons);
        return new ResultatOperation(nouveauLotId, entree, sorties, filtrees, doublons);
    }

    // ------------------------------------------------------------------

    private void appliquerConversions(Map<String, Object> ligne, Operation operation) {
        if (operation.colonnesNombre() != null) {
            for (String col : operation.colonnesNombre()) {
                if (ligne.containsKey(col)) {
                    ligne.put(col, TraitementTransformations.convertirNombre(ligne.get(col)));
                }
            }
        }
        if (operation.colonnesDate() != null) {
            for (String col : operation.colonnesDate()) {
                if (ligne.containsKey(col)) {
                    ligne.put(col, TraitementTransformations.convertirDate(ligne.get(col), operation.formatDate()));
                }
            }
        }
    }

    private static boolean passeFiltres(Map<String, Object> ligne, List<FiltreValeurs> filtres) {
        if (filtres == null) {
            return true;
        }
        for (FiltreValeurs f : filtres) {
            if (f.valeurs() == null || f.valeurs().isEmpty()) {
                continue;
            }
            if (!TraitementTransformations.appartient(ligne.get(f.colonne()), f.valeurs())) {
                return false;
            }
        }
        return true;
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
                List<String> cols = objectMapper.readValue(json,
                        objectMapper.getTypeFactory().constructCollectionType(List.class, String.class));
                union.addAll(cols);
            } catch (JsonProcessingException e) {
                throw new IllegalStateException("Colonnes du lot illisibles", e);
            }
        }
        return new ArrayList<>(union);
    }

    private void verifierColonnes(List<String> colonnes, Operation operation) {
        Set<String> connues = new HashSet<>(colonnes);
        List<String> demandees = new ArrayList<>();
        if (operation.dedoublonnerSur() != null) demandees.addAll(operation.dedoublonnerSur());
        if (operation.colonnesNombre() != null) demandees.addAll(operation.colonnesNombre());
        if (operation.colonnesDate() != null) demandees.addAll(operation.colonnesDate());
        if (operation.filtres() != null) {
            for (FiltreValeurs f : operation.filtres()) demandees.add(f.colonne());
        }
        for (String col : demandees) {
            if (col != null && !connues.contains(col)) {
                throw new IllegalArgumentException("Colonne inconnue dans le lot : « " + col + " »");
            }
        }
    }

    private long creerLotResultat(long entrepriseId, String utilisateur, long lotSourceId) {
        KeyHolder cle = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO traitement_lot (entreprise_id, uuid, statut, nb_fichiers, nb_lignes, cree_par, created_at) "
                            + "VALUES (?, ?, ?, 0, 0, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1, entrepriseId);
            ps.setString(2, UUID.randomUUID().toString());
            ps.setString(3, TraitementLotService.STATUT_EN_COURS);
            ps.setString(4, utilisateur);
            ps.setTimestamp(5, Timestamp.valueOf(LocalDateTime.now()));
            return ps;
        }, cle);
        return cle.getKey().longValue();
    }

    private long creerFichierResultat(long entrepriseId, long lotId, List<String> colonnes) {
        KeyHolder cle = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO traitement_fichier (entreprise_id, lot_id, ordre, nom, nb_lignes, colonnes_json) "
                            + "VALUES (?, ?, 1, ?, 0, ?)",
                    Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1, entrepriseId);
            ps.setLong(2, lotId);
            ps.setString(3, "Résultat du traitement");
            ps.setString(4, versJson(colonnes));
            return ps;
        }, cle);
        return cle.getKey().longValue();
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

    private Map<String, Object> lireLigne(String json) {
        try {
            return objectMapper.readValue(json,
                    objectMapper.getTypeFactory().constructMapType(LinkedHashMap.class, String.class, Object.class));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Ligne illisible", e);
        }
    }

    private String versJson(Object valeur) {
        try {
            return objectMapper.writeValueAsString(valeur);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Sérialisation impossible", e);
        }
    }
}
