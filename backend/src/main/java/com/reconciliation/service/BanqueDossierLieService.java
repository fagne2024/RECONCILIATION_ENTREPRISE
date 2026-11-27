package com.reconciliation.service;

import com.reconciliation.dto.BanqueDossierLieDto;
import com.reconciliation.dto.BanqueDossierLieDto.Ligne;
import com.reconciliation.dto.BanqueDossierLieDto.LigneDetail;
import com.reconciliation.entity.BanqueDossierLieEntity;
import com.reconciliation.entity.BanqueDossierLieLigneEntity;
import com.reconciliation.entity.OperationBancaireEntity;
import com.reconciliation.entity.ReleveBancaireEntity;
import com.reconciliation.repository.BanqueDossierLieLigneRepository;
import com.reconciliation.repository.BanqueDossierLieRepository;
import com.reconciliation.repository.OperationBancaireRepository;
import com.reconciliation.repository.ReleveBancaireRepository;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Dossiers liés de la page Banque : relie des opérations bancaires (déjà rapprochées ou non) et des lignes
 * de relevé d'une même opération métier, chacune avec un rôle (appro de préfinancement et sa contrepartie,
 * frais par mémo, compense de remboursement du reliquat et sa contrepartie, frais sur le montant retourné).
 * Une ligne n'appartient qu'à un seul dossier.
 */
@Service
public class BanqueDossierLieService {

    public static final String APPRO = "APPRO";
    public static final String APPRO_CONTREPARTIE = "APPRO_CONTREPARTIE";
    public static final String FRAIS_APPRO = "FRAIS_APPRO";
    public static final String REMBOURSEMENT = "REMBOURSEMENT";
    public static final String REMBOURSEMENT_CONTREPARTIE = "REMBOURSEMENT_CONTREPARTIE";
    public static final String FRAIS_REMBOURSEMENT = "FRAIS_REMBOURSEMENT";
    public static final String AUTRE = "AUTRE";

    /** Rôles acceptés, dans l'ordre d'affichage du détail. */
    public static final List<String> ROLES = List.of(APPRO, APPRO_CONTREPARTIE, FRAIS_APPRO,
            REMBOURSEMENT, REMBOURSEMENT_CONTREPARTIE, FRAIS_REMBOURSEMENT, AUTRE);

    private static final Set<String> TYPES = Set.of(BanqueDossierLieLigneEntity.TYPE_OPERATION,
            BanqueDossierLieLigneEntity.TYPE_RELEVE);

    private final BanqueDossierLieRepository dossierRepository;
    private final BanqueDossierLieLigneRepository ligneRepository;
    private final OperationBancaireRepository operationRepository;
    private final ReleveBancaireRepository releveRepository;

    public BanqueDossierLieService(BanqueDossierLieRepository dossierRepository,
                                   BanqueDossierLieLigneRepository ligneRepository,
                                   OperationBancaireRepository operationRepository,
                                   ReleveBancaireRepository releveRepository) {
        this.dossierRepository = dossierRepository;
        this.ligneRepository = ligneRepository;
        this.operationRepository = operationRepository;
        this.releveRepository = releveRepository;
    }

    /** Tous les dossiers de l'entreprise avec leurs lignes (le tenant est appliqué automatiquement). */
    @Transactional(readOnly = true)
    public List<BanqueDossierLieDto.Resume> list() {
        Map<Long, List<Ligne>> lignesParDossier = ligneRepository.findAll().stream()
                .sorted(Comparator.comparing(BanqueDossierLieLigneEntity::getId))
                .collect(Collectors.groupingBy(BanqueDossierLieLigneEntity::getDossierId, LinkedHashMap::new,
                        Collectors.mapping(BanqueDossierLieService::toLigne, Collectors.toList())));
        return dossierRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(d -> toResume(d, lignesParDossier.getOrDefault(d.getId(), List.of())))
                .toList();
    }

    @Transactional(readOnly = true)
    public BanqueDossierLieDto.Detail detail(Long id) {
        BanqueDossierLieEntity dossier = dossierRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Dossier lié introuvable : " + id));
        List<BanqueDossierLieLigneEntity> lignes = ligneRepository.findByDossierIdOrderByIdAsc(id);

        Map<Long, OperationBancaireEntity> ops = operationRepository.findAllById(idsDuType(lignes,
                        BanqueDossierLieLigneEntity.TYPE_OPERATION)).stream()
                .collect(Collectors.toMap(OperationBancaireEntity::getId, Function.identity()));
        Map<Long, ReleveBancaireEntity> releves = releveRepository.findAllById(idsDuType(lignes,
                        BanqueDossierLieLigneEntity.TYPE_RELEVE)).stream()
                .collect(Collectors.toMap(ReleveBancaireEntity::getId, Function.identity()));

        List<LigneDetail> details = lignes.stream()
                .sorted(Comparator.comparingInt((BanqueDossierLieLigneEntity l) -> ordreRole(l.getRole()))
                        .thenComparing(BanqueDossierLieLigneEntity::getId))
                .map(l -> {
                    boolean isOp = BanqueDossierLieLigneEntity.TYPE_OPERATION.equals(l.getTypeLigne());
                    OperationBancaireEntity op = isOp ? ops.get(l.getLigneId()) : null;
                    ReleveBancaireEntity rev = isOp ? null : releves.get(l.getLigneId());
                    Double montant = op != null ? montantOperation(op) : rev != null ? montantReleve(rev) : null;
                    return new LigneDetail(l.getTypeLigne(), l.getLigneId(), l.getRole(), montant, op, rev);
                })
                .toList();

        Map<String, Double> totaux = totauxParRole(details);
        return new BanqueDossierLieDto.Detail(
                toResume(dossier, lignes.stream().map(BanqueDossierLieService::toLigne).toList()),
                details, totaux, synthese(totaux));
    }

    /**
     * Crée (id null) ou modifie un dossier ; les lignes envoyées remplacent celles du dossier.
     * Une ligne déjà dans un autre dossier est refusée, sauf avec {@code deplacer=true} : elle y est retirée
     * (et un dossier qui se retrouve vide est supprimé).
     */
    @Transactional
    public BanqueDossierLieDto.Resume save(Long id, BanqueDossierLieDto.SaveRequest req, String username) {
        if (req == null) throw new IllegalArgumentException("Requête vide");
        String libelle = req.libelle() == null ? "" : req.libelle().trim();
        if (libelle.isEmpty()) throw new IllegalArgumentException("Le libellé du dossier est obligatoire");
        if (libelle.length() > 255) throw new IllegalArgumentException("Libellé trop long (255 caractères max)");
        String commentaire = req.commentaire() == null || req.commentaire().isBlank() ? null : req.commentaire().trim();
        if (commentaire != null && commentaire.length() > 1000) {
            throw new IllegalArgumentException("Commentaire trop long (1000 caractères max)");
        }
        List<Ligne> lignes = normaliserLignes(req.lignes());
        if (lignes.size() < 2) throw new IllegalArgumentException("Un dossier lié doit contenir au moins deux lignes");
        verifierExistence(lignes);

        BanqueDossierLieEntity dossier;
        LocalDateTime now = LocalDateTime.now();
        if (id == null) {
            dossier = new BanqueDossierLieEntity();
            dossier.setCreatedAt(now);
            dossier.setCreatedBy(username);
        } else {
            dossier = dossierRepository.findById(id)
                    .orElseThrow(() -> new EntityNotFoundException("Dossier lié introuvable : " + id));
            dossier.setUpdatedAt(now);
            dossier.setUpdatedBy(username);
        }
        dossier.setLibelle(libelle);
        dossier.setCommentaire(commentaire);
        dossier = dossierRepository.save(dossier);
        Long dossierId = dossier.getId();

        // Lignes déjà rattachées à un autre dossier
        List<BanqueDossierLieLigneEntity> existantes = new ArrayList<>();
        for (String type : TYPES) {
            List<Long> ids = lignes.stream().filter(l -> l.typeLigne().equals(type)).map(Ligne::ligneId).toList();
            if (!ids.isEmpty()) existantes.addAll(ligneRepository.findByTypeLigneAndLigneIdIn(type, ids));
        }
        List<BanqueDossierLieLigneEntity> conflits = existantes.stream()
                .filter(e -> !e.getDossierId().equals(dossierId)).toList();
        if (!conflits.isEmpty()) {
            if (!Boolean.TRUE.equals(req.deplacer())) {
                Set<Long> autres = conflits.stream().map(BanqueDossierLieLigneEntity::getDossierId)
                        .collect(Collectors.toCollection(TreeSet::new));
                String noms = dossierRepository.findAllById(autres).stream()
                        .map(d -> "« " + d.getLibelle() + " » (#" + d.getId() + ")").collect(Collectors.joining(", "));
                throw new IllegalArgumentException(conflits.size()
                        + " ligne(s) appartiennent déjà à un autre dossier : " + noms);
            }
            ligneRepository.deleteAll(conflits);
            ligneRepository.flush();
        }

        ligneRepository.deleteByDossierId(dossierId);
        ligneRepository.flush();
        for (Ligne l : lignes) {
            BanqueDossierLieLigneEntity e = new BanqueDossierLieLigneEntity();
            e.setDossierId(dossierId);
            e.setTypeLigne(l.typeLigne());
            e.setLigneId(l.ligneId());
            e.setRole(l.role());
            ligneRepository.save(e);
        }

        // Dossiers vidés par le déplacement : moins de deux lignes, ils n'ont plus de sens
        conflits.stream().map(BanqueDossierLieLigneEntity::getDossierId).distinct().forEach(autreId -> {
            if (ligneRepository.findByDossierIdOrderByIdAsc(autreId).size() < 2) {
                ligneRepository.deleteByDossierId(autreId);
                dossierRepository.deleteById(autreId);
            }
        });
        return toResume(dossier, lignes);
    }

    @Transactional
    public void delete(Long id) {
        if (!dossierRepository.existsById(id)) throw new EntityNotFoundException("Dossier lié introuvable : " + id);
        ligneRepository.deleteByDossierId(id);
        dossierRepository.deleteById(id);
    }

    // ----- Calculs (statiques, testés unitairement) -----

    /** Montant d'une opération en valeur absolue. */
    static double montantOperation(OperationBancaireEntity op) {
        return op.getMontant() == null ? 0d : Math.abs(op.getMontant());
    }

    /** Montant d'une ligne de relevé en valeur absolue : débit, sinon crédit, sinon montant. */
    static double montantReleve(ReleveBancaireEntity r) {
        if (r.getDebit() != null && r.getDebit() != 0d) return Math.abs(r.getDebit());
        if (r.getCredit() != null && r.getCredit() != 0d) return Math.abs(r.getCredit());
        return r.getMontant() == null ? 0d : Math.abs(r.getMontant());
    }

    static Map<String, Double> totauxParRole(List<LigneDetail> lignes) {
        Map<String, Double> totaux = new LinkedHashMap<>();
        ROLES.forEach(r -> totaux.put(r, 0d));
        for (LigneDetail l : lignes) {
            if (l.montant() == null) continue;
            totaux.merge(l.role(), l.montant(), Double::sum);
        }
        totaux.replaceAll((k, v) -> arrondi(v));
        return totaux;
    }

    /**
     * Montant utilisé du préfinancement = appro − remboursement du reliquat.
     * Tout le préfinancement n'étant pas forcément utilisé, le total des frais retenu est celui des frais sur le
     * montant utilisé ; les frais de l'appro (prévus sur tout le préfinancement) restent indiqués, avec la différence.
     */
    static BanqueDossierLieDto.Synthese synthese(Map<String, Double> t) {
        double appro = t.getOrDefault(APPRO, 0d);
        double approCp = t.getOrDefault(APPRO_CONTREPARTIE, 0d);
        double fraisAppro = t.getOrDefault(FRAIS_APPRO, 0d);
        double remb = t.getOrDefault(REMBOURSEMENT, 0d);
        double rembCp = t.getOrDefault(REMBOURSEMENT_CONTREPARTIE, 0d);
        double fraisRemb = t.getOrDefault(FRAIS_REMBOURSEMENT, 0d);
        return new BanqueDossierLieDto.Synthese(appro, approCp, arrondi(appro - approCp), fraisAppro, remb, rembCp,
                arrondi(remb - rembCp), fraisRemb, fraisRemb, arrondi(fraisAppro - fraisRemb), arrondi(appro - remb),
                t.getOrDefault(AUTRE, 0d));
    }

    // ----- Utilitaires -----

    private List<Ligne> normaliserLignes(List<Ligne> lignes) {
        if (lignes == null) return List.of();
        Map<String, Ligne> uniques = new LinkedHashMap<>();
        for (Ligne l : lignes) {
            if (l == null || l.ligneId() == null) throw new IllegalArgumentException("Ligne sans identifiant");
            String type = l.typeLigne() == null ? "" : l.typeLigne().trim().toUpperCase(Locale.ROOT);
            if (!TYPES.contains(type)) throw new IllegalArgumentException("Type de ligne inconnu : " + l.typeLigne());
            String role = l.role() == null || l.role().isBlank() ? AUTRE : l.role().trim().toUpperCase(Locale.ROOT);
            if (!ROLES.contains(role)) throw new IllegalArgumentException("Rôle inconnu : " + l.role());
            uniques.put(type + ":" + l.ligneId(), new Ligne(type, l.ligneId(), role));
        }
        return new ArrayList<>(uniques.values());
    }

    /** Les lignes doivent exister dans l'entreprise courante (findAllById est filtré par le tenant). */
    private void verifierExistence(List<Ligne> lignes) {
        Set<Long> opIds = lignes.stream().filter(l -> BanqueDossierLieLigneEntity.TYPE_OPERATION.equals(l.typeLigne()))
                .map(Ligne::ligneId).collect(Collectors.toSet());
        Set<Long> revIds = lignes.stream().filter(l -> BanqueDossierLieLigneEntity.TYPE_RELEVE.equals(l.typeLigne()))
                .map(Ligne::ligneId).collect(Collectors.toSet());
        if (!opIds.isEmpty() && operationRepository.findAllById(opIds).size() != opIds.size()) {
            throw new IllegalArgumentException("Opération bancaire introuvable dans la sélection");
        }
        if (!revIds.isEmpty() && releveRepository.findAllById(revIds).size() != revIds.size()) {
            throw new IllegalArgumentException("Ligne de relevé introuvable dans la sélection");
        }
    }

    private static List<Long> idsDuType(List<BanqueDossierLieLigneEntity> lignes, String type) {
        return lignes.stream().filter(l -> type.equals(l.getTypeLigne()))
                .map(BanqueDossierLieLigneEntity::getLigneId).toList();
    }

    private static int ordreRole(String role) {
        int i = ROLES.indexOf(role);
        return i < 0 ? ROLES.size() : i;
    }

    private static double arrondi(double v) {
        return Math.round(v * 100d) / 100d;
    }

    private static Ligne toLigne(BanqueDossierLieLigneEntity e) {
        return new Ligne(e.getTypeLigne(), e.getLigneId(), e.getRole());
    }

    private static BanqueDossierLieDto.Resume toResume(BanqueDossierLieEntity d, List<Ligne> lignes) {
        return new BanqueDossierLieDto.Resume(d.getId(), d.getLibelle(), d.getCommentaire(), d.getCreatedBy(),
                d.getCreatedAt(), d.getUpdatedBy(), d.getUpdatedAt(), lignes);
    }
}
