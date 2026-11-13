package com.reconciliation.service;

import com.reconciliation.dto.OperationBancaireAuditDto;
import com.reconciliation.entity.OperationBancaireAuditEntity;
import com.reconciliation.entity.OperationBancaireEntity;
import com.reconciliation.repository.OperationBancaireAuditRepository;
import com.reconciliation.util.RequestContextUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * Historique des actions par opération bancaire (qui a fait quoi et quand), et dernière action
 * (utilisateur + date) portée par la ligne.
 */
@Service
public class OperationBancaireAuditService {

    public static final String CREATION = "CREATION";
    public static final String CHANGEMENT_STATUT = "CHANGEMENT_STATUT";
    public static final String CLOTURE = "CLOTURE";
    public static final String CHANGEMENT_TRAITEMENT = "CHANGEMENT_TRAITEMENT";
    public static final String VALIDATION_TERMINE = "VALIDATION_TERMINE";
    public static final String COMMENTAIRE = "COMMENTAIRE";
    public static final String BANQUE_CORRIGEE = "BANQUE_CORRIGEE";
    public static final String STATUT_RECONCILIATION = "STATUT_RECONCILIATION";
    public static final String MODIFICATION = "MODIFICATION";
    public static final String CONTROLE_BANQUE = "CONTROLE_BANQUE";

    /** Statut posé par le bouton « Clôturer ». */
    public static final String STATUT_CLOTURE = "Clôturée";

    @Autowired
    private OperationBancaireAuditRepository auditRepository;

    @Autowired
    private com.reconciliation.repository.OperationBancaireRepository operationRepository;

    /** Actions agrégées par utilisateur / type sur la période [debut, fin[. */
    @Transactional(readOnly = true)
    public List<com.reconciliation.dto.OperationBancaireAuditStatDto> summarize(LocalDateTime debut, LocalDateTime fin) {
        return auditRepository.summarize(debut, fin);
    }

    /** Journalise la création de plusieurs opérations déjà enregistrées (import de fichier). */
    @Transactional
    public void logCreations(List<OperationBancaireEntity> ops, String detail) {
        if (ops == null || ops.isEmpty()) return;
        String username = RequestContextUtil.getUsernameFromRequest();
        LocalDateTime now = LocalDateTime.now();
        List<OperationBancaireAuditEntity> rows = new ArrayList<>();
        List<OperationBancaireEntity> touched = new ArrayList<>();
        for (OperationBancaireEntity op : ops) {
            if (op == null || op.getId() == null) continue;
            OperationBancaireAuditEntity row = new OperationBancaireAuditEntity();
            row.setOperationId(op.getId());
            row.setActionType(CREATION);
            row.setUsername(username);
            row.setStatutSnapshot(op.getStatut());
            row.setTraitementSnapshot(op.getTraitement());
            row.setDetail(detail);
            row.setCreatedAt(now);
            rows.add(row);
            op.setLastActionUser(username);
            op.setLastActionAt(now);
            touched.add(op);
        }
        auditRepository.saveAll(rows);
        operationRepository.saveAll(touched);
    }

    @Transactional(readOnly = true)
    public List<OperationBancaireAuditDto> listHistory(Long operationId) {
        return auditRepository.findByOperationIdOrderByCreatedAtAsc(operationId).stream()
                .map(e -> new OperationBancaireAuditDto(e.getId(), e.getActionType(), e.getUsername(),
                        e.getStatutSnapshot(), e.getTraitementSnapshot(), e.getDetail(), e.getCreatedAt()))
                .collect(Collectors.toList());
    }

    /** Valeurs suivies avant modification (comparées ensuite au résultat). */
    public static Map<String, String> snapshot(OperationBancaireEntity e) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("statut", e.getStatut());
        m.put("traitement", e.getTraitement());
        m.put("commentaire", e.getCommentaire());
        m.put("banqueCorrigee", e.getBanqueCorrigee());
        m.put("pays", e.getPays());
        m.put("date", Objects.toString(e.getDateOperation(), null));
        m.put("agence", e.getAgence());
        m.put("type", e.getTypeOperation());
        m.put("bénéficiaire", e.getNomBeneficiaire());
        m.put("compte", e.getCompteADebiter());
        m.put("montant", Objects.toString(e.getMontant(), null));
        m.put("mode de paiement", e.getModePaiement());
        m.put("référence", e.getReference());
        m.put("ticket", e.getIdGlpi());
        m.put("banque", e.getBo());
        m.put("demandeur", e.getDemandeur());
        m.put("valideur", e.getValideur());
        return m;
    }

    /** Enregistre une action et met à jour la dernière action de l'opération (non sauvegardée ici). */
    @Transactional
    public void log(OperationBancaireEntity op, String actionType, String detail) {
        if (op == null || op.getId() == null) return;
        String username = RequestContextUtil.getUsernameFromRequest();
        LocalDateTime now = LocalDateTime.now();
        OperationBancaireAuditEntity row = new OperationBancaireAuditEntity();
        row.setOperationId(op.getId());
        row.setActionType(actionType);
        row.setUsername(username);
        row.setStatutSnapshot(op.getStatut());
        row.setTraitementSnapshot(op.getTraitement());
        row.setDetail(detail != null && detail.length() > 4000 ? detail.substring(0, 3997) + "..." : detail);
        row.setCreatedAt(now);
        auditRepository.save(row);
        op.setLastActionUser(username);
        op.setLastActionAt(now);
    }

    /** Compare l'état avant / après et journalise chaque changement (statut, traitement, commentaire, banque corrigée, autres). */
    @Transactional
    public void logDiff(Map<String, String> before, OperationBancaireEntity after) {
        if (before == null || after == null || after.getId() == null) return;
        Map<String, String> now = snapshot(after);

        if (changed(before, now, "statut")) {
            String detail = display(before.get("statut")) + " → " + display(now.get("statut"));
            log(after, STATUT_CLOTURE.equalsIgnoreCase(now.get("statut")) ? CLOTURE : CHANGEMENT_STATUT, detail);
        }
        if (changed(before, now, "traitement")) {
            String detail = display(before.get("traitement")) + " → " + display(now.get("traitement"));
            boolean termine = "Terminé".equalsIgnoreCase(now.get("traitement") == null ? "" : now.get("traitement").trim());
            log(after, termine ? VALIDATION_TERMINE : CHANGEMENT_TRAITEMENT, detail);
        }
        if (changed(before, now, "commentaire")) {
            log(after, COMMENTAIRE, "Commentaire mis à jour : " + display(now.get("commentaire")));
        }
        if (changed(before, now, "banqueCorrigee")) {
            log(after, BANQUE_CORRIGEE, display(before.get("banqueCorrigee")) + " → " + display(now.get("banqueCorrigee")));
        }
        List<String> others = new ArrayList<>();
        for (String key : now.keySet()) {
            if (List.of("statut", "traitement", "commentaire", "banqueCorrigee").contains(key)) continue;
            if (changed(before, now, key)) {
                others.add(key + " : " + display(before.get(key)) + " → " + display(now.get(key)));
            }
        }
        if (!others.isEmpty()) {
            log(after, MODIFICATION, String.join("; ", others));
        }
    }

    private static boolean changed(Map<String, String> a, Map<String, String> b, String key) {
        return !norm(a.get(key)).equals(norm(b.get(key)));
    }

    private static String norm(String s) {
        return s == null ? "" : s.trim();
    }

    private static String display(String s) {
        return s == null || s.isBlank() ? "—" : s;
    }
}
